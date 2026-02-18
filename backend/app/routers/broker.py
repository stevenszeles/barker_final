import logging
from fastapi import APIRouter, HTTPException
import httpx

from ..config import settings
from ..services import schwab

router = APIRouter(prefix="/broker", tags=["broker"])
logger = logging.getLogger(__name__)


def _require_config():
    if settings.demo_mode:
        raise HTTPException(status_code=400, detail="Demo mode enabled; Schwab live data disabled")
    if not settings.schwab.client_id or not settings.schwab.client_secret:
        raise HTTPException(status_code=400, detail="Schwab credentials missing")


def _raise_schwab_error(exc: Exception) -> None:
    detail = str(exc)
    logger.exception("Schwab broker error: %s", detail)
    lowered = detail.lower()
    if "not authenticated" in lowered or "refresh token" in lowered:
        raise HTTPException(status_code=401, detail="Schwab not connected. Open /api/auth/schwab/start to authorize.")
    if "unable to determine schwab account" in lowered:
        raise HTTPException(status_code=400, detail=detail)
    if isinstance(exc, httpx.HTTPStatusError):
        body = exc.response.text
        raise HTTPException(status_code=exc.response.status_code, detail=f"Schwab API error: {body}")
    raise HTTPException(status_code=502, detail="Schwab API unavailable")


@router.get("/accounts")
def accounts():
    _require_config()
    try:
        return schwab.get_accounts()
    except Exception as exc:
        _raise_schwab_error(exc)


@router.get("/positions")
def positions():
    _require_config()
    try:
        return schwab.get_positions()
    except Exception as exc:
        _raise_schwab_error(exc)


@router.get("/balances")
def balances():
    _require_config()
    try:
        return schwab.get_balances()
    except Exception as exc:
        _raise_schwab_error(exc)


@router.get("/orders")
def orders():
    _require_config()
    try:
        return schwab.get_orders()
    except Exception as exc:
        _raise_schwab_error(exc)


@router.post("/orders/preview")
def preview_order(payload: dict):
    _require_config()
    try:
        return schwab.preview_order(None, payload)
    except Exception as exc:
        _raise_schwab_error(exc)


@router.post("/orders/place")
def place_order(payload: dict):
    _require_config()
    try:
        return schwab.place_order(None, payload)
    except Exception as exc:
        _raise_schwab_error(exc)
