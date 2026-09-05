import asyncio
import io

import pytest
from fastapi import UploadFile

from backend.app.config import settings
from backend.app.db import ensure_schema, with_conn
from backend.app.importing import ParsedFile, import_batch, parse_uploads
from backend.app.migrations import apply_migrations


@pytest.fixture
def isolated_database(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_url", "")
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "portfolio.db"))
    ensure_schema()
    apply_migrations()
    return settings.db_path


def _upload(filename: str, text: str) -> UploadFile:
    return UploadFile(filename=filename, file=io.BytesIO(text.encode("utf-8")))


def _position_file() -> UploadFile:
    return _upload(
        "Limit Liability Company-Positions-2026-07-23.csv",
        "\n".join(
            [
                '"Positions for account Limit Liability Company ...562 as of Thursday, 2026/07/23"',
                "Symbol,Description,Qty (Quantity),Price,Mkt Val (Market Value),Cost Basis,"
                "Day Chng $ (Day Change $),Gain $ (Gain/Loss $),Day Chng % (Day Change %),"
                "Gain % (Gain/Loss %),Asset Type",
                "AAPL,Apple Inc,10,$200.00,\"$2,000.00\",\"$1,500.00\",$25.00,$500.00,1.25%,33.33%,Equity",
                'Cash & Cash Investments,Cash,1,$1.00,"$1,000.00",,,,,,Cash',
                'Positions Total,,,,"$3,000.00",,,,,,',
            ]
        ),
    )


def _balance_file() -> UploadFile:
    return _upload(
        "Limit Liability Company_XXXX562_Balances_20260723.CSV",
        'Date,Amount\n07/22/2026,"$2,900.00"\n07/23/2026,"$3,000.00"\n',
    )


def _realized_file() -> UploadFile:
    return _upload(
        "Limit_Liability_Company_GainLoss_Realized_Details_20260723.csv",
        "\n".join(
            [
                "Realized Gain/Loss - Lot Details",
                "Symbol,Name,Quantity,Opened Date,Closed Date,Proceeds Per Share,Proceeds,"
                "Cost Basis (CB),Gain/Loss ($),Term",
                'MSFT,Microsoft Corp,2,01/02/2026,02/03/2026,$425.00,$850.00,$700.00,$150.00,Short',
            ]
        ),
    )


def test_three_file_import_is_atomic_and_idempotent(isolated_database):
    parsed = asyncio.run(parse_uploads([_position_file(), _balance_file(), _realized_file()]))

    assert [(item.file_type, len(item.rows)) for item in parsed] == [
        ("positions", 1),
        ("balances", 2),
        ("realized", 1),
    ]

    first = import_batch(parsed, actor="test-admin")
    second = import_batch(parsed, actor="test-admin")

    assert first["duplicates"] == 0
    assert second["duplicates"] == 3
    assert {item["status"] for item in second["files"]} == {"DUPLICATE"}

    def _counts(conn):
        cur = conn.cursor()
        result = {}
        for table in ("accounts", "positions", "nav_snapshots", "trades", "import_files"):
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            result[table] = cur.fetchone()[0]
        return result

    assert with_conn(_counts) == {
        "accounts": 1,
        "positions": 1,
        "nav_snapshots": 2,
        "trades": 1,
        "import_files": 3,
    }


def test_failed_batch_rolls_back_all_portfolio_mutations(isolated_database):
    parsed = asyncio.run(parse_uploads([_position_file()]))
    parsed.append(
        ParsedFile(
            filename="broken-realized.csv",
            file_type="realized",
            account=parsed[0].account,
            sha256="broken",
            byte_size=1,
            rows=[{}],
            metadata={},
        )
    )

    with pytest.raises(KeyError):
        import_batch(parsed, actor="test-admin")

    def _state(conn):
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM positions")
        positions = cur.fetchone()[0]
        cur.execute("SELECT status FROM import_batches")
        status = cur.fetchone()[0]
        return positions, status

    assert with_conn(_state) == (0, "FAILED")


def test_invalid_balance_amount_is_rejected_before_database_write(isolated_database):
    malformed = _upload(
        "Limit Liability Company_XXXX562_Balances_20260723.CSV",
        'Date,Amount\n07/23/2026,"not-a-number"\n',
    )

    with pytest.raises(Exception, match="Invalid balance amount"):
        asyncio.run(parse_uploads([malformed]))

    def _count(conn):
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM import_batches")
        return cur.fetchone()[0]

    assert with_conn(_count) == 0


def test_new_export_preserves_maintained_sector(isolated_database):
    original = asyncio.run(parse_uploads([_position_file()]))[0]
    import_batch([original], actor="test-admin")

    def _classify(conn):
        cur = conn.cursor()
        cur.execute(
            "UPDATE positions SET sector='Technology' WHERE account=? AND instrument_id='AAPL:EQ'",
            (original.account,),
        )
        conn.commit()

    with_conn(_classify)
    replacement = ParsedFile(
        filename="newer-positions.csv",
        file_type="positions",
        account=original.account,
        sha256="new-export-hash",
        byte_size=original.byte_size,
        rows=original.rows,
        metadata=original.metadata,
    )
    replacement.rows[0]["price"] = 201.0
    import_batch([replacement], actor="test-admin")

    def _sector(conn):
        cur = conn.cursor()
        cur.execute("SELECT sector, price FROM positions WHERE instrument_id='AAPL:EQ'")
        return tuple(cur.fetchone())

    assert with_conn(_sector) == ("Technology", 201.0)


def test_static_snapshot_uses_position_pnl_and_import_asof(isolated_database, monkeypatch):
    from backend.app.services import legacy_engine

    monkeypatch.setattr(settings, "static_mode", True)
    parsed = asyncio.run(parse_uploads([_position_file(), _balance_file()]))
    import_batch(parsed, actor="test-admin")
    legacy_engine._clear_nav_cache()

    snapshot = legacy_engine.get_snapshot(account=parsed[0].account)
    assert snapshot["stamp"]["asof"] == "2026-07-23"
    assert snapshot["stamp"]["source"] == "imported"
    assert snapshot["day_pnl"] == pytest.approx(25.0)
    assert snapshot["total_pnl"] == pytest.approx(500.0)
    assert snapshot["net_exposure"] == pytest.approx(1.0)
