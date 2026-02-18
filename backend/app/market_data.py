from __future__ import annotations

import hashlib
import math
import random
from datetime import date, timedelta
from typing import Any

from .services.stooq import get_history

_HISTORY_CACHE: dict[str, list[tuple[date, float]]] = {}


def _stable_seed(symbol: str) -> int:
    digest = hashlib.sha256(symbol.encode("utf-8")).hexdigest()
    return int(digest[:16], 16)


def _business_days(start: date, end: date) -> list[date]:
    out: list[date] = []
    cursor = start
    while cursor <= end:
        if cursor.weekday() < 5:
            out.append(cursor)
        cursor += timedelta(days=1)
    return out


def _generate_fallback_history(symbol: str, years: int = 8) -> list[tuple[date, float]]:
    seed = _stable_seed(symbol)
    rng = random.Random(seed)
    end = date.today()
    start = end - timedelta(days=365 * years)
    days = _business_days(start, end)

    base = 20 + (seed % 18000) / 100
    drift = rng.uniform(-0.0001, 0.0007)
    vol = rng.uniform(0.006, 0.02)
    price = base

    out: list[tuple[date, float]] = []
    for idx, d in enumerate(days):
        cyclical = math.sin(idx / 18.0) * (vol / 3.5)
        shock = rng.gauss(mu=drift + cyclical, sigma=vol)
        price *= 1 + shock
        price = round(max(price, 0.5), 4)
        out.append((d, price))
    return out


def _normalize_rows(rows: list[dict[str, Any]]) -> list[tuple[date, float]]:
    normalized: list[tuple[date, float]] = []
    for row in rows:
        raw_date = row.get("date")
        raw_close = row.get("close")
        if not raw_date or raw_close is None:
            continue
        try:
            d = date.fromisoformat(str(raw_date))
            px = float(raw_close)
        except Exception:
            continue
        if px > 0:
            normalized.append((d, px))
    normalized.sort(key=lambda item: item[0])
    return normalized


def get_symbol_history(symbol: str) -> list[tuple[date, float]]:
    symbol = symbol.strip().upper()
    if not symbol:
        return []

    cached = _HISTORY_CACHE.get(symbol)
    if cached is not None:
        return cached

    rows = get_history(symbol)
    normalized = _normalize_rows(rows)
    if len(normalized) < 30:
        normalized = _generate_fallback_history(symbol)

    _HISTORY_CACHE[symbol] = normalized
    return normalized


def get_prices_for_dates(symbol: str, dates: list[date]) -> list[float]:
    history = get_symbol_history(symbol)
    if not dates:
        return []
    if not history:
        return [0.0] * len(dates)

    prices: list[float] = []
    idx = 0
    n = len(history)
    last_price = history[0][1]

    for d in dates:
        while idx < n and history[idx][0] <= d:
            last_price = history[idx][1]
            idx += 1
        prices.append(last_price)

    return prices
