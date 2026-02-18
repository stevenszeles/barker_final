from __future__ import annotations

import csv
from datetime import datetime
from io import StringIO
import time
from typing import List, Dict, Any, Optional

import httpx


def _to_stooq_symbol(symbol: str) -> str:
    base = symbol.strip().lower()
    if not base:
        return base
    if base in {"^gspc", "^spx", "spx", "$spx"}:
        return "^spx"
    if base.startswith("^"):
        return base
    if base.endswith(".us"):
        return base
    return f"{base}.us"


_RATE_LIMIT_UNTIL = 0.0


def _rate_limited() -> bool:
    return time.time() < _RATE_LIMIT_UNTIL


def _mark_rate_limited(window_sec: int = 3600) -> None:
    global _RATE_LIMIT_UNTIL
    until = time.time() + float(window_sec)
    if until > _RATE_LIMIT_UNTIL:
        _RATE_LIMIT_UNTIL = until


def _looks_rate_limited(text: str) -> bool:
    return "exceeded the daily hits limit" in (text or "").lower()


def get_quotes(symbols: List[str], timeout: float = 8.0) -> List[Dict[str, Any]]:
    if not symbols:
        return []
    if _rate_limited():
        return []
    stooq_symbols = [_to_stooq_symbol(s) for s in symbols if s]
    query = ",".join(stooq_symbols)
    url = f"https://stooq.com/q/l/?s={query}&f=sd2t2ohlcv&h&e=csv"
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(url)
            if resp.status_code in {403, 429}:
                _mark_rate_limited()
                return []
            resp.raise_for_status()
            text = resp.text
    except httpx.HTTPStatusError:
        _mark_rate_limited()
        return []
    except Exception:
        return []

    if _looks_rate_limited(text):
        _mark_rate_limited()
        return []

    reader = csv.DictReader(StringIO(text))
    tickers: List[Dict[str, Any]] = []
    for row in reader:
        symbol = (row.get("Symbol") or "").replace(".US", "").replace(".us", "").upper()
        if not symbol or symbol == "N/A":
            continue
        close_raw = row.get("Close") or row.get("close") or ""
        if str(close_raw).strip().upper() in {"N/D", "N/A", "--", "-"}:
            continue
        try:
            close = float(str(close_raw).replace(",", ""))
        except Exception:
            continue
        if close <= 0:
            continue
        bid = close
        ask = close
        tickers.append(
            {
                "ticker": symbol,
                "lastQuote": {
                    "bid": bid,
                    "ask": ask,
                    "bidSize": 0,
                    "askSize": 0,
                    "timestamp": 0,
                },
                "lastTrade": {"price": close},
            }
        )
    return tickers


def get_history(symbol: str, start_date: Optional[str] = None) -> List[Dict[str, Any]]:
    stooq_symbol = _to_stooq_symbol(symbol)
    if not stooq_symbol:
        return []
    if _rate_limited():
        return []
    url = f"https://stooq.com/q/d/l/?s={stooq_symbol}&i=d"
    try:
        with httpx.Client(timeout=8) as client:
            resp = client.get(url)
            if resp.status_code in {403, 429}:
                _mark_rate_limited()
                return []
            resp.raise_for_status()
            text = resp.text
    except httpx.HTTPStatusError:
        _mark_rate_limited()
        return []
    except Exception:
        return []

    if _looks_rate_limited(text):
        _mark_rate_limited()
        return []

    rows: List[Dict[str, Any]] = []
    reader = csv.DictReader(StringIO(text))
    start_dt = None
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
        except Exception:
            start_dt = None
    for row in reader:
        date_str = row.get("Date") or row.get("date")
        close_str = row.get("Close") or row.get("close")
        if not date_str or not close_str:
            continue
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d").date()
            close = float(close_str)
        except Exception:
            continue
        if close <= 0:
            continue
        if start_dt and d < start_dt:
            continue
        rows.append({"date": d.isoformat(), "close": close})
    return rows
