#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import io
import json
import os
import re
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from starlette.datastructures import UploadFile


def _configure_env(db_path: Path) -> None:
    os.environ["WS_DB_PATH"] = str(db_path)
    os.environ.setdefault("WS_STATIC_MODE", "0")


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _bootstrap_imports(db_path: Path):
    _configure_env(db_path)
    repo = _repo_root()
    if str(repo) not in sys.path:
        sys.path.insert(0, str(repo))
    from backend.app.db import ensure_schema, with_conn  # type: ignore
    from backend.app.routers import admin  # type: ignore
    from backend.app.services import legacy_engine, portfolio as portfolio_service  # type: ignore

    return ensure_schema, with_conn, admin, legacy_engine, portfolio_service


def _upload(path: Path) -> UploadFile:
    return UploadFile(filename=path.name, file=io.BytesIO(path.read_bytes()))


def _account_from_transactions_filename(path: Path) -> Optional[str]:
    name = path.name.upper()
    m = re.search(r"XXX(\d{3,6})", name)
    if not m:
        return None
    suffix = m.group(1)
    if "INDIVIDUAL" in name:
        return f"Individual ...{suffix}"
    if "LIMIT_LIABILITY_COMPANY" in name:
        return f"Limit_Liability_Company ...{suffix}"
    return None


@dataclass
class AuditCaseResult:
    name: str
    status: str
    details: Dict[str, Any]


class Auditor:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        (
            self.ensure_schema,
            self.with_conn,
            self.admin,
            self.legacy_engine,
            self.portfolio_service,
        ) = _bootstrap_imports(db_path)

    def reset_db(self) -> None:
        if self.db_path.exists():
            self.db_path.unlink()
        self.ensure_schema()

    async def import_tx(self, csv_path: Path, account: str, replace: bool) -> Dict[str, Any]:
        return await self.admin.import_transactions(file=_upload(csv_path), account=account, replace=replace)

    def latest_nav(self, account: str) -> Optional[float]:
        points = self.legacy_engine.get_nav_series(limit=1, account=account)
        if not points:
            return None
        try:
            return float(points[-1].get("nav"))
        except Exception:
            return None

    def first_nav(self, account: str) -> Optional[float]:
        points = self.legacy_engine.get_nav_series(limit=5000, account=account)
        if not points:
            return None
        try:
            return float(points[0].get("nav"))
        except Exception:
            return None

    def nav_return_pct(self, account: str) -> Optional[float]:
        first = self.first_nav(account)
        last = self.latest_nav(account)
        if first is None or last is None or abs(first) < 1e-12:
            return None
        return (last / first - 1.0) * 100.0

    def counts_for_account(self, account: str) -> Dict[str, int]:
        def _run(conn):
            cur = conn.cursor()
            out = {}
            for table in ("trades", "cash_flows", "positions", "nav_snapshots"):
                cur.execute(f"SELECT COUNT(*) FROM {table} WHERE account=?", (account,))
                row = cur.fetchone()
                out[table] = int((row.get(0) if isinstance(row, dict) else row[0]) or 0)
            return out

        return self.with_conn(_run)

    def set_account_anchor(self, account: str, cash: float, asof: Optional[str]) -> None:
        def _run(conn):
            cur = conn.cursor()
            cur.execute(
                "INSERT OR REPLACE INTO accounts(account, cash, asof, account_value) VALUES(?,?,?,NULL)",
                (account, float(cash), asof),
            )
            conn.commit()

        self.with_conn(_run)

    def insert_cash_flow(self, account: str, date_iso: str, amount: float, note: str = "TEST") -> None:
        def _run(conn):
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO cash_flows(account, date, amount, note) VALUES(?,?,?,?)",
                (account, date_iso, float(amount), note),
            )
            conn.commit()

        self.with_conn(_run)

    def clear_account_value(self, account: str) -> None:
        def _run(conn):
            cur = conn.cursor()
            cur.execute("UPDATE accounts SET account_value=NULL WHERE account=?", (account,))
            conn.commit()

        self.with_conn(_run)

    async def case_idempotent_replace(self, tx_path: Path, account: str) -> AuditCaseResult:
        self.reset_db()
        first = await self.import_tx(tx_path, account, replace=True)
        nav1 = self.latest_nav(account)
        counts1 = self.counts_for_account(account)
        second = await self.import_tx(tx_path, account, replace=True)
        nav2 = self.latest_nav(account)
        counts2 = self.counts_for_account(account)
        nav_delta = None if nav1 is None or nav2 is None else float(nav2 - nav1)
        ok = (
            abs(nav_delta or 0.0) < 0.01
            and counts1.get("trades") == counts2.get("trades")
            and counts1.get("cash_flows") == counts2.get("cash_flows")
        )
        return AuditCaseResult(
            name="idempotent_replace_true",
            status="pass" if ok else "fail",
            details={
                "account": account,
                "first_import": first,
                "second_import": second,
                "first_counts": counts1,
                "second_counts": counts2,
                "first_latest_nav": nav1,
                "second_latest_nav": nav2,
                "latest_nav_delta": nav_delta,
            },
        )

    async def case_duplicate_append(self, tx_path: Path, account: str) -> AuditCaseResult:
        self.reset_db()
        once = await self.import_tx(tx_path, account, replace=True)
        nav_once = self.latest_nav(account)
        counts_once = self.counts_for_account(account)
        twice = await self.import_tx(tx_path, account, replace=False)
        nav_twice = self.latest_nav(account)
        counts_twice = self.counts_for_account(account)
        delta = None if nav_once is None or nav_twice is None else float(nav_twice - nav_once)
        hazard = abs(delta or 0.0) >= 1.0
        return AuditCaseResult(
            name="duplicate_append_hazard",
            status="fail" if hazard else "pass",
            details={
                "account": account,
                "import_once": once,
                "import_twice_append": twice,
                "counts_once": counts_once,
                "counts_twice": counts_twice,
                "latest_nav_once": nav_once,
                "latest_nav_twice_append": nav_twice,
                "latest_nav_delta": delta,
                "explanation": "Re-uploading same file with replace=false duplicates trades/cash flows.",
            },
        )

    async def case_realized_on_top_of_full_ledger(
        self, tx_path: Path, realized_path: Path, account: str
    ) -> AuditCaseResult:
        self.reset_db()
        _ = await self.import_tx(tx_path, account, replace=True)
        nav_before = self.latest_nav(account)
        before_counts = self.counts_for_account(account)
        try:
            realized = await self.import_tx(realized_path, account, replace=False)
        except Exception as exc:
            detail = str(exc)
            if "no transactions found in csv" in detail.lower():
                return AuditCaseResult(
                    name="realized_plus_full_ledger_overlap",
                    status="skip",
                    details={
                        "account": account,
                        "exception": detail,
                        "explanation": "No realized lot rows for this account in the provided realized file.",
                    },
                )
            blocked = "overlaps existing transaction history" in detail.lower()
            return AuditCaseResult(
                name="realized_plus_full_ledger_overlap",
                status="pass" if blocked else "fail",
                details={
                    "account": account,
                    "blocked_by_guardrail": blocked,
                    "exception": detail,
                    "counts_before": before_counts,
                    "latest_nav_before": nav_before,
                    "explanation": "Realized-on-full-ledger import should be blocked unless explicitly forced.",
                },
            )
        nav_after = self.latest_nav(account)
        after_counts = self.counts_for_account(account)
        delta = None if nav_before is None or nav_after is None else float(nav_after - nav_before)
        hazard = abs(delta or 0.0) >= 1.0
        return AuditCaseResult(
            name="realized_plus_full_ledger_overlap",
            status="fail" if hazard else "pass",
            details={
                "account": account,
                "realized_import_result": realized,
                "counts_before": before_counts,
                "counts_after": after_counts,
                "latest_nav_before": nav_before,
                "latest_nav_after": nav_after,
                "latest_nav_delta": delta,
                "explanation": "Importing realized lots after full transactions can double-count closes.",
            },
        )

    async def case_asof_boundary_exclusion(self) -> AuditCaseResult:
        self.reset_db()
        account = "TEST_ASOF_BOUNDARY"
        self.set_account_anchor(account, cash=1000.0, asof="2026-01-01")
        self.insert_cash_flow(account, "2026-01-01", 200.0, "SAME_DAY_EXTERNAL")
        ok, msg, _ = self.legacy_engine.apply_trade(
            {
                "account": account,
                "symbol": "SPY",
                "qty": 1,
                "price": 300,
                "side": "SELL",
                "trade_date": "2026-01-01",
                "skip_cash_check": True,
            }
        )
        bal = self.legacy_engine.compute_cash_balance_total(account)
        expected_if_inclusive = 1500.0
        gap = float(expected_if_inclusive - bal)
        hazard = abs(gap) >= 1.0
        return AuditCaseResult(
            name="anchor_asof_same_day_exclusion",
            status="fail" if hazard else "pass",
            details={
                "trade_ok": ok,
                "trade_message": msg,
                "cash_balance_total": bal,
                "expected_if_same_day_included": expected_if_inclusive,
                "difference": gap,
                "explanation": "Flows on anchor asof date are excluded due `date > anchor_asof` filter.",
            },
        )

    async def case_realized_short_direction_ambiguity(self) -> AuditCaseResult:
        self.reset_db()
        target_account = "Synthetic Account ...999"
        csv_text = """Realized Gain/Loss - Lot Details for All_Accounts as of Tue Mar 03  19:13:09 EDT 2026 from 01/01/2026 to 03/03/2026
Synthetic Account ...999
Symbol,Name,Closed Date,Opened Date,Quantity,Proceeds Per Share,Cost Per Share,Proceeds,Cost Basis (CB),Gain/Loss ($),Gain/Loss (%),Long Term Gain/Loss,Short Term Gain/Loss,Term,Unadjusted Cost Basis,Wash Sale?,Disallowed Loss,Transaction Closed Date,Transaction Cost Basis,Total Transaction Gain/Loss ($),Total Transaction Gain/Loss (%),LT Transaction Gain/Loss ($),LT Transaction Gain/Loss (%),ST Transaction Gain/Loss ($),ST Transaction Gain/Loss (%)
TEST,TEST SYMBOL,01/03/2026,01/02/2026,10,$8.00,$10.00,$80.00,$100.00,-$20.00,-20%,,$-20.00,Short Term,$100.00,No,,01/03/2026,,,,,,,
"""
        parsed = self.admin._parse_realized_lot_details_rows(csv_text, target_account)  # type: ignore[attr-defined]
        actions = [str(r.get("Action")) for r in parsed]
        # Parser always emits BUY(open) then SELL(close). For short lots true direction is reversed.
        always_long_shape = len(parsed) == 2 and actions == ["BUY", "SELL"]
        return AuditCaseResult(
            name="realized_short_direction_ambiguity",
            status="fail" if always_long_shape else "pass",
            details={
                "rows_emitted": parsed,
                "explanation": (
                    "Realized CSV lacks explicit open-side in parser logic; synthetic short lot would be treated as long lot."
                ),
            },
        )

    async def case_precision_accumulation(self) -> AuditCaseResult:
        self.reset_db()
        account = "TEST_PRECISION"
        self.set_account_anchor(account, cash=0.0, asof=None)
        n = 200_000
        amount = 0.01

        def _run(conn):
            cur = conn.cursor()
            rows = [(account, "2026-01-02", amount, "PRECISION_TEST") for _ in range(n)]
            cur.executemany(
                "INSERT INTO cash_flows(account, date, amount, note) VALUES(?,?,?,?)",
                rows,
            )
            conn.commit()

        self.with_conn(_run)
        total = self.legacy_engine.compute_cash_balance_total(account)
        expected = n * amount
        drift = float(total - expected)
        return AuditCaseResult(
            name="float_precision_accumulation",
            status="pass" if abs(drift) < 1.0 else "fail",
            details={
                "entries": n,
                "amount_each": amount,
                "expected_total": expected,
                "computed_total": total,
                "drift": drift,
            },
        )

    async def case_snapshot_vs_nav_consistency(
        self, tx_paths: List[Path], positions_path: Optional[Path], realized_path: Optional[Path]
    ) -> AuditCaseResult:
        self.reset_db()
        accounts = []
        for tx in tx_paths:
            acct = _account_from_transactions_filename(tx)
            if not acct:
                continue
            if tx.stat().st_size < 8:
                continue
            try:
                await self.import_tx(tx, acct, replace=True)
            except Exception as exc:
                if "no transactions found in csv" in str(exc).lower():
                    continue
                raise
            accounts.append(acct)
        if positions_path and positions_path.exists():
            await self.admin.import_positions(file=_upload(positions_path), account="ALL")
        if realized_path and realized_path.exists():
            for acct in sorted(set(accounts)):
                try:
                    await self.import_tx(realized_path, acct, replace=False)
                except Exception:
                    pass

        # Ensure no account_value override during this consistency check.
        for acct in sorted(set(accounts)):
            self.clear_account_value(acct)

        mismatches = []
        for acct in sorted(set(accounts)):
            snap = self.portfolio_service.get_snapshot(account=acct)
            nlv = float(snap.get("nlv") or 0.0)
            nav = self.latest_nav(acct)
            if nav is None:
                continue
            diff = float(nlv - nav)
            if abs(diff) >= 1.0:
                mismatches.append({"account": acct, "snapshot_nlv": nlv, "latest_nav": nav, "difference": diff})

        return AuditCaseResult(
            name="snapshot_vs_latest_nav_consistency",
            status="pass" if not mismatches else "fail",
            details={
                "checked_accounts": sorted(set(accounts)),
                "mismatches_ge_1usd": mismatches,
                "mismatch_count": len(mismatches),
            },
        )


async def run_audit(args: argparse.Namespace) -> Dict[str, Any]:
    db_path = Path(args.db_path).resolve()
    auditor = Auditor(db_path)

    tx_paths = [Path(p).resolve() for p in args.transactions]
    tx_paths = [p for p in tx_paths if p.exists() and p.is_file()]
    if not tx_paths:
        raise RuntimeError("No valid transaction files provided.")

    account_013 = None
    tx_013 = None
    for p in tx_paths:
        acct = _account_from_transactions_filename(p)
        if acct and acct.endswith("...013"):
            account_013 = acct
            tx_013 = p
            break
    if not tx_013 or not account_013:
        raise RuntimeError("Need a valid XXX013 transactions file to run core idempotency tests.")

    cases: List[AuditCaseResult] = []
    t0 = time.time()
    cases.append(await auditor.case_idempotent_replace(tx_013, account_013))
    cases.append(await auditor.case_duplicate_append(tx_013, account_013))
    if args.realized and Path(args.realized).exists():
        cases.append(await auditor.case_realized_on_top_of_full_ledger(tx_013, Path(args.realized), account_013))
    else:
        cases.append(
            AuditCaseResult(
                name="realized_plus_full_ledger_overlap",
                status="skip",
                details={"reason": "realized file not provided"},
            )
        )
    cases.append(await auditor.case_asof_boundary_exclusion())
    cases.append(await auditor.case_realized_short_direction_ambiguity())
    cases.append(await auditor.case_precision_accumulation())
    cases.append(
        await auditor.case_snapshot_vs_nav_consistency(
            tx_paths=tx_paths,
            positions_path=Path(args.positions) if args.positions else None,
            realized_path=Path(args.realized) if args.realized else None,
        )
    )
    elapsed = time.time() - t0

    failures = [c for c in cases if c.status == "fail"]
    skips = [c for c in cases if c.status == "skip"]
    passes = [c for c in cases if c.status == "pass"]
    return {
        "meta": {
            "db_path": str(db_path),
            "elapsed_seconds": elapsed,
            "transactions_count": len(tx_paths),
            "positions": str(args.positions or ""),
            "realized": str(args.realized or ""),
        },
        "summary": {
            "pass": len(passes),
            "fail": len(failures),
            "skip": len(skips),
            "failed_cases": [c.name for c in failures],
        },
        "cases": [{"name": c.name, "status": c.status, "details": c.details} for c in cases],
    }


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Deep contingency stress audit for NAV rebuild/import framework.")
    p.add_argument("--db-path", default=str(Path(tempfile.gettempdir()) / "nav_contingency_audit.db"))
    p.add_argument("--positions", default="", help="Optional positions CSV for cross-consistency test.")
    p.add_argument("--realized", default="", help="Optional realized gain/loss CSV for overlap tests.")
    p.add_argument("--transactions", action="append", default=[], help="Transaction CSV path (repeatable).")
    p.add_argument("--report", default=str(_repo_root() / "nav_contingency_audit_report.json"))
    return p


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        report = asyncio.run(run_audit(args))
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    report_path = Path(args.report).resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))
    print(f"Report written to: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
