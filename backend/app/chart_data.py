from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable

RANGE_TO_BARS = {
    "1M": 22,
    "3M": 66,
    "6M": 132,
    "1Y": 252,
    "2Y": 504,
    "5Y": 1260,
}


@dataclass
class Candle:
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: int


def _symbol_seed(symbol: str) -> int:
    digest = hashlib.sha256(symbol.encode("utf-8")).hexdigest()
    return int(digest[:16], 16)


def _iter_trading_days(start: date, bars: int) -> Iterable[date]:
    produced = 0
    cursor = start
    while produced < bars:
        if cursor.weekday() < 5:
            produced += 1
            yield cursor
        cursor += timedelta(days=1)


def _round_price(value: float) -> float:
    return round(max(value, 0.01), 2)


def generate_candles(symbol: str, range_key: str) -> list[Candle]:
    bars = RANGE_TO_BARS[range_key]
    rng = random.Random(_symbol_seed(symbol.upper()))

    # Stable but symbol-dependent profile.
    base_price = 25 + ((_symbol_seed(symbol) % 20000) / 100)
    drift = rng.uniform(-0.0002, 0.0008)
    vol = rng.uniform(0.007, 0.028)

    start = date.today() - timedelta(days=int(bars * 1.6))
    candles: list[Candle] = []
    price = base_price

    for idx, day in enumerate(_iter_trading_days(start, bars)):
        cycle = math.sin(idx / 15.0) * (vol / 3)
        shock = rng.gauss(mu=drift + cycle, sigma=vol)

        open_price = price
        close_price = open_price * (1 + shock)

        wick_scale = vol * rng.uniform(0.25, 0.85)
        high = max(open_price, close_price) * (1 + wick_scale)
        low = min(open_price, close_price) * (1 - wick_scale)

        close_price = _round_price(close_price)
        open_price = _round_price(open_price)
        high = _round_price(max(high, open_price, close_price))
        low = _round_price(min(low, open_price, close_price))

        volume = int(rng.uniform(120_000, 2_400_000) * (1 + min(abs(shock) * 8, 2)))

        candles.append(
            Candle(
                time=day.isoformat(),
                open=open_price,
                high=high,
                low=low,
                close=close_price,
                volume=volume,
            )
        )
        price = close_price

    return candles


def moving_average(candles: list[Candle], period: int) -> list[dict[str, float | str]]:
    if period <= 0:
        return []
    out: list[dict[str, float | str]] = []
    window: list[float] = []
    running = 0.0

    for candle in candles:
        close = candle.close
        window.append(close)
        running += close
        if len(window) > period:
            running -= window.pop(0)
        if len(window) == period:
            out.append({"time": candle.time, "value": round(running / period, 2)})

    return out
