import logging
from typing import Optional
from fastapi import APIRouter, HTTPException
import httpx
from ..schemas import Snapshot, NavPoint
from ..services.portfolio import get_snapshot, get_nav_series, get_sector_series

router = APIRouter(prefix="/portfolio", tags=["portfolio"])
logger = logging.getLogger(__name__)


def _raise_portfolio_error(exc: Exception) -> None:
    detail = str(exc)
    logger.exception("Portfolio error: %s", detail)
    lowered = detail.lower()
    if "not authenticated" in lowered or "refresh token" in lowered:
        raise HTTPException(status_code=401, detail="Schwab not connected. Open /api/auth/schwab/start to authorize.")
    if isinstance(exc, httpx.HTTPStatusError):
        body = exc.response.text
        raise HTTPException(status_code=exc.response.status_code, detail=f"Schwab API error: {body}")
    raise HTTPException(status_code=503, detail=detail)


@router.get("/snapshot", response_model=Snapshot)
def snapshot(account: Optional[str] = None):
    try:
        return get_snapshot(account=account)
    except Exception as exc:
        _raise_portfolio_error(exc)


@router.get("/nav", response_model=list[NavPoint])
def nav(limit: int = 120, account: Optional[str] = None):
    try:
        return get_nav_series(limit=limit, account=account)
    except Exception as exc:
        _raise_portfolio_error(exc)


@router.get("/sector")
def sector_series(sector: str, limit: int = 120, source: str = "auto", account: Optional[str] = None):
    try:
        return get_sector_series(sector=sector, limit=limit, source=source, account=account)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        _raise_portfolio_error(exc)
