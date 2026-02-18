import os
import sys
from datetime import date, timedelta

# Use isolated DB
DB_PATH = "/tmp/barker_stress_test.db"
os.environ["WS_DB_PATH"] = DB_PATH

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.app.db import ensure_schema, with_conn
from backend.app.services import legacy_engine as engine


def reset_db():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    ensure_schema()


def insert_price_series(symbol: str, start: date, end: date, start_px: float, step: float = 0.5):
    rows = []
    px = start_px
    d = start
    while d <= end:
        rows.append((symbol, d.isoformat(), float(px)))
        px += step
        d += timedelta(days=1)
    def _run(conn):
        cur = conn.cursor()
        cur.executemany("INSERT OR REPLACE INTO price_cache(symbol, date, close) VALUES(?,?,?)", rows)
        conn.commit()
    with_conn(_run)


def insert_instrument(symbol: str, asset_class: str = "equity", multiplier: float = 1.0):
    def _run(conn):
        cur = conn.cursor()
        cur.execute(
            "INSERT OR REPLACE INTO instruments(id, symbol, asset_class, underlying, expiry, strike, option_type, multiplier) VALUES(?,?,?,?,?,?,?,?)",
            (f"{symbol}:{asset_class.upper()}", symbol, asset_class, symbol, "", 0.0, "", float(multiplier)),
        )
        conn.commit()
    with_conn(_run)


def insert_position(account: str, symbol: str, qty: float, price: float, avg_cost: float):
    instrument_id = f"{symbol}:EQUITY"
    def _run(conn):
        cur = conn.cursor()
        cur.execute(
            "INSERT OR REPLACE INTO positions(account, instrument_id, qty, price, market_value, avg_cost) VALUES(?,?,?,?,?,?)",
            (account, instrument_id, float(qty), float(price), float(qty) * float(price), float(avg_cost)),
        )
        conn.commit()
    with_conn(_run)


def set_account_cash(account: str, cash: float, asof: str):
    def _run(conn):
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO accounts(account, cash, asof) VALUES(?,?,?)", (account, float(cash), asof))
        conn.commit()
    with_conn(_run)


def scenario_positions_only():
    account = "TEST_POS"
    set_account_cash(account, 10000.0, "2026-02-01")
    insert_instrument("TEST")
    insert_position(account, "TEST", 10, 110, 100)
    insert_price_series("TEST", date(2026, 1, 1), date(2026, 2, 17), 100.0, 0.2)
    def _run(conn):
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO price_cache(symbol, date, close) VALUES(?,?,?)", ("TEST", "2026-02-17", 110.0))
        conn.commit()
    with_conn(_run)
    snap = engine.get_snapshot(account=account)
    assert round(snap["nlv"], 2) == 11100.00, f"NLV expected 11100 got {snap['nlv']}"
    assert round(snap["total_pnl"], 2) == 100.00, f"Total PnL expected 100 got {snap['total_pnl']}"
    print("Scenario A OK")


def scenario_trades_realized():
    account = "TEST_TRADES"
    set_account_cash(account, 20000.0, "2026-01-01")
    insert_instrument("ACME")
    insert_price_series("ACME", date(2026, 1, 1), date(2026, 2, 17), 100.0, 0.5)
    # Buy 10 @ 100
    engine.apply_trade({
        "account": account,
        "symbol": "ACME",
        "qty": 10,
        "price": 100,
        "side": "BUY",
        "trade_date": "2026-01-02",
        "skip_cash_check": True,
    })
    # Sell 5 @ 110
    engine.apply_trade({
        "account": account,
        "symbol": "ACME",
        "qty": 5,
        "price": 110,
        "side": "SELL",
        "trade_date": "2026-01-10",
        "skip_cash_check": True,
    })

    # Update price for today (120)
    def _run(conn):
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO price_cache(symbol, date, close) VALUES(?,?,?)", ("ACME", "2026-02-17", 120.0))
        conn.commit()
    with_conn(_run)

    snap = engine.get_snapshot(account=account)
    # unrealized = 5*(120-100)=100, realized=5*(110-100)=50
    assert round(snap["total_pnl"], 2) == 150.00, f"Total PnL expected 150 got {snap['total_pnl']}"
    print("Scenario B OK")


def run():
    reset_db()
    engine._set_setting("bench_start", "2026-01-01")
    scenario_positions_only()
    scenario_trades_realized()
    print("All stress tests passed.")


if __name__ == "__main__":
    run()
