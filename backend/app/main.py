from contextlib import asynccontextmanager
import logging
import os
from fastapi import Depends, FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .routers import portfolio, risk, trades, status
from .routers import auth, broker, market, positions, admin, stooq_proxy, session
from .db import close_pool, database_ping, ensure_schema, storage_diagnostics
from .migrations import apply_migrations
from .security import require_admin, require_viewer, validate_security_configuration

_log_path = settings.log_path
try:
    log_dir = os.path.dirname(os.path.abspath(_log_path))
    if log_dir:
        os.makedirs(log_dir, exist_ok=True)
    logging.basicConfig(
        filename=_log_path,
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
except Exception:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger(__name__).warning("Failed to initialize file logging at %s.", _log_path)

def _is_production_runtime() -> bool:
    env = os.getenv("ENVIRONMENT", "").strip().lower()
    return env in {"production", "prod"} or bool(os.getenv("RENDER"))


def _assert_persistent_storage_configured() -> None:
    if _is_production_runtime() and not settings.db_url:
        raise RuntimeError(
            "DATABASE_URL is required in production. Configure a persistent Postgres database "
            "before importing dashboard data; SQLite storage on Render is ephemeral and can reset."
        )


def _initialize_runtime_services(application: FastAPI) -> None:
    application.state.startup_initializing = True
    try:
        validate_security_configuration()
        if settings.migrate_on_startup:
            ensure_schema()
            apply_migrations()
        elif not database_ping():
            raise RuntimeError("Database is unavailable after the migration command completed")
        application.state.startup_ready = True
        application.state.startup_degraded = False
        application.state.startup_error = None
    finally:
        application.state.startup_initializing = False


@asynccontextmanager
async def lifespan(application: FastAPI):
    _assert_persistent_storage_configured()
    _initialize_runtime_services(application)
    try:
        yield
    finally:
        close_pool()


app = FastAPI(title="Barker Portfolio Workstation", docs_url=None, redoc_url=None, lifespan=lifespan)
app.state.startup_ready = False
app.state.startup_degraded = False
app.state.startup_error = None
app.state.startup_initializing = False


allow_all = os.getenv("WS_ALLOW_ALL_ORIGINS", "0") == "1"
raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "https://localhost:8000,https://127.0.0.1:8000,http://localhost:8000,http://127.0.0.1:8000,http://localhost:5173",
)
allowed_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

# Render exposes the external URL/hostname for the service; allow it by default.
render_url = os.getenv("RENDER_EXTERNAL_URL", "").strip()
render_host = os.getenv("RENDER_EXTERNAL_HOSTNAME", "").strip()
if render_url:
    allowed_origins.append(render_url)
if render_host:
    allowed_origins.append(f"https://{render_host}")

# De-dupe while preserving order
allowed_origins = list(dict.fromkeys(allowed_origins))

if allow_all:
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False if allow_all else True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    max_age=600,
)

viewer_dependencies = [Depends(require_viewer)]
admin_dependencies = [Depends(require_admin)]
app.include_router(session.router, prefix=settings.api_prefix)
app.include_router(portfolio.router, prefix=settings.api_prefix, dependencies=viewer_dependencies)
app.include_router(risk.router, prefix=settings.api_prefix, dependencies=viewer_dependencies)
app.include_router(trades.router, prefix=settings.api_prefix, dependencies=viewer_dependencies)
app.include_router(status.router, prefix=settings.api_prefix, dependencies=viewer_dependencies)
app.include_router(auth.router, prefix=settings.api_prefix, dependencies=admin_dependencies)
app.include_router(broker.router, prefix=settings.api_prefix, dependencies=admin_dependencies)
app.include_router(market.router, prefix=settings.api_prefix, dependencies=viewer_dependencies)
app.include_router(stooq_proxy.router, prefix=settings.api_prefix, dependencies=viewer_dependencies)
app.include_router(positions.router, prefix=settings.api_prefix, dependencies=viewer_dependencies)
app.include_router(admin.router, prefix=settings.api_prefix, dependencies=admin_dependencies)

STATIC_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
)


@app.get("/health")
@app.get("/health/ready")
def health(response: Response):
    storage = storage_diagnostics()
    db_ready = False
    if app.state.startup_ready:
        try:
            db_ready = database_ping()
        except Exception:
            db_ready = False
    status = "degraded" if app.state.startup_degraded or storage.get("fallback_active") or not db_ready else "ok"
    if status != "ok":
        response.status_code = 503
    return {
        "status": status,
        "db": "ready" if db_ready else "unavailable",
        "initializing": bool(app.state.startup_initializing),
        "startup_error": app.state.startup_error,
        "db_backend": storage.get("active_backend"),
        "db_fallback_active": storage.get("fallback_active"),
    }


@app.get("/health/live")
def liveness():
    return {"status": "ok"}


@app.get("/version")
def version():
    # Lightweight deploy verification endpoint.
    storage = storage_diagnostics()
    return {
        "build_id": os.getenv("RENDER_GIT_COMMIT", os.getenv("GIT_COMMIT", "local")),
        "build_time": os.getenv("BUILD_TIMESTAMP", "unknown"),
        "environment": os.getenv("ENVIRONMENT", "development"),
        "db": "ready" if app.state.startup_ready else "unavailable",
        "initializing": bool(app.state.startup_initializing),
        "startup_error": app.state.startup_error,
        "db_backend": storage.get("active_backend"),
        "db_fallback_active": storage.get("fallback_active"),
    }


if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
else:
    logging.getLogger(__name__).warning("Static assets not found at %s. Build the frontend before deployment.", STATIC_DIR)
