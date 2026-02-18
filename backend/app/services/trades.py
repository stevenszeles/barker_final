from datetime import datetime
import uuid
from typing import Dict, Any

from ..config import settings
from . import legacy_engine as engine


STAMP_SOURCE = "demo" if settings.demo_mode else "local" if settings.marketdata_only else "schwab"


def _stamp():
    return {
        "asof": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source": STAMP_SOURCE,
        "method_version": settings.method_version,
    }


def get_blotter(limit: int = 200) -> Dict[str, Any]:
    def _run(conn):
        cur = conn.cursor()
        cur.execute(
            """
            SELECT trade_id, ts, trade_date, instrument_id, symbol, side, qty, price, trade_type, status, source,
                   asset_class, underlying, expiry, strike, option_type, multiplier, strategy_id, strategy_name
            FROM trades
            ORDER BY ts DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = [dict(r) for r in cur.fetchall()]
        return rows

    from ..db import with_conn

    return {"stamp": _stamp(), "trades": with_conn(_run)}


def preview_trade(payload: Dict[str, Any]) -> Dict[str, Any]:
    return engine.preview_trade(payload)


def submit_trade(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not payload.get("trade_id"):
        payload["trade_id"] = f"T-{uuid.uuid4().hex[:8].upper()}"
    ok, msg, trade_id = engine.apply_trade(payload)
    if not ok:
        raise ValueError(msg)
    return {"trade_id": trade_id or payload["trade_id"], "status": "FILLED"}


def submit_multi(payload: Dict[str, Any]) -> Dict[str, Any]:
    legs = payload.get("legs") or []
    return engine.submit_multi(legs, payload.get("strategy_id"), payload.get("strategy_name"))


def cancel_trade(trade_id: str) -> Dict[str, Any]:
    from ..db import with_conn

    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def _run(conn):
        cur = conn.cursor()
        cur.execute("UPDATE trades SET status='CANCELLED' WHERE trade_id=?", (trade_id,))
        cur.execute(
            "INSERT INTO audit_log(ts, actor, action, details_json) VALUES(?,?,?,?)",
            (ts, "local-user", "TRADE_CANCEL", trade_id),
        )
        conn.commit()

    with_conn(_run)
    return {"trade_id": trade_id, "status": "CANCELLED"}


def replace_trade(original_trade_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    new_trade = submit_trade(payload)
    from ..db import with_conn

    def _run(conn):
        cur = conn.cursor()
        cur.execute("UPDATE trades SET status='REPLACED' WHERE trade_id=?", (original_trade_id,))
        cur.execute(
            "INSERT INTO audit_log(ts, actor, action, details_json) VALUES(?,?,?,?)",
            (ts, "local-user", "TRADE_REPLACE", original_trade_id),
        )
        conn.commit()

    with_conn(_run)
    return {"trade_id": original_trade_id, "status": "REPLACED", "replacement": new_trade}


def build_schwab_order(payload: Dict[str, Any]) -> Dict[str, Any]:
    symbol = payload.get("symbol", "").upper()
    side = (payload.get("side") or "BUY").upper()
    qty = float(payload.get("qty", 0))
    price = float(payload.get("price", 0))
    trade_type = (payload.get("trade_type") or "").upper()
    order_type_input = (payload.get("order_type") or trade_type or "MARKET").upper().replace(" ", "_")
    asset_class = (payload.get("asset_class") or "EQUITY").upper()
    order_type = "MARKET"
    if order_type_input in {"LIMIT", "LMT"}:
        order_type = "LIMIT"
    if order_type_input in {"STOP", "STOP_LIMIT"}:
        order_type = "STOP"
    order = {
        "orderType": order_type,
        "session": "NORMAL",
        "duration": "DAY",
        "orderStrategyType": "SINGLE",
        "orderLegCollection": [
            {
                "instruction": side,
                "quantity": qty,
                "instrument": {"symbol": symbol, "assetType": asset_class},
            }
        ],
    }
    if order_type in {"LIMIT", "STOP"}:
        order["price"] = price
    return order
