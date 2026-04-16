from __future__ import annotations

import asyncio
import io
import textwrap

from starlette.datastructures import UploadFile


def test_parse_custaccs_positions_classifies_futures_rows():
    from backend.app.routers.admin import _parse_custaccs_positions

    sample = textwrap.dedent(
        """\
        Positions for CUSTACCS as of 01:18 AM ET, 02/10/2026
        Limit Liability Company ...145
        Symbol,Description,Qty (Quantity),Price,Mkt Val (Market Value),Cost Basis,Security Type
        ESH26,E-mini S&P 500 Mar 2026,2,5000.00,"1,250.00","0.00",Future
        Account Total,,,,"1,250.00",,
        """
    )

    result = _parse_custaccs_positions(sample)
    assert len(result["positions"]) == 1
    row = result["positions"][0]

    assert row["symbol"] == "ESH26"
    assert row["asset_class"] == "future"
    assert row["instrument_id"] == "ESH26:FUTURE"
    assert row["underlying"] == "ES"
    assert row["multiplier"] == 50.0


def test_store_transactions_static_zeroes_future_cash_flow(monkeypatch):
    import backend.app.routers.admin as admin_router

    recorded: dict[str, list[tuple]] = {"trade_rows": [], "cash_rows": []}

    class _Cursor:
        def __init__(self):
            self.last_sql = ""

        def execute(self, sql, params=None):
            self.last_sql = str(sql)

        def executemany(self, sql, seq):
            self.last_sql = str(sql)
            rows = list(seq)
            if "INSERT INTO trades" in self.last_sql:
                recorded["trade_rows"] = rows
            elif "INSERT INTO cash_flows" in self.last_sql:
                recorded["cash_rows"] = rows

        def fetchall(self):
            return []

        def fetchone(self):
            return None

    class _Conn:
        def __init__(self):
            self.cursor_obj = _Cursor()

        def cursor(self):
            return self.cursor_obj

        def commit(self):
            return None

    conn = _Conn()
    monkeypatch.setattr(admin_router, "with_conn", lambda fn: fn(conn))
    monkeypatch.setattr(admin_router, "_load_symbol_sector_map_for_account", lambda conn, account: {})

    out = admin_router._store_transactions_static(
        rows=[
            {
                "Date": "2026-03-04",
                "Action": "SELL",
                "Symbol": "ESH26",
                "Description": "E-mini S&P 500",
                "Quantity": "1",
                "Price": "5000",
                "Amount": "250000",
                "RealizedPL": "1250",
            }
        ],
        account="Limit_Liability_Company ...145",
        import_source="CSV_REALIZED",
        replace=False,
    )

    assert out["ok"] is True
    assert out["trades_created"] == 1
    assert recorded["cash_rows"] == []

    trade_row = recorded["trade_rows"][0]
    assert trade_row[4] == "ESH26:FUTURE"
    assert trade_row[12] == "future"
    assert trade_row[17] == 50.0
    assert trade_row[23] == 0.0


def test_import_transactions_reuses_existing_legacy_future_instrument_id(monkeypatch):
    import backend.app.routers.admin as admin_router

    captured_trades = []

    class _Cursor:
        def __init__(self):
            self.last_sql = ""

        def execute(self, sql, params=None):
            self.last_sql = str(sql)

        def executemany(self, sql, seq):
            self.last_sql = str(sql)

        def fetchall(self):
            if "SELECT instrument_id, qty FROM positions" in self.last_sql:
                return [{"instrument_id": "ESH26:EQUITY", "qty": 1.0}]
            return []

        def fetchone(self):
            return None

    class _Conn:
        def __init__(self):
            self.cursor_obj = _Cursor()

        def cursor(self):
            return self.cursor_obj

        def commit(self):
            return None

    def _fake_apply_trade(payload):
        captured_trades.append(dict(payload))
        return True, "Trade saved.", "T-1"

    monkeypatch.setattr(admin_router.settings, "static_mode", False)
    monkeypatch.setattr(admin_router, "with_conn", lambda fn: fn(_Conn()))
    monkeypatch.setattr(admin_router, "_get_account_record", lambda account: {})
    monkeypatch.setattr(admin_router, "_load_symbol_sector_map_for_account", lambda conn, account: {})
    monkeypatch.setattr(admin_router, "_queue_nav_rebuild", lambda account, limit: None)
    monkeypatch.setattr(admin_router.legacy_engine, "compute_cash_balance_total", lambda account=None: 0.0)
    monkeypatch.setattr(admin_router.legacy_engine, "apply_trade", _fake_apply_trade)
    monkeypatch.setattr(admin_router.legacy_engine, "close_expired_options", lambda account=None: 0)
    monkeypatch.setattr(admin_router.legacy_engine, "_clear_nav_cache", lambda: None)

    upload = UploadFile(
        filename="transactions.csv",
        file=io.BytesIO(
            textwrap.dedent(
                """\
                Date,Action,Symbol,Description,Quantity,Price,Amount
                03/04/2026,Sell to Close,ESH26,E-mini S&P 500,1,5000,250000
                """
            ).encode("utf-8")
        ),
    )

    out = asyncio.run(
        admin_router.import_transactions(
            upload,
            account="Limit_Liability_Company ...145",
            replace=False,
            allow_overlap=False,
        )
    )

    assert out["ok"] is True
    assert out["trades_created"] == 1
    assert captured_trades[0]["asset_class"] == "future"
    assert captured_trades[0]["instrument_id"] == "ESH26:EQUITY"


def test_ensure_instrument_updates_existing_future_metadata():
    from backend.app.services import legacy_engine as engine

    captured_updates = []

    class _Cursor:
        def __init__(self):
            self.last_sql = ""

        def execute(self, sql, params=None):
            self.last_sql = str(sql)
            if self.last_sql.startswith("UPDATE instruments SET"):
                captured_updates.append((self.last_sql, params))

        def fetchone(self):
            return {
                "id": "ESH26:EQUITY",
                "symbol": "ESH26",
                "asset_class": "equity",
                "underlying": "ESH26",
                "expiry": None,
                "strike": None,
                "option_type": None,
                "multiplier": 1.0,
            }

    class _Conn:
        def __init__(self):
            self.cursor_obj = _Cursor()

        def cursor(self):
            return self.cursor_obj

        def commit(self):
            return None

    conn = _Conn()
    data = engine._ensure_instrument(
        conn,
        "ESH26:EQUITY",
        {
            "id": "ESH26:EQUITY",
            "symbol": "ESH26",
            "asset_class": "future",
            "underlying": "ES",
            "expiry": "2026-03-01",
            "strike": None,
            "option_type": None,
            "multiplier": 50.0,
        },
    )

    assert data["asset_class"] == "future"
    assert data["underlying"] == "ES"
    assert data["multiplier"] == 50.0
    assert captured_updates
