from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List
import httpx

from ..config import settings


def _auth_params() -> Dict[str, str]:
    return {"apiKey": settings.polygon.api_key}


def get_snapshot(symbols: list[str]) -> Dict[str, Any]:
    if not symbols:
        return {}
    params = _auth_params()
    params["tickers"] = ",".join(symbols)
    with httpx.Client(timeout=20) as client:
        resp = client.get(f"{settings.polygon.rest_base}/v2/snapshot/locale/us/markets/stocks/tickers", params=params)
        resp.raise_for_status()
        return resp.json()


def get_quotes(symbols: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Fetch real-time quotes for multiple symbols from Polygon.
    Returns: {symbol: {price, bid, ask, source, timestamp}}
    """
    if not symbols or not settings.polygon.api_key:
        return {}
    url = f"{settings.polygon.rest_base}/v2/snapshot/locale/us/markets/stocks/tickers"
    params = {
        "tickers": ",".join(symbols[:100]),
        "apiKey": settings.polygon.api_key,
    }

    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        result: Dict[str, Dict[str, Any]] = {}
        for ticker in data.get("tickers", []):
            symbol = ticker.get("ticker")
            if not symbol:
                continue
            last_trade = ticker.get("lastTrade", {})
            last_quote = ticker.get("lastQuote", {})
            day = ticker.get("day", {})

            price = last_trade.get("p") or day.get("c") or last_quote.get("P")
            if not price:
                continue

            result[symbol] = {
                "price": float(price),
                "bid": float(last_quote.get("p", price)),
                "ask": float(last_quote.get("P", price)),
                "source": "polygon_realtime",
                "timestamp": ticker.get("updated"),
            }
        return result
    except Exception:
        return {}


def get_aggregates(symbol: str, multiplier: int, timespan: str, from_date: str, to_date: str) -> Dict[str, Any]:
    params = _auth_params()
    url = f"{settings.polygon.rest_base}/v2/aggs/ticker/{symbol}/range/{multiplier}/{timespan}/{from_date}/{to_date}"
    with httpx.Client(timeout=20) as client:
        resp = client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()


def get_previous_close(symbol: str) -> Dict[str, Any]:
    params = _auth_params()
    url = f"{settings.polygon.rest_base}/v2/aggs/ticker/{symbol}/prev"
    with httpx.Client(timeout=20) as client:
        resp = client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()


def get_market_status() -> Dict[str, Any]:
    params = _auth_params()
    url = f"{settings.polygon.rest_base}/v1/marketstatus/now"
    with httpx.Client(timeout=20) as client:
        resp = client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()


def get_options_chain(underlying: str) -> Dict[str, Any]:
    params = _auth_params()
    url = f"{settings.polygon.rest_base}/v3/snapshot/options/{underlying}"
    with httpx.Client(timeout=20) as client:
        resp = client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()


def get_price_history(symbol: str, start_date: str) -> List[Dict[str, Any]]:
    """
    Fetch historical prices from Polygon.
    Returns list of {date, close} dictionaries.
    """
    if not settings.polygon.api_key:
        return []

    try:
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.now()
    except Exception:
        return []

    url = f"{settings.polygon.rest_base}/v2/aggs/ticker/{symbol}/range/1/day/{start.strftime('%Y-%m-%d')}/{end.strftime('%Y-%m-%d')}"
    params = {"adjusted": "true", "sort": "asc", "apiKey": settings.polygon.api_key}

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        results = []
        for bar in data.get("results", []):
            ts = bar.get("t")
            if not ts:
                continue
            date = datetime.fromtimestamp(ts / 1000).date().isoformat()
            close = bar.get("c")
            if close:
                results.append({"date": date, "close": float(close)})
        return results
    except Exception:
        return []
