import time
from datetime import datetime
from fastapi import APIRouter

from ..schemas import DataStatus
from ..config import settings
from ..services.status import get_status
from ..services import schwab, token_store

router = APIRouter(prefix="/status", tags=["status"])


@router.get("/components", response_model=list[DataStatus])
def components():
    return get_status()


@router.get("/schwab")
def schwab_status():
    if not settings.schwab.client_id:
        return {
            "connected": False,
            "status": "not_configured",
            "message": "Schwab API credentials not configured",
            "reason": "No Schwab credentials configured",
            "can_trade": False,
            "can_fetch_data": False,
            "configured": False,
        }

    token = token_store.get_token("schwab")
    if not token or not token.get("access_token"):
        return {
            "connected": False,
            "status": "not_authenticated",
            "message": "Not authenticated. Click Connect to authorize.",
            "reason": "Not authenticated. Click Connect to authorize.",
            "can_trade": False,
            "can_fetch_data": False,
            "configured": True,
            "auth_url": "/api/auth/schwab/start",
        }

    expires_at = token.get("expires_at", 0)
    expires_in_seconds = int(expires_at - time.time())
    if expires_in_seconds <= 0:
        return {
            "connected": False,
            "status": "token_expired",
            "message": "Schwab token has expired. Reconnect to refresh.",
            "reason": "Schwab token has expired. Reconnect to refresh.",
            "can_trade": False,
            "can_fetch_data": False,
            "configured": True,
            "expires_in_seconds": expires_in_seconds,
            "auth_url": "/api/auth/schwab/start",
        }
    can_use = schwab.can_use_marketdata()
    in_cooldown = schwab._in_refresh_cooldown()
    if in_cooldown:
        return {
            "connected": True,
            "status": "cooldown",
            "message": "In refresh cooldown. Waiting before next request.",
            "reason": "In refresh cooldown. Waiting before next request.",
            "can_trade": False,
            "can_fetch_data": False,
            "configured": True,
            "expires_in_seconds": expires_in_seconds,
            "expires_at": datetime.fromtimestamp(expires_at).isoformat(),
            "token_valid": True,
            "in_cooldown": True,
        }

    return {
        "connected": True,
        "status": "active",
        "message": "Connected to Schwab API",
        "can_trade": can_use,
        "can_fetch_data": can_use,
        "expires_in_seconds": expires_in_seconds,
        "expires_at": datetime.fromtimestamp(expires_at).isoformat(),
        "access_token_expires": datetime.fromtimestamp(expires_at).strftime("%Y-%m-%d %H:%M:%S"),
        "token_valid": expires_in_seconds > 0,
        "in_cooldown": False,
    }


@router.get("/market-data")
def market_data_status():
    sources = []
    if settings.polygon.api_key:
        sources.append(
            {
                "name": "Polygon",
                "type": "primary",
                "status": "configured",
                "realtime": True,
                "priority": 1,
            }
        )

    schwab_conn = schwab_status()
    if schwab_conn.get("connected"):
        sources.append(
            {
                "name": "Schwab",
                "type": "secondary",
                "status": "connected",
                "realtime": True,
                "priority": 2,
            }
        )

    sources.append(
        {
            "name": "Stooq",
            "type": "fallback",
            "status": "available",
            "realtime": False,
            "priority": 3,
            "note": "Delayed data only",
        }
    )

    return {
        "sources": sources,
        "has_realtime": any(source.get("realtime") for source in sources),
        "primary_source": sources[0]["name"] if sources else None,
    }
