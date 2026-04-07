from __future__ import annotations

import csv
from datetime import datetime, timedelta, timezone
from html import unescape
from io import StringIO
import re
import time
from typing import List, Dict, Any, Optional
from urllib.parse import quote

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


def _to_yahoo_symbol(symbol: str) -> str:
    raw = (symbol or "").strip().upper()
    if not raw:
        return raw
    if raw in {"^GSPC", "^SPX", "SPX", "$SPX"}:
        return "^GSPC"
    if raw.endswith(".US"):
        return raw[:-3]
    return raw


_RATE_LIMIT_UNTIL = 0.0
_DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept-Language": "en-US,en;q=0.9",
}
_HISTORY_TABLE_RE = re.compile(r"<table[^>]+id=fth1[^>]*>(.*?)</table>", re.IGNORECASE | re.DOTALL)
_HISTORY_ROW_RE = re.compile(r"<tr[^>]*>(.*?)</tr>", re.IGNORECASE | re.DOTALL)
_HISTORY_CELL_RE = re.compile(r"<t[dh][^>]*>(.*?)</t[dh]>", re.IGNORECASE | re.DOTALL)
_HISTORY_TAG_RE = re.compile(r"<[^>]+>")
_MONTH_MAP = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}
_STOOQ_HISTORY_PAGE_SIZE = 40
_MAX_HISTORY_PAGES = 250


def _rate_limited() -> bool:
    return time.time() < _RATE_LIMIT_UNTIL


def _mark_rate_limited(window_sec: int = 900) -> None:
    global _RATE_LIMIT_UNTIL
    until = time.time() + float(window_sec)
    if until > _RATE_LIMIT_UNTIL:
        _RATE_LIMIT_UNTIL = until


def _looks_rate_limited(text: str) -> bool:
    return "exceeded the daily hits limit" in (text or "").lower()


def _strip_html(fragment: str) -> str:
    text = _HISTORY_TAG_RE.sub("", fragment or "")
    return unescape(text).replace("\xa0", " ").strip()


def _parse_history_date(value: str) -> Optional[str]:
    text = (value or "").strip()
    if not text:
        return None
    try:
        return datetime.strptime(text, "%Y-%m-%d").date().isoformat()
    except Exception:
        pass
    match = re.match(r"^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$", text)
    if not match:
        return None
    month = _MONTH_MAP.get(match.group(2).lower())
    if not month:
        return None
    try:
        return datetime(int(match.group(3)), month, int(match.group(1))).date().isoformat()
    except Exception:
        return None


def _extract_history_rows(text: str) -> List[Dict[str, Any]]:
    table_match = _HISTORY_TABLE_RE.search(text or "")
    if not table_match:
        return []
    rows: List[Dict[str, Any]] = []
    for row_html in _HISTORY_ROW_RE.findall(table_match.group(1)):
        cells = _HISTORY_CELL_RE.findall(row_html)
        if len(cells) < 6:
            continue
        date_iso = _parse_history_date(_strip_html(cells[1]))
        if not date_iso:
            continue
        close_text = _strip_html(cells[5]).replace(",", "")
        try:
            close = float(close_text)
        except Exception:
            continue
        if close <= 0:
            continue
        rows.append({"date": date_iso, "close": close})
    return rows


def _history_page_limit(start_dt: Optional[datetime.date]) -> int:
    if start_dt is None:
        return 120
    lookback_days = max(30, (datetime.utcnow().date() - start_dt).days)
    estimated = int(lookback_days / 28) + 3
    return max(2, min(_MAX_HISTORY_PAGES, estimated))


def get_quotes(symbols: List[str], timeout: float = 8.0) -> List[Dict[str, Any]]:
    if not symbols:
        return []
    if _rate_limited():
        return []
    stooq_symbols = [_to_stooq_symbol(s) for s in symbols if s]
    query = ",".join(stooq_symbols)
    url = f"https://stooq.com/q/l/?s={query}&f=sd2t2ohlcv&h&e=csv"
    try:
        with httpx.Client(timeout=timeout, headers=_DEFAULT_HEADERS, follow_redirects=True) as client:
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
    start_dt = None
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
        except Exception:
            start_dt = None
    max_pages = _history_page_limit(start_dt)
    rows: List[Dict[str, Any]] = []
    seen_dates: set[str] = set()
    try:
        with httpx.Client(timeout=8, headers=_DEFAULT_HEADERS, follow_redirects=True) as client:
            for page in range(1, max_pages + 1):
                page_url = f"https://stooq.com/q/d/?s={quote(stooq_symbol)}&i=d"
                if page > 1:
                    page_url = f"{page_url}&l={page}"
                resp = client.get(page_url)
                if resp.status_code in {403, 429}:
                    _mark_rate_limited()
                    return []
                resp.raise_for_status()
                text = resp.text
                if _looks_rate_limited(text):
                    _mark_rate_limited()
                    return []
                page_rows = _extract_history_rows(text)
                if not page_rows:
                    break
                reached_start = False
                inserted = 0
                for row in page_rows:
                    date_iso = row["date"]
                    if start_dt and date_iso < start_dt.isoformat():
                        reached_start = True
                        continue
                    if date_iso in seen_dates:
                        continue
                    seen_dates.add(date_iso)
                    rows.append(row)
                    inserted += 1
                if reached_start or len(page_rows) < _STOOQ_HISTORY_PAGE_SIZE or inserted == 0:
                    break
    except httpx.HTTPStatusError:
        _mark_rate_limited()
        return []
    except Exception:
        return []

    rows.sort(key=lambda row: row["date"])
    return rows


def get_history_yahoo(symbol: str, start_date: Optional[str] = None, timeout: float = 10.0) -> List[Dict[str, Any]]:
    yahoo_symbol = _to_yahoo_symbol(symbol)
    if not yahoo_symbol:
        return []

    try:
      start_dt = datetime.strptime(start_date, "%Y-%m-%d").date() if start_date else (datetime.utcnow().date() - timedelta(days=3650))
    except Exception:
      start_dt = datetime.utcnow().date() - timedelta(days=3650)

    period1 = int(datetime.combine(start_dt, datetime.min.time(), tzinfo=timezone.utc).timestamp())
    period2 = int(datetime.combine(datetime.utcnow().date() + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc).timestamp())
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(yahoo_symbol)}"
    params = {
        "interval": "1d",
        "period1": str(period1),
        "period2": str(period2),
        "includePrePost": "false",
        "events": "div,splits",
    }

    try:
        with httpx.Client(timeout=timeout, headers=_DEFAULT_HEADERS, follow_redirects=True) as client:
            resp = client.get(url, params=params)
            if resp.status_code in {403, 429}:
                return []
            resp.raise_for_status()
            payload = resp.json()
    except Exception:
        return []

    chart = ((payload or {}).get("chart") or {})
    results = chart.get("result") or []
    if not results:
        return []

    result = results[0] or {}
    timestamps = result.get("timestamp") or []
    quote_rows = (((result.get("indicators") or {}).get("quote") or [{}])[0] or {})
    adj_rows = (((result.get("indicators") or {}).get("adjclose") or [{}])[0] or {})
    closes = adj_rows.get("adjclose") or quote_rows.get("close") or []

    out: List[Dict[str, Any]] = []
    for idx, ts in enumerate(timestamps):
        try:
            close = closes[idx]
        except Exception:
            close = None
        if close is None:
            continue
        try:
            close_val = float(close)
        except Exception:
            continue
        if close_val <= 0:
            continue
        try:
            point_date = datetime.fromtimestamp(int(ts), tz=timezone.utc).date().isoformat()
        except Exception:
            continue
        if start_date and point_date < start_date:
            continue
        out.append({"date": point_date, "close": close_val})

    return out
