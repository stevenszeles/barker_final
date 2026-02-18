from datetime import datetime
from typing import List, Dict

from ..config import settings
from .token_store import get_token


def get_status() -> List[Dict[str, str]]:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    schwab_token = get_token("schwab")
    schwab_ok = bool(schwab_token) and not settings.demo_mode
    polygon_ok = bool(settings.polygon.api_key) and not settings.demo_mode
    if settings.static_mode:
        source_portfolio = "static"
        source_market = "static"
    else:
        source_portfolio = "demo" if settings.demo_mode else "local" if settings.marketdata_only else "schwab"
        source_market = "demo" if settings.demo_mode else "stooq" if settings.marketdata_only else "polygon"
    return [
        {
            "component": "portfolio",
            "asof": now,
            "source": source_portfolio,
            "ok": (settings.static_mode or settings.marketdata_only or schwab_ok or settings.demo_mode),
        },
        {
            "component": "risk",
            "asof": now,
            "source": source_portfolio,
            "ok": (settings.static_mode or settings.marketdata_only or schwab_ok or settings.demo_mode),
        },
        {
            "component": "market",
            "asof": now,
            "source": source_market,
            "ok": (settings.static_mode or settings.marketdata_only or polygon_ok),
        },
        {"component": "options", "asof": now, "source": "schwab", "ok": schwab_ok},
        {"component": "method", "asof": now, "source": settings.method_version, "ok": True},
    ]
