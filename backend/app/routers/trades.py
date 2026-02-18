import logging
from fastapi import APIRouter, HTTPException
import httpx
from typing import Optional
from pydantic import BaseModel
from ..schemas import TradeBlotter, TradeImpact
from ..services.trades import get_blotter, preview_trade, submit_trade, submit_multi, cancel_trade, replace_trade

router = APIRouter(prefix="/trade", tags=["trade"])
logger = logging.getLogger(__name__)


def _raise_trade_error(exc: Exception) -> None:
    detail = str(exc)
    logger.exception("Trade error: %s", detail)
    if isinstance(exc, ValueError):
        raise HTTPException(status_code=400, detail=detail)
    lowered = detail.lower()
    if "not authenticated" in lowered or "refresh token" in lowered:
        raise HTTPException(status_code=401, detail="Schwab not connected. Open /api/auth/schwab/start to authorize.")
    if isinstance(exc, httpx.HTTPStatusError):
        body = exc.response.text
        raise HTTPException(status_code=exc.response.status_code, detail=f"Schwab API error: {body}")
    raise HTTPException(status_code=503, detail=detail)


class TradePayload(BaseModel):
    account: Optional[str] = None
    symbol: str
    instrument_id: Optional[str] = None
    side: str
    qty: float
    price: float
    trade_date: Optional[str] = None
    sector: Optional[str] = None
    trade_type: str = "EQUITY"
    order_type: Optional[str] = None
    asset_class: Optional[str] = None
    underlying: Optional[str] = None
    expiry: Optional[str] = None
    strike: Optional[float] = None
    option_type: Optional[str] = None
    multiplier: Optional[float] = None
    strategy_id: Optional[str] = None
    strategy_name: Optional[str] = None


class TradeLegPayload(BaseModel):
    account: Optional[str] = None
    symbol: str
    side: str
    qty: float
    price: float
    trade_date: Optional[str] = None
    sector: Optional[str] = None
    trade_type: str = "OPTION"
    order_type: Optional[str] = None
    asset_class: Optional[str] = None
    underlying: Optional[str] = None
    expiry: Optional[str] = None
    strike: Optional[float] = None
    option_type: Optional[str] = None
    multiplier: Optional[float] = None
    instrument_id: Optional[str] = None


class MultiLegPayload(BaseModel):
    legs: list[TradeLegPayload]
    strategy_id: Optional[str] = None
    strategy_name: Optional[str] = None


class CancelPayload(BaseModel):
    trade_id: str


class ReplacePayload(BaseModel):
    original_trade_id: str
    symbol: str
    side: str
    qty: float
    price: float
    trade_type: str = "EQUITY"


@router.get("/blotter", response_model=TradeBlotter)
def blotter(limit: int = 200):
    try:
        return get_blotter(limit=limit)
    except Exception as exc:
        _raise_trade_error(exc)


@router.post("/preview", response_model=TradeImpact)
def preview(payload: TradePayload):
    try:
        return preview_trade(payload.model_dump())
    except Exception as exc:
        _raise_trade_error(exc)


@router.post("/submit")
def submit(payload: TradePayload):
    try:
        return submit_trade(payload.model_dump())
    except Exception as exc:
        _raise_trade_error(exc)


@router.post("/submit-multi")
def submit_multi_legs(payload: MultiLegPayload):
    try:
        return submit_multi(payload.model_dump())
    except Exception as exc:
        _raise_trade_error(exc)


@router.post("/cancel")
def cancel(payload: CancelPayload):
    return cancel_trade(payload.trade_id)


@router.post("/replace")
def replace(payload: ReplacePayload):
    data = payload.model_dump()
    original_trade_id = data.pop("original_trade_id")
    return replace_trade(original_trade_id, data)
