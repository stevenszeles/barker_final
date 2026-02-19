import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .routers import portfolio, risk, trades, status
from .routers import auth, broker, market, positions, admin
from .workers import start_workers
from .db import ensure_schema
from .bootstrap_seed import seed_demo_portfolio_if_empty

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

app = FastAPI(title="Workstation", docs_url=None, redoc_url=None)

def _is_local_origin(origin: str) -> bool:
    lowered = (origin or "").lower()
    return "localhost" in lowered or "127.0.0.1" in lowered


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

if not allow_all and settings.static_mode:
    # If only local origins are configured (or none), default to allow-all in static mode.
    if not allowed_origins or all(_is_local_origin(origin) for origin in allowed_origins):
        allow_all = True

if allow_all:
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False if allow_all else True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    max_age=600,
)

app.include_router(portfolio.router, prefix=settings.api_prefix)
app.include_router(risk.router, prefix=settings.api_prefix)
app.include_router(trades.router, prefix=settings.api_prefix)
app.include_router(status.router, prefix=settings.api_prefix)
app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(broker.router, prefix=settings.api_prefix)
app.include_router(market.router, prefix=settings.api_prefix)
app.include_router(positions.router, prefix=settings.api_prefix)
app.include_router(admin.router, prefix=settings.api_prefix)

STATIC_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/version")
def version():
    # Lightweight deploy verification endpoint.
    return {
        "build_id": os.getenv("RENDER_GIT_COMMIT", os.getenv("GIT_COMMIT", "local")),
        "build_time": os.getenv("BUILD_TIMESTAMP", "unknown"),
        "environment": os.getenv("ENVIRONMENT", "development"),
    }


@app.on_event("startup")
def _startup():
    ensure_schema()
    # Demo seed can be expensive; keep disabled by default in deployed envs.
    if os.getenv("WS_SEED_DEMO", "0") == "1":
        seed_demo_portfolio_if_empty()
    start_workers()


if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
else:
    logging.getLogger(__name__).warning("Static assets not found at %s. Build the frontend before deployment.", STATIC_DIR)
