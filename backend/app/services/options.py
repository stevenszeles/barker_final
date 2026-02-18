from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from ..db import with_conn
from . import stooq


def is_osi_symbol(symbol: str) -> bool:
    s = (symbol or "").strip().upper()
    if not s:
        return False
    # Accept both padded (21 chars) and unpadded (18 chars) OSI variants.
    import re

    return re.match(r"^([A-Z0-9]{1,6})(\d{6})([CP])(\d{8})$", s) is not None


def parse_osi_symbol(symbol: str) -> Optional[Tuple[str, str, str, float]]:
    s = (symbol or "").strip().upper()
    if not s:
        return None
    import re

    match = re.match(r"^([A-Z0-9]{1,6})(\d{6})([CP])(\d{8})$", s)
    if not match:
        return None
    root = match.group(1)
    yymmdd = match.group(2)
    right = match.group(3)
    strike_raw = match.group(4)
    try:
        year = int("20" + yymmdd[0:2])
        month = int(yymmdd[2:4])
        day = int(yymmdd[4:6])
        expiry = f"{year:04d}-{month:02d}-{day:02d}"
        strike = float(int(strike_raw)) / 1000.0
    except Exception:
        return None
    return (root, expiry, right, strike)


def _normalize_expiry(expiry: str) -> str:
    raw = (expiry or "").strip()
    if not raw:
        return ""
    for fmt in ("%Y-%m-%d", "%m-%d-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except Exception:
            continue
    return ""


def build_osi_symbol(underlying: str, expiry: str, option_type: str, strike: float) -> str:
    u = (underlying or "").strip().upper()
    if not u:
        return ""
    normalized = _normalize_expiry(expiry)
    if not normalized:
        return ""
    exp = datetime.strptime(normalized, "%Y-%m-%d")
    right = "C" if (option_type or "").upper().startswith("C") else "P"
    try:
        strike_int = int(round(float(strike) * 1000.0))
    except Exception:
        return ""
    return f"{u}{exp.strftime('%y%m%d')}{right}{strike_int:08d}"


def normalize_option_fields(
    symbol: str,
    underlying: Optional[str],
    expiry: Optional[str],
    option_type: Optional[str],
    strike: Optional[float],
) -> Tuple[str, str, str, str, float]:
    parsed = parse_osi_symbol(symbol)
    if parsed:
        root, exp, right, parsed_strike = parsed
        opt_type = "CALL" if right == "C" else "PUT"
        return symbol.strip().upper(), root, exp, opt_type, parsed_strike
    normalized_expiry = _normalize_expiry(expiry or "")
    if underlying and normalized_expiry and option_type and strike is not None:
        osi = build_osi_symbol(underlying, normalized_expiry, option_type, float(strike))
        if osi:
            return osi, (underlying or "").strip().upper(), normalized_expiry, option_type.upper(), float(strike)
    raise ValueError("Invalid option symbol. Provide OSI or underlying/expiry/type/strike.")


def get_option_chain_demo(underlying: str) -> List[Dict[str, Any]]:
    def _run(conn):
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, symbol, expiry, strike, option_type, multiplier
            FROM instruments
            WHERE asset_class='option' AND underlying=?
            ORDER BY expiry, strike
            """,
            (underlying,),
        )
        return [dict(r) for r in cur.fetchall()]

    rows = with_conn(_run)
    if rows:
        return rows

    base_price = 100.0
    try:
        quotes = stooq.get_quotes([underlying])
        if quotes:
            quote = quotes[0]
            trade = quote.get("lastTrade") or {}
            base_price = float(trade.get("price") or base_price)
    except Exception:
        base_price = 100.0

    step = 5.0 if base_price >= 100 else 1.0
    center = round(base_price / step) * step
    strikes = [center + (idx - 2.5) * step for idx in range(6)]
    expiry = (datetime.now().date() + timedelta(days=30)).isoformat()
    synthetic: List[Dict[str, Any]] = []
    for strike in strikes:
        for opt_type in ("CALL", "PUT"):
            mark = max(0.1, abs(base_price - strike) * 0.02 + 0.5)
            bid = max(mark - 0.05, 0.01)
            ask = mark + 0.05
            symbol = build_osi_symbol(underlying, expiry, opt_type, strike)
            synthetic.append(
                {
                    "id": f"{symbol}:OPTION",
                    "symbol": symbol,
                    "expiry": expiry,
                    "strike": float(strike),
                    "option_type": opt_type,
                    "multiplier": 100,
                    "bid": round(bid, 2),
                    "ask": round(ask, 2),
                    "mark": round(mark, 2),
                }
            )
    return synthetic
