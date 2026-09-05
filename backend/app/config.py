import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from typing import Optional

# Load .env from repo root for local/dev runs (no-op if missing)
# Avoid loading .env in production so platform environment variables are authoritative.
_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
_ENVIRONMENT = os.environ.get("ENVIRONMENT", "").strip().lower()
if _ENVIRONMENT not in {"production", "prod"}:
    load_dotenv(_ENV_PATH, override=False)


@dataclass
class SchwabConfig:
    client_id: str
    client_secret: str
    redirect_uri: str
    oauth_base: str
    api_base: str
    market_base: str
    scopes: str


@dataclass
class PolygonConfig:
    api_key: str
    rest_base: str
    ws_base: str


@dataclass
class OpenFigiConfig:
    api_key: str
    base_url: str
    timeout: float


@dataclass
class CacheConfig:
    redis_url: str
    default_ttl: int


class Settings:
    def __init__(self) -> None:
        def _clean_optional(value: Optional[str]) -> str:
            raw = (value or "").strip()
            if not raw:
                return ""
            lowered = raw.lower()
            placeholder_tokens = (
                "your_db_",
                "your_redis_",
                "yourdomain.com",
                "your_client_id",
                "your_client_secret",
                "your_polygon_api_key",
                "your_openfigi_api_key",
            )
            if any(token in lowered for token in placeholder_tokens):
                return ""
            return raw

        def _env_bool(name: str, default: bool = False) -> bool:
            raw = os.environ.get(name)
            if raw is None:
                return default
            return raw.strip().lower() in {"1", "true", "yes", "on"}

        render_runtime = any(
            bool((os.environ.get(name) or "").strip())
            for name in ("RENDER", "RENDER_SERVICE_ID", "RENDER_EXTERNAL_URL", "RENDER_EXTERNAL_HOSTNAME")
        )
        # API prefix
        self.api_prefix = os.environ.get("WS_API_PREFIX", "/api")

        # Database configuration
        self.db_url = _clean_optional(os.environ.get("DATABASE_URL") or os.environ.get("WS_DATABASE_URL"))
        default_db_path = str(Path.home() / "workstation.db")
        self.db_path = os.environ.get("WS_DB_PATH", default_db_path)
        self.db_fallback_to_sqlite = _env_bool("WS_DB_FALLBACK_TO_SQLITE", default=False)
        try:
            self.db_pool_min = max(1, int(os.environ.get("WS_DB_POOL_MIN", "1")))
        except Exception:
            self.db_pool_min = 1
        try:
            self.db_pool_max = max(self.db_pool_min, int(os.environ.get("WS_DB_POOL_MAX", "8")))
        except Exception:
            self.db_pool_max = max(self.db_pool_min, 8)
        try:
            self.db_statement_timeout_ms = max(1000, int(os.environ.get("WS_DB_STATEMENT_TIMEOUT_MS", "15000")))
        except Exception:
            self.db_statement_timeout_ms = 15000

        # Mode configuration
        self.marketdata_only = os.environ.get("WS_MARKETDATA_ONLY", "0") == "1"
        # Live quote toggle (kept separate from marketdata_only)
        self.live_quotes = os.environ.get("WS_LIVE_QUOTES", "1") == "1"
        # Static mode: disable live market data and rely only on uploaded balances/positions.
        # Default to live-enabled so Schwab/Stooq history works out of the box.
        self.static_mode = os.environ.get("WS_STATIC_MODE", "0") == "1"

        # Access control. Production defaults to protected; local development
        # remains frictionless unless explicitly enabled.
        environment_is_production = _ENVIRONMENT in {"production", "prod"} or render_runtime
        self.auth_enabled = _env_bool("BARKER_AUTH_ENABLED", default=environment_is_production)
        self.auth_secret = _clean_optional(os.environ.get("BARKER_AUTH_SECRET"))
        self.admin_password = _clean_optional(os.environ.get("BARKER_ADMIN_PASSWORD"))
        self.viewer_password = _clean_optional(os.environ.get("BARKER_VIEWER_PASSWORD"))
        self.secure_cookies = _env_bool("BARKER_SECURE_COOKIES", default=environment_is_production)
        try:
            self.session_hours = max(1, int(os.environ.get("BARKER_SESSION_HOURS", "12")))
        except Exception:
            self.session_hours = 12
        self.trading_enabled = _env_bool("BARKER_TRADING_ENABLED", default=False)
        self.migrate_on_startup = _env_bool("BARKER_MIGRATE_ON_STARTUP", default=True)
        try:
            self.max_upload_bytes = max(1024, int(os.environ.get("BARKER_MAX_UPLOAD_BYTES", str(10 * 1024 * 1024))))
        except Exception:
            self.max_upload_bytes = 10 * 1024 * 1024

        # Logging / method metadata
        self.log_path = os.environ.get("WS_LOG_PATH", "workstation.log")
        self.method_version = os.environ.get("WS_METHOD_VERSION", "v1.0.0")

        # Quote / fetch safeguards
        try:
            self.quote_timeout = float(os.environ.get("WS_QUOTE_TIMEOUT", "4"))
        except Exception:
            self.quote_timeout = 4.0
        try:
            self.quote_max_symbols = int(os.environ.get("WS_QUOTE_MAX_SYMBOLS", "80"))
        except Exception:
            self.quote_max_symbols = 80
        try:
            self.quote_batch = int(os.environ.get("WS_QUOTE_BATCH", "50"))
        except Exception:
            self.quote_batch = 50
        try:
            self.schwab_refresh_cooldown = int(os.environ.get("WS_SCHWAB_REFRESH_COOLDOWN", "60"))
        except Exception:
            self.schwab_refresh_cooldown = 60
        try:
            self.schwab_timeout = float(os.environ.get("WS_SCHWAB_TIMEOUT", "6"))
        except Exception:
            self.schwab_timeout = 6.0

        # Schwab configuration
        self.schwab = SchwabConfig(
            client_id=_clean_optional(os.environ.get("SCHWAB_CLIENT_ID", "")),
            client_secret=_clean_optional(os.environ.get("SCHWAB_CLIENT_SECRET", "")),
            redirect_uri=_clean_optional(os.environ.get("SCHWAB_REDIRECT_URI", "")),
            oauth_base=os.environ.get("SCHWAB_OAUTH_BASE", "https://api.schwabapi.com/v1/oauth"),
            api_base=os.environ.get("SCHWAB_API_BASE", "https://api.schwabapi.com/trader/v1"),
            market_base=os.environ.get("SCHWAB_MARKET_BASE", "https://api.schwabapi.com/marketdata/v1"),
            scopes=os.environ.get("SCHWAB_SCOPES", ""),
        )

        # Polygon configuration
        self.polygon = PolygonConfig(
            api_key=_clean_optional(os.environ.get("POLYGON_API_KEY", "")),
            rest_base=os.environ.get("POLYGON_REST_BASE", "https://api.polygon.io"),
            ws_base=os.environ.get("POLYGON_WS_BASE", "wss://socket.polygon.io"),
        )

        # OpenFIGI configuration (identifier mapping, not price feed)
        try:
            openfigi_timeout = float(os.environ.get("OPENFIGI_TIMEOUT", "6"))
        except Exception:
            openfigi_timeout = 6.0
        self.openfigi = OpenFigiConfig(
            api_key=_clean_optional(os.environ.get("OPENFIGI_API_KEY", "")),
            base_url=os.environ.get("OPENFIGI_BASE_URL", "https://api.openfigi.com"),
            timeout=openfigi_timeout,
        )

        # Cache configuration
        try:
            default_ttl = int(os.environ.get("CACHE_TTL") or os.environ.get("WS_CACHE_TTL") or "300")
        except Exception:
            default_ttl = 300
        self.cache = CacheConfig(
            redis_url=_clean_optional(os.environ.get("REDIS_URL") or os.environ.get("WS_REDIS_URL", "")),
            default_ttl=default_ttl,
        )


settings = Settings()
