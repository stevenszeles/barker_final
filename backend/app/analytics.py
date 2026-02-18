from __future__ import annotations

import math
from datetime import date, timedelta
from statistics import mean, stdev

RANGE_TO_DAYS = {
    "1M": 22,
    "3M": 66,
    "6M": 132,
    "1Y": 252,
    "3Y": 756,
    "5Y": 1260,
}


def trading_days_for_range(range_key: str) -> list[date]:
    bars = RANGE_TO_DAYS[range_key]
    end = date.today()
    start = end - timedelta(days=int(bars * 1.8))

    all_days: list[date] = []
    cursor = start
    while cursor <= end:
        if cursor.weekday() < 5:
            all_days.append(cursor)
        cursor += timedelta(days=1)

    return all_days[-bars:]


def value_series_for_scope(
    positions: list[dict[str, float | str]],
    cash: float,
    dates: list[date],
    price_lookup,
) -> list[float]:
    if not dates:
        return []

    total = [float(cash)] * len(dates)
    for position in positions:
        symbol = str(position["symbol"])
        shares = float(position["shares"])
        prices = price_lookup(symbol, dates)
        for idx, price in enumerate(prices):
            total[idx] += shares * float(price)
    return total


def points_from_values(dates: list[date], values: list[float], digits: int = 2) -> list[dict[str, float | str]]:
    return [{"time": d.isoformat(), "value": round(v, digits)} for d, v in zip(dates, values)]


def indexed_points(dates: list[date], values: list[float], base: float = 100.0) -> list[dict[str, float | str]]:
    if not values:
        return []
    anchor = values[0] if values[0] > 0 else 1.0
    indexed = [(v / anchor) * base for v in values]
    return points_from_values(dates, indexed, digits=3)


def _returns(values: list[float]) -> list[float]:
    if len(values) < 2:
        return []
    out: list[float] = []
    prev = values[0]
    for cur in values[1:]:
        if prev <= 0:
            out.append(0.0)
        else:
            out.append((cur / prev) - 1.0)
        prev = cur
    return out


def _max_drawdown(values: list[float]) -> float:
    if not values:
        return 0.0
    peak = values[0]
    worst = 0.0
    for value in values:
        peak = max(peak, value)
        if peak > 0:
            dd = (value / peak) - 1.0
            worst = min(worst, dd)
    return worst


def _covariance(a: list[float], b: list[float]) -> float:
    n = min(len(a), len(b))
    if n < 2:
        return 0.0
    x = a[:n]
    y = b[:n]
    mx = mean(x)
    my = mean(y)
    total = sum((xv - mx) * (yv - my) for xv, yv in zip(x, y))
    return total / (n - 1)


def performance_metrics(values: list[float], dates: list[date], benchmark_values: list[float] | None = None) -> dict[str, float]:
    if not values:
        return {
            "current_value": 0.0,
            "day_change": 0.0,
            "day_change_pct": 0.0,
            "total_return_pct": 0.0,
            "cagr_pct": 0.0,
            "annualized_vol_pct": 0.0,
            "sharpe": 0.0,
            "sortino": 0.0,
            "max_drawdown_pct": 0.0,
            "var_95_pct": 0.0,
            "beta": 0.0,
            "correlation": 0.0,
            "tracking_error_pct": 0.0,
            "information_ratio": 0.0,
        }

    rets = _returns(values)
    current = values[-1]
    prior = values[-2] if len(values) > 1 else values[-1]

    day_change = current - prior
    day_change_pct = (day_change / prior) if prior else 0.0

    total_return = (current / values[0] - 1.0) if values[0] else 0.0

    if len(dates) > 1:
        years = max((dates[-1] - dates[0]).days / 365.25, 1e-9)
        cagr = (current / values[0]) ** (1.0 / years) - 1.0 if values[0] > 0 else 0.0
    else:
        cagr = 0.0

    if len(rets) > 1:
        avg_ret = mean(rets)
        vol = stdev(rets)
        annual_vol = vol * math.sqrt(252)
        sharpe = (avg_ret / vol) * math.sqrt(252) if vol > 0 else 0.0
        downside = [r for r in rets if r < 0]
        downside_vol = stdev(downside) if len(downside) > 1 else 0.0
        sortino = (avg_ret / downside_vol) * math.sqrt(252) if downside_vol > 0 else 0.0

        sorted_rets = sorted(rets)
        idx = max(0, min(len(sorted_rets) - 1, int(0.05 * (len(sorted_rets) - 1))))
        var95 = sorted_rets[idx]
    else:
        annual_vol = 0.0
        sharpe = 0.0
        sortino = 0.0
        var95 = 0.0

    max_dd = _max_drawdown(values)

    beta = 0.0
    corr = 0.0
    tracking_error = 0.0
    information_ratio = 0.0
    if benchmark_values:
        b_rets = _returns(benchmark_values)
        n = min(len(rets), len(b_rets))
        if n > 1:
            rp = rets[:n]
            rb = b_rets[:n]
            var_b = stdev(rb) ** 2 if len(rb) > 1 else 0.0
            cov = _covariance(rp, rb)
            beta = cov / var_b if var_b > 0 else 0.0

            std_p = stdev(rp) if len(rp) > 1 else 0.0
            std_b = stdev(rb) if len(rb) > 1 else 0.0
            corr = cov / (std_p * std_b) if std_p > 0 and std_b > 0 else 0.0

            active = [p - b for p, b in zip(rp, rb)]
            if len(active) > 1:
                active_std = stdev(active)
                tracking_error = active_std * math.sqrt(252)
                information_ratio = (mean(active) / active_std) * math.sqrt(252) if active_std > 0 else 0.0

    return {
        "current_value": round(current, 2),
        "day_change": round(day_change, 2),
        "day_change_pct": round(day_change_pct * 100, 3),
        "total_return_pct": round(total_return * 100, 3),
        "cagr_pct": round(cagr * 100, 3),
        "annualized_vol_pct": round(annual_vol * 100, 3),
        "sharpe": round(sharpe, 3),
        "sortino": round(sortino, 3),
        "max_drawdown_pct": round(max_dd * 100, 3),
        "var_95_pct": round(var95 * 100, 3),
        "beta": round(beta, 3),
        "correlation": round(corr, 3),
        "tracking_error_pct": round(tracking_error * 100, 3),
        "information_ratio": round(information_ratio, 3),
    }


def holdings_snapshot(
    positions: list[dict[str, float | str]],
    latest_prices: dict[str, float],
    total_value: float,
) -> list[dict[str, float | str]]:
    rows: list[dict[str, float | str]] = []
    for position in positions:
        symbol = str(position["symbol"])
        shares = float(position["shares"])
        avg_cost = float(position["avg_cost"])
        price = float(latest_prices.get(symbol, 0.0))
        market_value = shares * price
        cost_value = shares * avg_cost
        pnl = market_value - cost_value
        pnl_pct = (pnl / cost_value * 100) if cost_value else 0.0
        weight = (market_value / total_value * 100) if total_value else 0.0

        rows.append(
            {
                "symbol": symbol,
                "shares": round(shares, 4),
                "avg_cost": round(avg_cost, 2),
                "price": round(price, 2),
                "market_value": round(market_value, 2),
                "weight_pct": round(weight, 3),
                "pnl": round(pnl, 2),
                "pnl_pct": round(pnl_pct, 3),
            }
        )

    rows.sort(key=lambda row: float(row["market_value"]), reverse=True)
    return rows
