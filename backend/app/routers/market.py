import asyncio
import json
import logging
from typing import Dict, List
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
import websockets
import httpx

from ..config import settings
from ..services import polygon, schwab, stooq
from ..services import options as options_service
from ..services import futures as futures_service

router = APIRouter(prefix="/market", tags=["market"])
logger = logging.getLogger(__name__)


def _require_polygon():
    if settings.demo_mode:
        raise HTTPException(status_code=400, detail="Demo mode enabled; live market data disabled")
    if not settings.polygon.api_key:
        raise HTTPException(status_code=400, detail="Polygon API key missing")


@router.get("/snapshot")
def snapshot(symbols: str):
    if settings.static_mode:
        return {"source": "static", "tickers": []}
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not sym_list:
        return {"source": "unavailable", "tickers": []}
    # Marketdata-only mode: prefer Schwab -> Stooq
    if settings.marketdata_only:
        try:
            quotes = schwab.get_quotes(sym_list)
            if quotes:
                return {"source": "schwab", "tickers": quotes}
        except Exception as schwab_exc:
            logger.exception("Schwab quote fallback failed: %s", schwab_exc)
        try:
            quotes = stooq.get_quotes(sym_list)
            return {"source": "stooq", "tickers": quotes}
        except Exception as exc:
            logger.exception("Stooq fallback failed: %s", exc)
            return {
                "source": "unavailable",
                "tickers": [],
                "error": "No market data source available.",
            }
    # Try Polygon first if configured
    if settings.polygon.api_key:
        try:
            return polygon.get_snapshot(sym_list)
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            logger.exception("Polygon snapshot error")
            if status != 403:
                return {
                    "source": "unavailable",
                    "tickers": [],
                    "error": f"Polygon snapshot error {status}",
                }
    # Fallback to Schwab market data if connected
    try:
        quotes = schwab.get_quotes(sym_list)
        if quotes:
            return {"source": "schwab", "tickers": quotes}
    except Exception as schwab_exc:
        logger.exception("Schwab quote fallback failed: %s", schwab_exc)
    # Fallback to Stooq (free, delayed)
    try:
        quotes = stooq.get_quotes(sym_list)
        return {"source": "stooq", "tickers": quotes}
    except Exception as exc:
        logger.exception("Stooq fallback failed: %s", exc)
        return {
            "source": "unavailable",
            "tickers": [],
            "error": "No market data source available.",
        }


@router.get("/aggregates")
def aggregates(symbol: str, multiplier: int, timespan: str, from_date: str, to_date: str):
    if settings.static_mode:
        raise HTTPException(status_code=400, detail="Static mode enabled; live market data disabled")
    _require_polygon()
    return polygon.get_aggregates(symbol.upper(), multiplier, timespan, from_date, to_date)


@router.get("/previous-close")
def previous_close(symbol: str):
    if settings.static_mode:
        raise HTTPException(status_code=400, detail="Static mode enabled; live market data disabled")
    _require_polygon()
    return polygon.get_previous_close(symbol.upper())


@router.get("/status")
def market_status():
    if settings.static_mode:
        return {"market": "static", "source": "static"}
    if settings.demo_mode:
        raise HTTPException(status_code=400, detail="Demo mode enabled; live market data disabled")
    if settings.marketdata_only:
        return {"market": "unknown", "source": "stooq"}
    if settings.polygon.api_key:
        try:
            return polygon.get_market_status()
        except Exception:
            pass
    return {"market": "unknown", "source": "stooq"}


@router.get("/options-chain")
def options_chain(underlying: str):
    if settings.static_mode:
        return {"underlying": underlying, "contracts": []}
    if settings.demo_mode:
        return {"underlying": underlying, "contracts": options_service.get_option_chain_demo(underlying.upper())}
    if settings.marketdata_only:
        try:
            chain = schwab.get_option_chain(underlying.upper())
            return chain
        except Exception:
            demo = options_service.get_option_chain_demo(underlying.upper())
            if demo:
                return {"underlying": underlying, "contracts": demo}
            raise HTTPException(status_code=503, detail="Options chain unavailable (Schwab not connected)")
    _require_polygon()
    try:
        return polygon.get_options_chain(underlying.upper())
    except httpx.HTTPStatusError as exc:
        logger.exception("Polygon options chain error")
        status = exc.response.status_code
        if status == 403:
            raise HTTPException(status_code=403, detail="Polygon plan does not include options data")
        raise HTTPException(status_code=status, detail="Polygon options chain error")


@router.get("/option-marks")
def option_marks(symbols: str):
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not sym_list:
        return {}
    if settings.static_mode:
        return {}
    if settings.demo_mode:
        marks: Dict[str, float] = {}
        by_underlying: Dict[str, List[str]] = {}
        for sym in sym_list:
            parsed = options_service.parse_osi_symbol(sym)
            if not parsed:
                continue
            underlying = parsed[0]
            by_underlying.setdefault(underlying, []).append(sym)
        for underlying, symbols in by_underlying.items():
            chain = options_service.get_option_chain_demo(underlying)
            for contract in chain or []:
                symbol = (contract.get("symbol") or "").upper()
                if symbol in symbols:
                    mark = contract.get("mark") or contract.get("last")
                    if mark is None:
                        bid = contract.get("bid")
                        ask = contract.get("ask")
                        if bid is not None and ask is not None:
                            mark = (float(bid) + float(ask)) / 2.0
                    if mark is not None:
                        marks[symbol] = float(mark)
        return marks
    try:
        return schwab.get_option_marks(sym_list)
    except Exception as exc:
        logger.exception("Option marks error: %s", exc)
        raise HTTPException(status_code=503, detail="Option marks unavailable (Schwab not connected)")


@router.get("/futures-ladder")
def futures_ladder():
    if settings.static_mode:
        return {"contracts": []}
    if settings.demo_mode:
        return {"contracts": futures_service.get_futures_ladder_demo()}
    return {"contracts": futures_service.get_futures_ladder()}


@router.websocket("/stream")
async def stream(websocket: WebSocket):
    await websocket.accept()
    if settings.static_mode:
        await websocket.send_text(json.dumps({"type": "error", "message": "Static mode enabled"}))
        await websocket.close()
        return
    if settings.demo_mode:
        await websocket.send_text(json.dumps({"type": "error", "message": "Demo mode enabled"}))
        await websocket.close()
        return
    if settings.marketdata_only:
        await websocket.send_text(json.dumps({"type": "error", "message": "Websocket disabled in market-data-only mode"}))
        await websocket.close()
        return
    if not settings.polygon.api_key:
        await websocket.send_text(json.dumps({"type": "error", "message": "Polygon API key missing"}))
        await websocket.close()
        return

    symbols_param = websocket.query_params.get("symbols", "")
    symbols = [s.strip().upper() for s in symbols_param.split(",") if s.strip()]
    if not symbols:
        await websocket.send_text(json.dumps({"type": "error", "message": "No symbols provided"}))
        await websocket.close()
        return

    params = ",".join([f"T.{s}" for s in symbols] + [f"Q.{s}" for s in symbols])
    ws_url = f"{settings.polygon.ws_base}/stocks"

    try:
        async with websockets.connect(ws_url) as poly_ws:
            await poly_ws.send(json.dumps({"action": "auth", "params": settings.polygon.api_key}))
            await poly_ws.send(json.dumps({"action": "subscribe", "params": params}))

            async def pump_polygon():
                async for message in poly_ws:
                    await websocket.send_text(message)

            pump_task = asyncio.create_task(pump_polygon())
            while True:
                try:
                    await websocket.receive_text()
                except WebSocketDisconnect:
                    break
                except Exception:
                    break
            pump_task.cancel()
    except Exception:
        await websocket.send_text(json.dumps({"type": "error", "message": "Polygon websocket connection failed"}))
        await websocket.close()
