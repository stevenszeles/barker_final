from datetime import datetime
from typing import List, Dict

from ..config import settings
from .token_store import get_token


def get_status() -> List[Dict[str, str]]:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        schwab_token = get_token("schwab")
    except Exception:
        schwab_token = None
    schwab_ok = bool(schwab_token) and not settings.demo_mode
    if settings.static_mode:
        source_portfolio = "static"
        source_market = "static"
        portfolio_ok = True
        market_ok = True
    elif settings.demo_mode:
        source_portfolio = "demo"
        source_market = "demo"
        portfolio_ok = True
        market_ok = True
    elif settings.polygon.api_key:
        source_portfolio = "schwab" if schwab_ok else "local"
        source_market = "polygon"
        portfolio_ok = True
        market_ok = True
    else:
        source_portfolio = "local"
        source_market = "stooq"
        portfolio_ok = True
        market_ok = True
    return [
        {
            "component": "portfolio",
            "asof": now,
            "source": source_portfolio,
            "ok": portfolio_ok,
        },
        {
            "component": "risk",
            "asof": now,
            "source": source_portfolio,
            "ok": portfolio_ok,
        },
        {
            "component": "market",
            "asof": now,
            "source": source_market,
            "ok": market_ok,
        },
        {"component": "options", "asof": now, "source": "schwab", "ok": schwab_ok},
        {"component": "method", "asof": now, "source": settings.method_version, "ok": True},
    ]
