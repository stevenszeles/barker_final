import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# Load .env from repo root for local/dev runs (no-op if missing)
# Avoid loading .env in production so platform env vars (Render/Railway) are authoritative.
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
class CacheConfig:
    redis_url: str
    default_ttl: int


class Settings:
    def __init__(self) -> None:
        def _clean_optional(value: str | None) -> str:
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
            )
            if any(token in lowered for token in placeholder_tokens):
                return ""
            return raw

        # API prefix
        self.api_prefix = os.environ.get("WS_API_PREFIX", "/api")

        # Database configuration
        self.db_url = _clean_optional(os.environ.get("DATABASE_URL") or os.environ.get("WS_DATABASE_URL"))
        self.db_path = os.environ.get("WS_DB_PATH", str(Path.home() / "workstation.db"))

        # Mode configuration
        self.demo_mode = os.environ.get("WS_DEMO_MODE", "0") == "1"
        self.marketdata_only = os.environ.get("WS_MARKETDATA_ONLY", "0") == "1"
        # Live quote toggle (kept separate from marketdata_only)
        self.live_quotes = os.environ.get("WS_LIVE_QUOTES", "1") == "1"
        # Static mode: disable live market data and rely only on uploaded balances/positions.
        # Default to live-enabled so Schwab/Stooq history works out of the box.
        self.static_mode = os.environ.get("WS_STATIC_MODE", "0") == "1"

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
