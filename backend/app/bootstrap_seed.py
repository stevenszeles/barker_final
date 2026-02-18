from __future__ import annotations

import logging
from datetime import date

from .analytics import trading_days_for_range, value_series_for_scope
from .data_store import get_dataset
from .db import with_conn
from .market_data import get_prices_for_dates
from .services import portfolio

LOGGER = logging.getLogger(__name__)

SECTOR_BY_SYMBOL = {
    "AAPL": "Information Technology",
    "MSFT": "Information Technology",
    "NVDA": "Information Technology",
    "QQQM": "Information Technology",
    "GOOGL": "Communication Services",
    "AMZN": "Consumer Discretionary",
    "SCHD": "Financials",
    "VIG": "Consumer Staples",
    "TLT": "Utilities",
    "BND": "Utilities",
    "VTI": "Information Technology",
    "VXUS": "Industrials",
    "AVUV": "Industrials",
    "VOO": "Information Technology",
    "IJH": "Industrials",
    "IEF": "Utilities",
    "GLD": "Materials",
}


def _account_positions_and_cash(account: dict) -> tuple[list[dict], float]:
    positions: list[dict] = []
    cash = 0.0
    for sleeve in account.get("portfolios", []):
        cash += float(sleeve.get("cash") or 0.0)
        for position in sleeve.get("positions", []):
            symbol = str(position.get("symbol") or "").strip().upper()
            shares = float(position.get("shares") or 0.0)
            avg_cost = float(position.get("avg_cost") or 0.0)
            if not symbol or shares == 0:
                continue
            positions.append({"symbol": symbol, "shares": shares, "avg_cost": avg_cost})
    return positions, cash


def _store_price_series(symbol: str, dates: list[date], prices: list[float]) -> None:
    rows = []
    for d, price in zip(dates, prices):
        px = float(price or 0.0)
        if px <= 0:
            continue
        rows.append((symbol, d.isoformat(), px))
    if not rows:
        return

    def _run(conn):
        cur = conn.cursor()
        cur.executemany(
            "INSERT OR REPLACE INTO price_cache(symbol, date, close) VALUES(?,?,?)",
            rows,
        )
        conn.commit()

    with_conn(_run)


def seed_demo_portfolio_if_empty() -> None:
    """Populate a baseline portfolio from data/portfolio_data.json for local static mode.

    This runs only when no positions exist, so user-imported data is never overwritten.
    """
    try:
        existing = portfolio.get_positions_local(account=None, use_cache=False)
        if existing:
            return

        dataset = get_dataset()
        today = date.today().isoformat()
        nav_dates = trading_days_for_range("1Y")
        bench_prices = get_prices_for_dates("SPY", nav_dates)
        latest_price_by_symbol: dict[str, float] = {}

        symbols: set[str] = set()
        for account in dataset.get("accounts", []):
            for sleeve in account.get("portfolios", []):
                for position in sleeve.get("positions", []):
                    symbol = str(position.get("symbol") or "").strip().upper()
                    if symbol:
                        symbols.add(symbol)
        for symbol in symbols:
            prices = get_prices_for_dates(symbol, nav_dates)
            if prices:
                latest_price_by_symbol[symbol] = float(prices[-1])
                _store_price_series(symbol, nav_dates, prices)
        _store_price_series("SPY", nav_dates, bench_prices)

        total_nav = 0.0
        account_nav_series: dict[str, list[float]] = {}

        # Start clean and repopulate from JSON file.
        portfolio.clear_nav_history(account=None)

        for account in dataset.get("accounts", []):
            account_code = str(account.get("id") or "").strip().upper()
            if not account_code:
                continue

            positions_for_nav, account_cash = _account_positions_and_cash(account)
            account_values = value_series_for_scope(positions_for_nav, account_cash, nav_dates, get_prices_for_dates)
            account_value = float(account_values[-1] if account_values else account_cash)
            account_nav_series[account_code] = account_values

            for sleeve in account.get("portfolios", []):
                sleeve_name = str(sleeve.get("name") or sleeve.get("id") or account_code)
                sleeve_id = str(sleeve.get("id") or "")

                for position in sleeve.get("positions", []):
                    symbol = str(position.get("symbol") or "").strip().upper()
                    shares = float(position.get("shares") or 0.0)
                    avg_cost = float(position.get("avg_cost") or 0.0)
                    if not symbol or shares == 0:
                        continue

                    mark_price = float(latest_price_by_symbol.get(symbol) or avg_cost)
                    sector = SECTOR_BY_SYMBOL.get(symbol)
                    portfolio.upsert_position(
                        {
                            "account": account_code,
                            "symbol": symbol,
                            "qty": shares,
                            "price": mark_price,
                            "avg_cost": avg_cost,
                            "sector": sector,
                            "strategy_id": sleeve_id,
                            "strategy_name": sleeve_name,
                        }
                    )

            portfolio.set_account_cash(account_code, account_cash, asof=today, account_value=account_value)
            for d, nav, bench in zip(nav_dates, account_values, bench_prices):
                portfolio.store_nav_snapshot(account_code, d.isoformat(), float(nav), bench=float(bench))
            total_nav += account_value

        if total_nav > 0:
            total_series = [0.0 for _ in nav_dates]
            for account_values in account_nav_series.values():
                for idx, nav in enumerate(account_values):
                    total_series[idx] += float(nav)
            for d, nav, bench in zip(nav_dates, total_series, bench_prices):
                portfolio.store_nav_snapshot("ALL", d.isoformat(), float(nav), bench=float(bench))

        LOGGER.info("Seeded demo portfolio data from data/portfolio_data.json")
    except Exception as exc:
        LOGGER.exception("Demo seed failed: %s", exc)
