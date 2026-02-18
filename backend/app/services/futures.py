from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from ..db import with_conn
from ..config import settings
from . import schwab, stooq

MONTH_CODES = {
    "F": 1,
    "G": 2,
    "H": 3,
    "J": 4,
    "K": 5,
    "M": 6,
    "N": 7,
    "Q": 8,
    "U": 9,
    "V": 10,
    "X": 11,
    "Z": 12,
}

# Common contract multipliers. Extend as needed.
CONTRACT_SPECS: Dict[str, Dict[str, Any]] = {
    "GC": {"multiplier": 100.0, "name": "Gold 100 oz", "margin_est": 24000.0},
    "MGC": {"multiplier": 10.0, "name": "Micro Gold 10 oz", "margin_est": 2000.0},
    "QO": {"multiplier": 50.0, "name": "E-mini Gold 50 oz", "margin_est": 7500.0},
    "1OZ": {"multiplier": 1.0, "name": "1-Ounce Gold", "margin_est": 240.0},
    "SI": {"multiplier": 5000.0, "name": "Silver 5,000 oz"},
    "HG": {"multiplier": 25000.0, "name": "Copper 25,000 lbs"},
    "CL": {"multiplier": 1000.0, "name": "Crude Oil 1,000 bbl"},
    "NG": {"multiplier": 10000.0, "name": "Nat Gas 10,000 MMBtu"},
    "ES": {"multiplier": 50.0, "name": "E-mini S&P 500"},
    "NQ": {"multiplier": 20.0, "name": "E-mini Nasdaq 100"},
    "YM": {"multiplier": 5.0, "name": "E-mini Dow"},
    "RTY": {"multiplier": 50.0, "name": "E-mini Russell 2000"},
}


def parse_future_symbol(symbol: str) -> Optional[Tuple[str, str, int, str]]:
    s = (symbol or "").strip().upper()
    if not s:
        return None
    if s.startswith("/"):
        s = s[1:]
    # Root + month code + year (1-2 digits). Root can be 1-3 letters.
    if len(s) < 3:
        return None
    root = s[:-3]
    month_code = s[-3:-2]
    year_code = s[-2:]
    if month_code not in MONTH_CODES or not year_code.isdigit():
        return None
    year = int(year_code)
    year += 2000 if year < 70 else 1900
    month = MONTH_CODES[month_code]
    expiry = f"{year:04d}-{month:02d}-01"
    return (root, month_code, year, expiry)


def get_future_spec(symbol: str) -> Dict[str, Any]:
    parsed = parse_future_symbol(symbol)
    root = parsed[0] if parsed else (symbol or "").strip().upper().lstrip("/")
    spec = CONTRACT_SPECS.get(root, {})
    multiplier = float(spec.get("multiplier") or 1.0)
    expiry = parsed[3] if parsed else None
    margin_est = float(spec.get("margin_est") or 0.0)
    maintenance = float(spec.get("maintenance_margin") or (margin_est if margin_est else 0.0))
    initial = float(spec.get("initial_margin") or (maintenance * 1.1 if maintenance else 0.0))
    return {
        "root": root,
        "multiplier": multiplier,
        "expiry": expiry,
        "maintenance_margin": maintenance,
        "initial_margin": initial,
    }


def normalize_future_quote_symbol(symbol: str) -> str:
    s = (symbol or "").strip().upper()
    if not s:
        return s
    return s if s.startswith("/") else f"/{s}"


def get_futures_ladder_demo() -> List[Dict[str, Any]]:
    def _run(conn):
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, symbol, expiry, multiplier
            FROM instruments
            WHERE asset_class='future'
            ORDER BY expiry
            """,
        )
        return [dict(r) for r in cur.fetchall()]

    rows = with_conn(_run)
    if rows:
        return rows

    inverse_month = {v: k for k, v in MONTH_CODES.items()}
    today = datetime.now().date()
    base_month = today.month + 1
    year = today.year % 100
    if base_month > 12:
        base_month -= 12
        year = (today.year + 1) % 100

    def _make_symbol(root: str, month: int, yy: int) -> str:
        code = inverse_month.get(month, "F")
        return f"{root}{code}{yy:02d}"

    demo_roots = ["GC", "ES", "NQ"]
    ladder: List[Dict[str, Any]] = []
    for root in demo_roots:
        symbol = _make_symbol(root, base_month, year)
        spec = get_future_spec(symbol)
        ladder.append(
            {
                "id": f"{symbol}:FUTURE",
                "symbol": symbol,
                "expiry": spec.get("expiry"),
                "multiplier": spec.get("multiplier"),
                "maintenance_margin": spec.get("maintenance_margin"),
                "initial_margin": spec.get("initial_margin"),
            }
        )
    return ladder


def get_futures_ladder() -> List[Dict[str, Any]]:
    def _run(conn):
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, symbol, expiry, multiplier
            FROM instruments
            WHERE asset_class='future'
            ORDER BY expiry
            """,
        )
        return [dict(r) for r in cur.fetchall()]

    rows = with_conn(_run)
    if not rows:
        return []

    symbols = [r.get("symbol") for r in rows if r.get("symbol")]
    quote_map: Dict[str, float] = {}
    if symbols:
        try:
            quote_symbols = []
            for sym in symbols:
                quote_symbols.append(sym)
                quote_symbols.append(normalize_future_quote_symbol(sym))
            quotes = schwab.get_quotes(list({s for s in quote_symbols if s}))
            for row in quotes or []:
                symbol = (row.get("ticker") or row.get("sym") or row.get("symbol") or "").upper()
                if not symbol:
                    continue
                symbol = symbol.lstrip("/")
                quote = row.get("lastQuote") or row.get("quote") or {}
                trade = row.get("lastTrade") or row.get("trade") or {}
                bid = float(quote.get("bid") or quote.get("bp") or 0)
                ask = float(quote.get("ask") or quote.get("ap") or 0)
                last = float(trade.get("price") or trade.get("p") or 0)
                price = last or (bid + ask) / 2 if bid and ask else bid or ask
                if price:
                    quote_map[symbol] = float(price)
        except Exception:
            quote_map = {}

    if symbols and not quote_map:
        try:
            quotes = stooq.get_quotes(symbols)
            for row in quotes or []:
                symbol = (row.get("ticker") or row.get("sym") or row.get("symbol") or "").upper()
                if not symbol:
                    continue
                symbol = symbol.lstrip("/")
                trade = row.get("lastTrade") or row.get("trade") or {}
                last = float(trade.get("price") or trade.get("p") or 0)
                if last:
                    quote_map[symbol] = float(last)
        except Exception:
            quote_map = {}

    for row in rows:
        symbol = (row.get("symbol") or "").upper()
        spec = get_future_spec(symbol)
        if spec.get("multiplier"):
            row["multiplier"] = spec.get("multiplier")
        if spec.get("expiry") and not row.get("expiry"):
            row["expiry"] = spec.get("expiry")
        row["maintenance_margin"] = spec.get("maintenance_margin")
        row["initial_margin"] = spec.get("initial_margin")
        if symbol in quote_map:
            row["last"] = quote_map[symbol]
    return rows
