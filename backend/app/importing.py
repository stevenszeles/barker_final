from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

from fastapi import HTTPException, UploadFile

from .config import settings
from .db import with_conn


@dataclass
class ParsedFile:
    filename: str
    file_type: str
    account: str
    sha256: str
    byte_size: int
    rows: list[dict[str, Any]]
    metadata: dict[str, Any]


def _money(value: Any) -> float:
    text = str(value or "").strip().replace("$", "").replace(",", "").replace("%", "")
    if not text or text in {"--", "-", "N/A"}:
        return 0.0
    negative = text.startswith("(") and text.endswith(")")
    text = text.strip("()")
    try:
        number = float(text)
    except ValueError:
        return 0.0
    if not math.isfinite(number):
        return 0.0
    return -number if negative else number


def _required_money(value: Any, *, field: str, filename: str, row_number: int) -> float:
    text = str(value or "").strip().replace("$", "").replace(",", "").replace("%", "")
    negative = text.startswith("(") and text.endswith(")")
    text = text.strip("()")
    try:
        number = float(text)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field} in {filename} at CSV row {row_number}",
        ) from exc
    if not math.isfinite(number):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field} in {filename} at CSV row {row_number}",
        )
    return -number if negative else number


def _account_from_text(value: str) -> str | None:
    match = re.search(r"(?:X{3,4}|\.\.\.)\s*(\d{3,8})", value or "", re.IGNORECASE)
    if not match:
        return None
    return f"Limit_Liability_Company ...{match.group(1)}"


def _iso_date(value: str) -> str | None:
    raw = str(value or "").strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _instrument(symbol_raw: str, asset_type: str) -> dict[str, Any]:
    symbol = str(symbol_raw or "").strip().upper()
    option_match = re.match(
        r"^(?P<underlying>[A-Z0-9./_-]{1,12})\s+"
        r"(?P<expiry>\d{2}/\d{2}/\d{4})\s+"
        r"(?P<strike>\d+(?:\.\d+)?)\s+(?P<right>[CP])$",
        symbol,
    )
    asset_class = "option" if option_match or "option" in str(asset_type or "").lower() else "equity"
    if option_match:
        underlying = option_match.group("underlying")
        expiry = _iso_date(option_match.group("expiry"))
        strike = float(option_match.group("strike"))
        option_type = "CALL" if option_match.group("right") == "C" else "PUT"
        instrument_id = f"{underlying}:{expiry}:{option_type}:{strike:.4f}"
        return {
            "id": instrument_id,
            "symbol": symbol,
            "asset_class": "option",
            "underlying": underlying,
            "expiry": expiry,
            "strike": strike,
            "option_type": option_type,
            "multiplier": 100.0,
        }
    clean_symbol = symbol.split()[0]
    return {
        "id": f"{clean_symbol}:EQ",
        "symbol": clean_symbol,
        "asset_class": asset_class,
        "underlying": clean_symbol,
        "expiry": None,
        "strike": None,
        "option_type": None,
        "multiplier": 1.0,
    }


def _parse_positions(text: str, filename: str) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    account = _account_from_text(f"{filename}\n{text[:1000]}")
    if not account:
        raise HTTPException(status_code=400, detail=f"Could not identify account in positions file {filename}")
    lines = list(csv.reader(io.StringIO(text)))
    header_index = next(
        (index for index, row in enumerate(lines) if row and str(row[0]).strip() == "Symbol"),
        None,
    )
    if header_index is None:
        raise HTTPException(status_code=400, detail=f"Positions header not found in {filename}")
    headers = [str(value).strip() for value in lines[header_index]]
    rows: list[dict[str, Any]] = []
    cash = 0.0
    account_value = 0.0
    for row_number, values in enumerate(lines[header_index + 1 :], start=header_index + 2):
        if not values:
            continue
        row = dict(zip(headers, values))
        symbol = str(row.get("Symbol") or "").strip()
        if symbol == "Cash & Cash Investments":
            cash = _required_money(
                row.get("Mkt Val (Market Value)"),
                field="cash market value",
                filename=filename,
                row_number=row_number,
            )
            continue
        if symbol == "Positions Total":
            account_value = _required_money(
                row.get("Mkt Val (Market Value)"),
                field="account value",
                filename=filename,
                row_number=row_number,
            )
            continue
        if not symbol:
            continue
        qty = _required_money(
            row.get("Qty (Quantity)"),
            field="quantity",
            filename=filename,
            row_number=row_number,
        )
        if abs(qty) < 1e-12:
            continue
        instrument = _instrument(symbol, row.get("Asset Type") or "")
        multiplier = float(instrument["multiplier"])
        cost_basis = _money(row.get("Cost Basis"))
        avg_cost = abs(cost_basis) / (abs(qty) * multiplier) if qty and multiplier else 0.0
        rows.append(
            {
                "instrument": instrument,
                "qty": qty,
                "price": _required_money(
                    row.get("Price"),
                    field="price",
                    filename=filename,
                    row_number=row_number,
                ),
                "market_value": _required_money(
                    row.get("Mkt Val (Market Value)"),
                    field="market value",
                    filename=filename,
                    row_number=row_number,
                ),
                "avg_cost": avg_cost,
                "day_pnl": _money(row.get("Day Chng $ (Day Change $)")),
                "total_pnl": _money(row.get("Gain $ (Gain/Loss $)")),
                "day_pnl_pct": _money(row.get("Day Chng % (Day Change %)")),
                "total_pnl_pct": _money(row.get("Gain % (Gain/Loss %)")),
                "sector": "Unassigned",
                "description": str(row.get("Description") or "").strip(),
            }
        )
    if not rows:
        raise HTTPException(status_code=400, detail=f"No valid position rows found in {filename}")
    if account_value <= 0:
        raise HTTPException(status_code=400, detail=f"Positions total is missing or invalid in {filename}")
    reconciled_value = cash + sum(float(row["market_value"]) for row in rows)
    tolerance = max(5.0, abs(account_value) * 0.005)
    if abs(reconciled_value - account_value) > tolerance:
        raise HTTPException(
            status_code=400,
            detail=f"Positions in {filename} do not reconcile to the reported account value",
        )
    asof_match = re.search(r"as of .*?,\s*(\d{4}/\d{2}/\d{2})", text[:500], re.IGNORECASE)
    asof = _iso_date(asof_match.group(1).replace("/", "-")) if asof_match else None
    if asof_match:
        try:
            asof = datetime.strptime(asof_match.group(1), "%Y/%m/%d").date().isoformat()
        except ValueError:
            asof = None
    return account, rows, {"cash": cash, "account_value": account_value, "asof": asof}


def _parse_balances(text: str, filename: str) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    account = _account_from_text(filename)
    if not account:
        raise HTTPException(status_code=400, detail=f"Could not identify account in balance file {filename}")
    reader = csv.DictReader(io.StringIO(text))
    by_date: dict[str, float] = {}
    for row_number, row in enumerate(reader, start=2):
        point_date = _iso_date(row.get("Date") or "")
        if not point_date or point_date > date.today().isoformat():
            continue
        by_date[point_date] = _required_money(
            row.get("Amount"),
            field="balance amount",
            filename=filename,
            row_number=row_number,
        )
    rows = [{"date": key, "nav": by_date[key]} for key in sorted(by_date)]
    if not rows:
        raise HTTPException(status_code=400, detail=f"No valid balance rows found in {filename}")
    return account, rows, {"asof": rows[-1]["date"], "account_value": rows[-1]["nav"]}


def _parse_realized(
    text: str,
    filename: str,
    account_hint: str | None,
) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    account = _account_from_text(f"{filename}\n{text[:1000]}") or account_hint
    if not account:
        raise HTTPException(status_code=400, detail=f"Could not identify account for realized file {filename}")
    lines = list(csv.reader(io.StringIO(text)))
    header_index = next(
        (index for index, row in enumerate(lines) if row and str(row[0]).strip() == "Symbol" and "Closed Date" in row),
        None,
    )
    if header_index is None:
        raise HTTPException(status_code=400, detail=f"Realized lot header not found in {filename}")
    headers = [str(value).strip() for value in lines[header_index]]
    rows: list[dict[str, Any]] = []
    for index, values in enumerate(lines[header_index + 1 :], start=1):
        row = dict(zip(headers, values))
        symbol = str(row.get("Symbol") or "").strip()
        closed_date = _iso_date(row.get("Closed Date") or "")
        if not symbol or not closed_date:
            continue
        instrument = _instrument(symbol, row.get("Name") or "")
        csv_row_number = header_index + 1 + index
        quantity = abs(
            _required_money(
                row.get("Quantity"),
                field="realized quantity",
                filename=filename,
                row_number=csv_row_number,
            )
        )
        realized_pl = _required_money(
            row.get("Gain/Loss ($)"),
            field="realized gain/loss",
            filename=filename,
            row_number=csv_row_number,
        )
        rows.append(
            {
                "trade_id": f"REALIZED_{hashlib.sha256(f'{account}|{filename}|{index}|{symbol}|{closed_date}'.encode()).hexdigest()[:24]}",
                "instrument": instrument,
                "symbol": symbol,
                "trade_date": closed_date,
                "opened_date": _iso_date(row.get("Opened Date") or ""),
                "qty": quantity,
                "price": _money(row.get("Proceeds Per Share")),
                "proceeds": _money(row.get("Proceeds")),
                "cost_basis": _money(row.get("Cost Basis (CB)")),
                "realized_pl": realized_pl,
                "term": str(row.get("Term") or "").strip(),
                "sector": "Unassigned",
            }
        )
    if not rows:
        raise HTTPException(status_code=400, detail=f"No realized lot rows found in {filename}")
    return account, rows, {}


def _classify(filename: str, text: str) -> str:
    sample = text[:5000]
    lowered = filename.lower()
    if "realized gain/loss - lot details" in sample.lower() or "gainloss_realized" in lowered:
        return "realized"
    if "date,amount" in sample.lower() and "balance" in lowered:
        return "balances"
    if "positions for account" in sample.lower() or "positions" in lowered:
        return "positions"
    raise HTTPException(status_code=400, detail=f"Unsupported brokerage export: {filename}")


async def parse_uploads(files: list[UploadFile]) -> list[ParsedFile]:
    raw_files: list[tuple[str, str, bytes, str]] = []
    detected_accounts: set[str] = set()
    for upload in files:
        content = await upload.read()
        if len(content) > settings.max_upload_bytes:
            raise HTTPException(status_code=413, detail=f"{upload.filename} exceeds the upload limit")
        filename = upload.filename or "upload.csv"
        text = content.decode("utf-8-sig", errors="replace")
        file_type = _classify(filename, text)
        raw_files.append((filename, text, content, file_type))
        detected = _account_from_text(f"{filename}\n{text[:1000]}")
        if detected:
            detected_accounts.add(detected)
    account_hint = next(iter(detected_accounts)) if len(detected_accounts) == 1 else None
    parsed: list[ParsedFile] = []
    for filename, text, content, file_type in raw_files:
        if file_type == "positions":
            account, rows, metadata = _parse_positions(text, filename)
        elif file_type == "balances":
            account, rows, metadata = _parse_balances(text, filename)
        else:
            account, rows, metadata = _parse_realized(text, filename, account_hint)
        parsed.append(
            ParsedFile(
                filename=filename,
                file_type=file_type,
                account=account,
                sha256=hashlib.sha256(content).hexdigest(),
                byte_size=len(content),
                rows=rows,
                metadata=metadata,
            )
        )
    return parsed


def _upsert_instrument(cur, instrument: dict[str, Any]) -> None:
    cur.execute(
        """
        INSERT OR REPLACE INTO instruments(
            id, symbol, asset_class, underlying, expiry, strike, option_type, multiplier, exchange, currency
        ) VALUES(?,?,?,?,?,?,?,?,?,?)
        """,
        (
            instrument["id"],
            instrument["symbol"],
            instrument["asset_class"],
            instrument.get("underlying"),
            instrument.get("expiry"),
            instrument.get("strike"),
            instrument.get("option_type"),
            instrument.get("multiplier") or 1.0,
            None,
            "USD",
        ),
    )


def _persist_file(cur, parsed: ParsedFile) -> dict[str, Any]:
    account = parsed.account
    if parsed.file_type == "positions":
        cur.execute("SELECT instrument_id, sector FROM positions WHERE account=?", (account,))
        existing_sectors = {
            str(existing[0]): str(existing[1])
            for existing in (cur.fetchall() or [])
            if existing[0] and str(existing[1] or "").strip()
        }
        cur.execute("DELETE FROM positions WHERE account=?", (account,))
        for row in parsed.rows:
            instrument = row["instrument"]
            _upsert_instrument(cur, instrument)
            cur.execute(
                """
                INSERT OR REPLACE INTO positions(
                    account, instrument_id, qty, price, market_value, avg_cost,
                    day_pnl, total_pnl, day_pnl_pct, total_pnl_pct, sector
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    account,
                    instrument["id"],
                    row["qty"],
                    row["price"],
                    row["market_value"],
                    row["avg_cost"],
                    row["day_pnl"],
                    row["total_pnl"],
                    row["day_pnl_pct"],
                    row["total_pnl_pct"],
                    existing_sectors.get(instrument["id"], row["sector"]),
                ),
            )
        meta = parsed.metadata
        cur.execute(
            """
            INSERT OR REPLACE INTO accounts(account, cash, asof, account_value, anchor_mode)
            VALUES(?,?,?,?,?)
            """,
            (account, meta.get("cash") or 0.0, meta.get("asof"), meta.get("account_value") or 0.0, "EOD"),
        )
        if meta.get("asof") and float(meta.get("account_value") or 0.0) > 0:
            cur.execute(
                "INSERT OR REPLACE INTO nav_snapshots(account, date, nav, bench) VALUES(?,?,?,?)",
                (account, meta["asof"], meta["account_value"], None),
            )
        return {"positions": len(parsed.rows), "cash": meta.get("cash"), "account_value": meta.get("account_value")}

    if parsed.file_type == "balances":
        cur.execute("DELETE FROM nav_snapshots WHERE account=?", (account,))
        cur.executemany(
            "INSERT OR REPLACE INTO nav_snapshots(account, date, nav, bench) VALUES(?,?,?,?)",
            [(account, row["date"], row["nav"], None) for row in parsed.rows],
        )
        meta = parsed.metadata
        cur.execute("SELECT cash FROM accounts WHERE account=?", (account,))
        existing = cur.fetchone()
        cash = float(existing[0] or 0.0) if existing else 0.0
        cur.execute(
            """
            INSERT OR REPLACE INTO accounts(account, cash, asof, account_value, anchor_mode)
            VALUES(?,?,?,?,?)
            """,
            (account, cash, meta["asof"], meta["account_value"], "EOD"),
        )
        return {"balance_points": len(parsed.rows), "asof": meta["asof"], "account_value": meta["account_value"]}

    cur.execute(
        "SELECT symbol, sector FROM trades WHERE account=? AND source='CSV_REALIZED'",
        (account,),
    )
    realized_sectors = {
        str(existing[0]): str(existing[1])
        for existing in (cur.fetchall() or [])
        if existing[0] and str(existing[1] or "").strip()
    }
    cur.execute("SELECT instrument_id, sector FROM positions WHERE account=?", (account,))
    position_sectors = {
        str(existing[0]): str(existing[1])
        for existing in (cur.fetchall() or [])
        if existing[0] and str(existing[1] or "").strip()
    }
    cur.execute("DELETE FROM trades WHERE account=? AND source='CSV_REALIZED'", (account,))
    for row in parsed.rows:
        instrument = row["instrument"]
        _upsert_instrument(cur, instrument)
        realized_sector = realized_sectors.get(row["symbol"])
        position_sector = position_sectors.get(instrument["id"])
        sector = (
            position_sector
            if position_sector and position_sector != "Unassigned"
            else realized_sector or position_sector or row["sector"]
        )
        cur.execute(
            """
            INSERT INTO trades(
                trade_id, ts, trade_date, account, instrument_id, symbol, side, qty, price,
                trade_type, status, source, asset_class, underlying, expiry, strike,
                option_type, multiplier, sector, realized_pl, cost_basis, cash_flow
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                row["trade_id"],
                f"{row['trade_date']} 16:00:00",
                row["trade_date"],
                account,
                instrument["id"],
                row["symbol"],
                "CLOSE",
                row["qty"],
                row["price"],
                instrument["asset_class"].upper(),
                "FILLED",
                "CSV_REALIZED",
                instrument["asset_class"],
                instrument.get("underlying"),
                instrument.get("expiry"),
                instrument.get("strike"),
                instrument.get("option_type"),
                instrument.get("multiplier"),
                sector,
                row["realized_pl"],
                row["cost_basis"],
                0.0,
            ),
        )
    return {"realized_lots": len(parsed.rows)}


def import_batch(parsed_files: list[ParsedFile], actor: str) -> dict[str, Any]:
    batch_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc).isoformat()

    def _create_batch(conn):
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO import_batches(id, status, actor, source, started_at, file_count)
            VALUES(?,?,?,?,?,?)
            """,
            (batch_id, "PROCESSING", actor, "SCHWAB_CSV", started_at, len(parsed_files)),
        )
        conn.commit()

    with_conn(_create_batch)
    summary: dict[str, Any] = {"accounts": {}, "files": [], "duplicates": 0}

    try:
        def _commit(conn):
            cur = conn.cursor()
            for parsed in sorted(parsed_files, key=lambda item: {"positions": 0, "balances": 1, "realized": 2}[item.file_type]):
                cur.execute(
                    "SELECT id FROM import_files WHERE sha256=? AND file_type=? AND account=? LIMIT 1",
                    (parsed.sha256, parsed.file_type, parsed.account),
                )
                if cur.fetchone():
                    summary["duplicates"] += 1
                    summary["files"].append(
                        {"filename": parsed.filename, "file_type": parsed.file_type, "account": parsed.account, "status": "DUPLICATE"}
                    )
                    continue
                result = _persist_file(cur, parsed)
                file_id = str(uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO import_files(
                        id, batch_id, filename, file_type, account, sha256, byte_size, row_count, result_json
                    ) VALUES(?,?,?,?,?,?,?,?,?)
                    """,
                    (
                        file_id,
                        batch_id,
                        parsed.filename,
                        parsed.file_type,
                        parsed.account,
                        parsed.sha256,
                        parsed.byte_size,
                        len(parsed.rows),
                        json.dumps(result, separators=(",", ":"), sort_keys=True),
                    ),
                )
                summary["accounts"].setdefault(parsed.account, {}).update(result)
                summary["files"].append(
                    {
                        "filename": parsed.filename,
                        "file_type": parsed.file_type,
                        "account": parsed.account,
                        "status": "IMPORTED",
                        **result,
                    }
                )
            completed_at = datetime.now(timezone.utc).isoformat()
            cur.execute(
                """
                UPDATE import_batches
                SET status='COMPLETED', completed_at=?, summary_json=?
                WHERE id=?
                """,
                (completed_at, json.dumps(summary, separators=(",", ":"), sort_keys=True), batch_id),
            )
            conn.commit()

        with_conn(_commit)
    except Exception as exc:
        def _mark_failed(conn):
            cur = conn.cursor()
            cur.execute(
                "UPDATE import_batches SET status='FAILED', completed_at=?, error=? WHERE id=?",
                (datetime.now(timezone.utc).isoformat(), str(exc)[:2000], batch_id),
            )
            conn.commit()

        with_conn(_mark_failed)
        raise

    return {"ok": True, "batch_id": batch_id, **summary}


def import_history(limit: int = 25) -> list[dict[str, Any]]:
    def _run(conn):
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, status, actor, source, started_at, completed_at, file_count, summary_json, error
            FROM import_batches
            ORDER BY started_at DESC
            LIMIT ?
            """,
            (max(1, min(int(limit), 100)),),
        )
        out = []
        for row in cur.fetchall() or []:
            record = dict(row)
            raw_summary = record.pop("summary_json", None)
            try:
                record["summary"] = json.loads(raw_summary) if raw_summary else None
            except json.JSONDecodeError:
                record["summary"] = None
            out.append(record)
        return out

    return with_conn(_run)
