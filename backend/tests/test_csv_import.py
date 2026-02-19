"""
Targeted regression tests for CSV import routing and ALL-account behavior.
"""
from __future__ import annotations

import re
import textwrap
import time

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


def test_parse_custaccs_extracts_cash():
    from backend.app.routers.admin import _parse_custaccs_positions

    result = _parse_custaccs_positions(SCHWAB_POSITIONS_CONTENT)
    assert "cash" in result
    symbols = {row["symbol"] for row in result["positions"]}
    assert not any("cash" in sym.lower() for sym in symbols)


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
