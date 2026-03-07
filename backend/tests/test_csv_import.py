"""
Targeted regression tests for CSV import routing and ALL-account behavior.
"""
from __future__ import annotations

import asyncio
import io
import re
import textwrap
import time

import pandas as pd
import pytest


def strip_bom(text: str) -> str:
    return text.lstrip("\ufeff")


def _detect_csv_type(filename: str, text: str) -> str:
    """
    Python translation of frontend importCsvFile routing.
    """
    text_lower = strip_bom(text).lower()
    lines = [line.strip() for line in text_lower.splitlines()]
    first_rows = [line for line in lines[:20]]
    filename_lower = filename.lower()

    if any("balances for all-accounts" in row or "balances for all accounts" in row for row in first_rows):
        return "balances_report"
    if any("total accounts value" in row and "cash & cash investments total" in row for row in first_rows):
        return "balances_report"
    if any("account statement" in row for row in first_rows):
        return "account_statement"
    if (
        "realized gain/loss - lot details" in text_lower
        or any("realized gain/loss - lot details" in row for row in first_rows)
        or "gainloss_realized" in filename_lower
    ):
        return "realized_gain_loss"

    is_schwab_filename = bool(re.search(r"positions[_-]\d{4}[-_]\d{2}[-_]\d{2}", filename_lower))
    looks_like_schwab = (
        "positions for custaccs" in text_lower
        or is_schwab_filename
        or ("account total" in text_lower and "cash & cash investments" in text_lower)
    )

    is_positions_report = (
        looks_like_schwab
        or any("positions for" in row or "custaccs" in row for row in first_rows)
        or "positions" in filename_lower
    )
    if is_positions_report:
        return "positions_report"

    header = first_rows[0].split(",") if first_rows else []
    if (
        "action" in header
        and "amount" in header
        and "quantity" in header
        and any("fees" in cell for cell in header)
    ):
        return "transactions"

    return "generic"


SCHWAB_POSITIONS_CONTENT = textwrap.dedent(
    """\
    Positions for CUSTACCS as of 01:18 AM ET, 02/10/2026

    Account Name
    Symbol,Description,Qty (Quantity),Price,Mkt Val (Market Value),Cost Basis,Security Type
    AAPL,Apple Inc,100,180.00,"18,000.00","15,000.00",Equity
    Account Total,,,"18,000.00"
    Cash & Cash Investments,,,"5,000.00"
"""
)


class TestSchwabPositionsDetection:
    def test_detect_by_custaccs_content(self):
        assert _detect_csv_type("export.csv", SCHWAB_POSITIONS_CONTENT) == "positions_report"

    def test_detect_by_positions_for_in_content(self):
        text = "Positions for account My Broker 1234 as of 01/01/2026\nSymbol,Qty\nAAPL,100\n"
        assert _detect_csv_type("whatever.csv", text) == "positions_report"

    def test_detect_by_filename_with_date(self):
        text = "Symbol,Qty\nAAPL,100\n"
        assert _detect_csv_type("-Positions-2026-02-18-190423.csv", text) == "positions_report"

    def test_detect_by_filename_underscore_date(self):
        assert _detect_csv_type("Positions_2026_02_18.csv", "Symbol,Qty\n") == "positions_report"

    def test_detect_by_filename_generic_positions_word(self):
        assert _detect_csv_type("my_positions.csv", "Symbol,Qty\n") == "positions_report"

    def test_detect_account_total_and_cash(self):
        text = "AAPL,100\nAccount Total,18000\nCash & Cash Investments,5000\n"
        assert _detect_csv_type("export.csv", text) == "positions_report"

    def test_not_detected_as_positions_for_plain_generic(self):
        text = "symbol,qty,price\nAAPL,100,180\n"
        assert _detect_csv_type("holdings.csv", text) == "generic"

    def test_detect_realized_gain_loss_by_content(self):
        text = "Realized Gain/Loss - Lot Details\nSymbol,Name,Quantity\nAAPL,Apple,10\n"
        assert _detect_csv_type("export.csv", text) == "realized_gain_loss"

    def test_detect_realized_gain_loss_by_filename(self):
        text = "Symbol,Name,Quantity\nAAPL,Apple,10\n"
        assert (
            _detect_csv_type(
                "All_Accounts_GainLoss_Realized_Details_20260303-191309.csv",
                text,
            )
            == "realized_gain_loss"
        )


def test_parse_custaccs_extracts_cash():
    from backend.app.routers.admin import _parse_custaccs_positions

    result = _parse_custaccs_positions(SCHWAB_POSITIONS_CONTENT)
    assert "cash" in result
    symbols = {row["symbol"] for row in result["positions"]}
    assert not any("cash" in sym.lower() for sym in symbols)


def test_parse_custaccs_skips_zero_qty_summary_rows():
    from backend.app.routers.admin import _parse_custaccs_positions

    sample = textwrap.dedent(
        """\
        Positions for CUSTACCS as of 01:18 AM ET, 02/10/2026
        Limit Liability Company ...024
        Symbol,Description,Qty (Quantity),Price,Mkt Val (Market Value),Cost Basis,Security Type
        AAPL,Apple Inc,100,180.00,"18,000.00","15,000.00",Equity
        Futures Cash,,,,"1,500.00",,
        Futures Positions Market Value,,,,"2,200.00",,
        Cash & Cash Investments,,,,"5,000.00",,
        Account Total,,,,"26,700.00",,
        """
    )

    result = _parse_custaccs_positions(sample)
    symbols = {row["symbol"] for row in result["positions"]}
    assert symbols == {"AAPL"}
    assert result["cash"]["Limit Liability Company ...024"] == 6500.0
    assert result["account_values"]["Limit Liability Company ...024"] == 26700.0


def test_import_positions_parses_all_rows():
    from backend.app.routers.admin import _parse_custaccs_positions

    result = _parse_custaccs_positions(SCHWAB_POSITIONS_CONTENT)
    assert isinstance(result["positions"], list)
    assert len(result["positions"]) >= 1
    assert result["positions"][0]["account"]


def test_bulk_upsert_all_with_row_accounts(monkeypatch):
    import backend.app.routers.positions as pos_router
    from backend.app.routers.positions import BulkPayload, PositionPayload, bulk_upsert

    monkeypatch.setattr(pos_router.portfolio, "upsert_position", lambda data: None)

    payload = BulkPayload(
        account="ALL",
        positions=[
            PositionPayload(account="ACC1", symbol="AAPL", qty=100, price=180),
            PositionPayload(account="ACC2", symbol="MSFT", qty=50, price=300),
        ],
    )
    out = bulk_upsert(payload)
    assert out["ok"] is True
    assert out["count"] == 2


def test_bulk_upsert_rejects_missing_row_account(monkeypatch):
    import backend.app.routers.positions as pos_router
    from backend.app.routers.positions import BulkPayload, PositionPayload, bulk_upsert
    from fastapi import HTTPException

    monkeypatch.setattr(pos_router.portfolio, "upsert_position", lambda data: None)

    payload = BulkPayload(
        account="ALL",
        positions=[PositionPayload(symbol="AAPL", qty=100, price=180)],
    )
    with pytest.raises(HTTPException) as exc:
        bulk_upsert(payload)
    assert exc.value.status_code == 400


def test_bulk_upsert_specific_account_override(monkeypatch):
    import backend.app.routers.positions as pos_router
    from backend.app.routers.positions import BulkPayload, PositionPayload, bulk_upsert

    captured = []
    monkeypatch.setattr(pos_router.portfolio, "upsert_position", lambda data: captured.append(data))

    payload = BulkPayload(
        account="ACC1",
        positions=[PositionPayload(symbol="AAPL", qty=100, price=180)],
    )
    out = bulk_upsert(payload)
    assert out["ok"] is True
    assert captured[0]["account"] == "ACC1"


def test_workers_start_nonblocking(monkeypatch):
    from backend.app import workers

    calls = []

    def fake_warm():
        time.sleep(0.05)
        calls.append("warm")

    def fake_bg():
        calls.append("bg")

    monkeypatch.setattr(workers.engine, "warm_position_history_cache", fake_warm)
    monkeypatch.setattr(workers.engine, "start_background_price_updates", fake_bg)

    t0 = time.monotonic()
    workers.start_workers()
    elapsed = time.monotonic() - t0
    assert elapsed < 0.5
    time.sleep(0.2)
    assert "warm" in calls


def test_action_close_detection_and_side_mapping():
    from backend.app.routers.admin import _action_is_close, _action_to_side

    assert _action_is_close("Sell to Close")
    assert _action_is_close("BUY TO CLOSE")
    assert _action_is_close("Expired")
    assert not _action_is_close("Sell Short")

    assert _action_to_side("expired option", 1) == "SELL"
    assert _action_to_side("expired option", -1) == "BUY"


def test_cap_close_qty_prevents_position_flip():
    from backend.app.routers.admin import _cap_close_qty

    # Can't close more than current long size with a SELL close.
    assert _cap_close_qty("SELL", 3.0, 10.0) == 3.0
    # Can't close more than current short size with a BUY close.
    assert _cap_close_qty("BUY", -2.0, 7.0) == 2.0
    # No open quantity to close.
    assert _cap_close_qty("SELL", 0.0, 1.0) == 0.0


def test_import_event_key_is_stable_and_sequence_sensitive():
    from backend.app.routers.admin import _build_import_event_key

    c1 = {}
    a1 = _build_import_event_key(c1, "ACC", "TRADE", "2026-03-01", "BUY", "AAPL", 10, 200.0)
    a2 = _build_import_event_key(c1, "ACC", "TRADE", "2026-03-01", "BUY", "AAPL", 10, 200.0)
    assert a1 != a2

    c2 = {}
    b1 = _build_import_event_key(c2, "ACC", "TRADE", "2026-03-01", "BUY", "AAPL", 10, 200.0)
    b2 = _build_import_event_key(c2, "ACC", "TRADE", "2026-03-01", "BUY", "AAPL", 10, 200.0)
    assert a1 == b1
    assert a2 == b2


def test_cash_flow_external_classification_rules():
    from backend.app.services.legacy_engine import _cash_flow_is_external

    assert _cash_flow_is_external("BALANCE_ADJ")
    assert not _cash_flow_is_external("BALANCE_ADJ_HISTORY")
    assert _cash_flow_is_external("BALANCE_ADJ_HISTORY_EXTERNAL")
    assert not _cash_flow_is_external("FEE_ADJ AAPL")
    assert not _cash_flow_is_external("CASH_FLOW|QUALIFIED_DIVIDEND|AAPL")
    assert _cash_flow_is_external("CASH_FLOW|TRANSFER|")
    assert not _cash_flow_is_external("CASH_FLOW AAPL")


def test_admin_reset_keeps_accounts_when_delete_flag_disabled(monkeypatch):
    from backend.app.routers import admin as admin_router

    executed_sql = []

    class _Cursor:
        def execute(self, sql, params=None):
            executed_sql.append(str(sql))

    class _Conn:
        def cursor(self):
            return _Cursor()

        def commit(self):
            return None

    monkeypatch.setattr(admin_router, "with_conn", lambda fn: fn(_Conn()))
    monkeypatch.setattr(admin_router.legacy_engine, "_clear_nav_cache", lambda: None)

    out = admin_router.reset_portfolio(admin_router.ResetPayload(start_cash=1000.0, delete_accounts=False))
    assert out["ok"] is True
    assert out["accounts_deleted"] is False
    assert any("DELETE FROM import_event_keys" in sql for sql in executed_sql)
    assert any("UPDATE accounts SET cash=0, asof=NULL, account_value=NULL" in sql for sql in executed_sql)
    assert not any("DELETE FROM accounts" in sql for sql in executed_sql)


def test_admin_reset_deletes_accounts_by_default(monkeypatch):
    from backend.app.routers import admin as admin_router

    executed_sql = []

    class _Cursor:
        def execute(self, sql, params=None):
            executed_sql.append(str(sql))

    class _Conn:
        def cursor(self):
            return _Cursor()

        def commit(self):
            return None

    monkeypatch.setattr(admin_router, "with_conn", lambda fn: fn(_Conn()))
    monkeypatch.setattr(admin_router.legacy_engine, "_clear_nav_cache", lambda: None)

    out = admin_router.reset_portfolio(admin_router.ResetPayload(start_cash=1000.0))
    assert out["ok"] is True
    assert out["accounts_deleted"] is True
    assert any("DELETE FROM import_event_keys" in sql for sql in executed_sql)
    assert any("DELETE FROM accounts" in sql for sql in executed_sql)


def test_import_balances_history_uses_full_non_future_series(monkeypatch):
    from backend.app.routers import admin as admin_router
    from starlette.datastructures import UploadFile
    monkeypatch.setattr(admin_router.settings, "static_mode", False)

    csv_text = textwrap.dedent(
        """\
        Date,Amount
        "5/14/2024","$100.00"
        "3/4/2026","$101.00"
        "3/5/2026","$102.00"
        """
    )

    executed_sql = []

    class _Cursor:
        def __init__(self):
            self.last_sql = ""

        def execute(self, sql, params=None):
            self.last_sql = str(sql)
            executed_sql.append(self.last_sql)

        def executemany(self, sql, seq):
            self.last_sql = str(sql)
            executed_sql.append(self.last_sql)

        def fetchall(self):
            if "SELECT account FROM accounts" in self.last_sql:
                return [{"account": "Limit_Liability_Company ...024"}]
            return []

        def fetchone(self):
            if "SELECT cash, asof, anchor_mode FROM accounts" in self.last_sql:
                return {"cash": 500.0, "asof": "2026-03-04", "anchor_mode": "EOD"}
            return None

    class _Conn:
        def cursor(self):
            return _Cursor()

        def commit(self):
            return None

    monkeypatch.setattr(admin_router, "with_conn", lambda fn: fn(_Conn()))
    monkeypatch.setattr(admin_router.legacy_engine, "_effective_nav_start", lambda account: "2026-01-01")
    monkeypatch.setattr(admin_router.legacy_engine, "today_str", lambda: "2026-03-04")
    monkeypatch.setattr(
        admin_router.legacy_engine,
        "get_bench_series",
        lambda start_date=None: pd.DataFrame([{"d": "2024-05-14", "close": 100.0}, {"d": "2026-03-04", "close": 101.0}]),
    )

    captured_start = {}

    def _fake_build_daily_nav_series(start_iso, bench_series, account=None):
        captured_start["value"] = start_iso
        return pd.DataFrame([{"d": "2024-05-14", "nav": 100.0}, {"d": "2026-03-04", "nav": 101.0}])

    monkeypatch.setattr(admin_router.legacy_engine, "build_daily_nav_series", _fake_build_daily_nav_series)
    monkeypatch.setattr(admin_router.legacy_engine, "_clear_nav_cache", lambda: None)
    monkeypatch.setattr(admin_router.portfolio_service, "rebuild_nav_history", lambda limit, account: {"ok": True})

    upload = UploadFile(
        filename="Limit Liability Company_XXXX024_Balances_20260304-203445.CSV",
        file=io.BytesIO(csv_text.encode("utf-8")),
    )
    out = asyncio.run(admin_router.import_balances(upload, account=None))

    assert out["ok"] is True
    assert out["account"] == "Limit_Liability_Company ...024"
    assert out["history_points"] == 3
    assert out["history_points_used_total"] == 3
    assert out["future_points_ignored"] == 0
    assert out["history_start"] == "2024-05-14"
    assert captured_start["value"] == "2024-05-14"
    assert any("BALANCE_ADJ_HISTORY" in sql or "account_value" in sql.lower() for sql in executed_sql)


def test_resolve_balance_history_account_from_filename_without_existing_accounts():
    from backend.app.routers.admin import _resolve_balance_history_account

    out = _resolve_balance_history_account(
        "Limit Liability Company_XXXX013_Balances_20260304-203432.CSV",
        account_param=None,
        existing_accounts=[],
    )
    assert out == "Limit_Liability_Company ...013"


def test_snapshot_all_series_forward_fills_sparse_account_dates(monkeypatch):
    from backend.app.services import legacy_engine as engine

    monkeypatch.setattr(
        engine,
        "get_bench_series",
        lambda symbol=None, start_date=None: pd.DataFrame(
            [
                {"d": "2026-01-01", "close": 5000.0},
                {"d": "2026-01-02", "close": 5100.0},
                {"d": "2026-01-03", "close": 5200.0},
            ]
        ),
    )

    class _Cursor:
        def __init__(self):
            self.sql = ""

        def execute(self, sql, params=None):
            self.sql = str(sql)

        def fetchall(self):
            if "FROM nav_snapshots" in self.sql and "account != 'ALL'" in self.sql:
                return [
                    {"account": "A", "date": "2026-01-01", "nav": 100.0, "bench": None},
                    {"account": "A", "date": "2026-01-02", "nav": 110.0, "bench": None},
                    {"account": "B", "date": "2026-01-02", "nav": 100.0, "bench": None},
                    {"account": "B", "date": "2026-01-03", "nav": 105.0, "bench": None},
                ]
            return []

    class _Conn:
        def cursor(self):
            return _Cursor()

    monkeypatch.setattr(engine, "with_conn", lambda fn: fn(_Conn()))

    out = engine._get_nav_series_from_snapshots(limit=10, account="ALL")
    assert [row["date"] for row in out] == ["2026-01-02", "2026-01-03"]
    assert [round(float(row["nav"]), 6) for row in out] == [210.0, 215.0]
    assert [round(float(row["twr"]), 6) for row in out] == [1.0, 1.02381]


def test_effective_nav_start_prefers_earliest_balance_history(monkeypatch):
    from backend.app.services import legacy_engine as engine

    monkeypatch.setattr(engine, "_get_bench_start", lambda: "2026-01-01")
    monkeypatch.setattr(engine, "_earliest_portfolio_date", lambda account: "2026-03-04")
    monkeypatch.setattr(engine, "_earliest_balance_history_date", lambda account: "2024-05-14")

    assert engine._effective_nav_start("Limit_Liability_Company ...024") == "2024-05-14"


def test_import_balances_history_adds_anchor_offset_when_residual_nonzero(monkeypatch):
    from backend.app.routers import admin as admin_router
    from starlette.datastructures import UploadFile
    monkeypatch.setattr(admin_router.settings, "static_mode", False)

    csv_text = textwrap.dedent(
        """\
        Date,Amount
        "5/14/2024","$100.00"
        "3/4/2026","$110.00"
        """
    )

    captured_cash_rows = []

    class _Cursor:
        def __init__(self):
            self.last_sql = ""

        def execute(self, sql, params=None):
            self.last_sql = str(sql)

        def executemany(self, sql, seq):
            self.last_sql = str(sql)
            if "INSERT INTO cash_flows" in self.last_sql:
                captured_cash_rows.extend(list(seq))

        def fetchall(self):
            if "SELECT account FROM accounts" in self.last_sql:
                return [{"account": "Limit_Liability_Company ...024"}]
            return []

        def fetchone(self):
            if "SELECT account, cash, asof, account_value FROM accounts" in self.last_sql:
                return {
                    "account": "Limit_Liability_Company ...024",
                    "cash": 500.0,
                    "asof": "2026-03-05",
                    "account_value": 999.0,
                }
            if "SELECT cash, asof, anchor_mode FROM accounts" in self.last_sql:
                return {"cash": 500.0, "asof": "2026-03-05", "anchor_mode": "EOD"}
            return None

    class _Conn:
        def cursor(self):
            return _Cursor()

        def commit(self):
            return None

    monkeypatch.setattr(admin_router, "with_conn", lambda fn: fn(_Conn()))
    monkeypatch.setattr(admin_router.legacy_engine, "_effective_nav_start", lambda account: "2024-05-14")
    monkeypatch.setattr(admin_router.legacy_engine, "today_str", lambda: "2026-03-05")
    monkeypatch.setattr(admin_router.legacy_engine, "_has_non_import_trades", lambda account: False)
    monkeypatch.setattr(
        admin_router.legacy_engine,
        "get_bench_series",
        lambda start_date=None: pd.DataFrame([{"d": "2024-05-14", "close": 100.0}, {"d": "2026-03-04", "close": 101.0}]),
    )
    monkeypatch.setattr(
        admin_router.legacy_engine,
        "build_daily_nav_series",
        lambda start_iso, bench_series, account=None: pd.DataFrame(
            [{"d": "2024-05-14", "nav": 95.0}, {"d": "2026-03-04", "nav": 104.0}]
        ),
    )
    monkeypatch.setattr(admin_router.legacy_engine, "_clear_nav_cache", lambda: None)
    monkeypatch.setattr(admin_router.portfolio_service, "rebuild_nav_history", lambda limit, account: {"ok": True})

    upload = UploadFile(
        filename="Limit Liability Company_XXXX024_Balances_20260304-203445.CSV",
        file=io.BytesIO(csv_text.encode("utf-8")),
    )
    out = asyncio.run(admin_router.import_balances(upload, account=None))

    assert out["ok"] is True
    # Residual path: +5 on first point, +1 on second point, then anchor -6 on account.asof.
    assert out["history_anchor_adjustment"] == -6.0
    assert ("Limit_Liability_Company ...024", "2026-03-05", -6.0, "BALANCE_ADJ_HISTORY_ANCHOR") in captured_cash_rows


def test_import_balances_history_marks_adjustments_external_when_real_trades_exist(monkeypatch):
    from backend.app.routers import admin as admin_router
    from starlette.datastructures import UploadFile
    monkeypatch.setattr(admin_router.settings, "static_mode", False)

    csv_text = textwrap.dedent(
        """\
        Date,Amount
        "5/14/2024","$100.00"
        "5/15/2024","$101.00"
        """
    )

    captured_cash_rows = []

    class _Cursor:
        def __init__(self):
            self.last_sql = ""

        def execute(self, sql, params=None):
            self.last_sql = str(sql)

        def executemany(self, sql, seq):
            self.last_sql = str(sql)
            if "INSERT INTO cash_flows" in self.last_sql:
                captured_cash_rows.extend(list(seq))

        def fetchall(self):
            if "SELECT account FROM accounts" in self.last_sql:
                return [{"account": "Limit_Liability_Company ...024"}]
            return []

        def fetchone(self):
            if "SELECT account, cash, asof, account_value FROM accounts" in self.last_sql:
                return {"account": "Limit_Liability_Company ...024", "cash": 0.0, "asof": "2026-03-04", "account_value": 100.0}
            if "SELECT cash, asof, anchor_mode FROM accounts" in self.last_sql:
                return {"cash": 0.0, "asof": "2026-03-04", "anchor_mode": "EOD"}
            return None

    class _Conn:
        def cursor(self):
            return _Cursor()

        def commit(self):
            return None

    monkeypatch.setattr(admin_router, "with_conn", lambda fn: fn(_Conn()))
    monkeypatch.setattr(admin_router.legacy_engine, "_effective_nav_start", lambda account: "2024-05-14")
    monkeypatch.setattr(admin_router.legacy_engine, "today_str", lambda: "2026-03-04")
    monkeypatch.setattr(admin_router.legacy_engine, "_has_non_import_trades", lambda account: True)
    monkeypatch.setattr(
        admin_router.legacy_engine,
        "get_bench_series",
        lambda start_date=None: pd.DataFrame([{"d": "2024-05-14", "close": 100.0}, {"d": "2024-05-15", "close": 101.0}]),
    )
    monkeypatch.setattr(
        admin_router.legacy_engine,
        "build_daily_nav_series",
        lambda start_iso, bench_series, account=None: pd.DataFrame([{"d": "2024-05-14", "nav": 95.0}, {"d": "2024-05-15", "nav": 95.0}]),
    )
    monkeypatch.setattr(admin_router.legacy_engine, "_clear_nav_cache", lambda: None)
    monkeypatch.setattr(admin_router.portfolio_service, "rebuild_nav_history", lambda limit, account: {"ok": True})

    upload = UploadFile(
        filename="Limit Liability Company_XXXX024_Balances_20260304-203445.CSV",
        file=io.BytesIO(csv_text.encode("utf-8")),
    )
    out = asyncio.run(admin_router.import_balances(upload, account=None))

    assert out["ok"] is True
    assert out["history_adjustment_mode"] == "external"
    assert any(row[3] == "BALANCE_ADJ_HISTORY_EXTERNAL" for row in captured_cash_rows)


def test_sector_series_trade_twr_neutralizes_contributions(monkeypatch):
    from backend.app.services import legacy_engine as engine

    monkeypatch.setattr(
        engine,
        "_load_positions_df",
        lambda account: pd.DataFrame(
            [
                {
                    "symbol": "AAPL",
                    "qty": 15.0,
                    "price": 10.0,
                    "multiplier": 1.0,
                    "sector": "Tech",
                    "entry_date": "2026-01-01",
                }
            ]
        ),
    )
    monkeypatch.setattr(
        engine,
        "get_bench_series",
        lambda start_date=None: pd.DataFrame(
            [
                {"d": "2026-01-01", "close": 100.0},
                {"d": "2026-01-02", "close": 101.0},
                {"d": "2026-01-03", "close": 102.0},
            ]
        ),
    )
    monkeypatch.setattr(engine, "_get_bench_start", lambda: "2026-01-01")
    monkeypatch.setattr(engine, "ensure_symbol_history", lambda symbol, start_iso, is_bench=False: True)
    monkeypatch.setattr(engine, "today_str", lambda: "2026-01-03")

    class _Cursor:
        def __init__(self):
            self.sql = ""

        def execute(self, sql, params=None):
            self.sql = str(sql)

        def fetchall(self):
            if "FROM trades" in self.sql:
                return [
                    {
                        "trade_date": "2026-01-01",
                        "symbol": "AAPL",
                        "qty": 10.0,
                        "side": "BUY",
                        "cash_flow": -100.0,
                        "multiplier": 1.0,
                        "trade_type": "LIMIT",
                        "source": "MANUAL",
                        "sector": "Tech",
                    },
                    {
                        "trade_date": "2026-01-02",
                        "symbol": "AAPL",
                        "qty": 5.0,
                        "side": "BUY",
                        "cash_flow": -50.0,
                        "multiplier": 1.0,
                        "trade_type": "LIMIT",
                        "source": "MANUAL",
                        "sector": "Tech",
                    },
                ]
            if "FROM price_cache" in self.sql:
                return [
                    {"symbol": "AAPL", "date": "2026-01-01", "close": 10.0},
                    {"symbol": "AAPL", "date": "2026-01-02", "close": 10.0},
                    {"symbol": "AAPL", "date": "2026-01-03", "close": 10.0},
                ]
            return []

    class _Conn:
        def cursor(self):
            return _Cursor()

    monkeypatch.setattr(engine, "with_conn", lambda fn: fn(_Conn()))

    series = engine.get_sector_series("Tech", limit=10, source="sleeve", account="ACC1")
    assert len(series) == 3
    assert all(abs(float(row["sector"])) < 1e-9 for row in series)


def test_risk_profile_includes_correlation_and_rolling(monkeypatch):
    from backend.app.services import risk as risk_service

    snapshot = {
        "nlv": 100000.0,
        "positions": [
            {"symbol": "AAPL", "sector": "Tech", "market_value": 60000.0, "qty": 100.0, "price": 600.0, "asset_class": "equity"},
            {"symbol": "MSFT", "sector": "Tech", "market_value": 40000.0, "qty": 50.0, "price": 800.0, "asset_class": "equity"},
        ],
    }

    nav = []
    nav_val = 100000.0
    bench_val = 5000.0
    twr = 1.0
    for i in range(1, 120):
        d = pd.Timestamp("2025-10-01") + pd.Timedelta(days=i)
        if d.weekday() >= 5:
            continue
        ret = 0.0008 + (i % 5) * 0.0001
        bret = 0.0005 + (i % 3) * 0.0001
        twr *= 1.0 + ret
        nav_val *= 1.0 + ret
        bench_val *= 1.0 + bret
        nav.append({"date": d.date().isoformat(), "nav": nav_val, "bench": bench_val, "twr": twr})

    tech_series = []
    tech = 0.0
    for row in nav:
        tech += 0.06
        tech_series.append({"date": row["date"], "sector": tech})

    monkeypatch.setattr(risk_service.engine, "get_snapshot", lambda account=None: snapshot)
    monkeypatch.setattr(risk_service.engine, "get_nav_series", lambda limit=900, account=None: nav)
    monkeypatch.setattr(risk_service.engine, "get_sector_series", lambda sector, limit=700, source="auto", account=None: tech_series)

    out = risk_service.get_risk_profile()
    assert "metrics" in out
    assert "correlation" in out
    assert "rolling" in out
    labels = out["correlation"]["labels"]
    assert "Portfolio" in labels
    assert "SPX" in labels
    assert out["correlation"]["observations"] > 20
    assert len(out["rolling"]["dates"]) > 0
