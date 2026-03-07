#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import csv
import io
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from starlette.datastructures import UploadFile


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app.db import ensure_schema, with_conn  # noqa: E402
from backend.app.routers import admin  # noqa: E402
from backend.app.services import legacy_engine, portfolio as portfolio_service  # noqa: E402


DEFAULT_POSITIONS = Path("/Users/stevenszeles/Downloads/-Positions-2026-03-03-020401.csv")
DEFAULT_BALANCES = Path("/Users/stevenszeles/Downloads/All_Accounts_Balances_20260303-020349.CSV")
DEFAULT_REALIZED = Path("/Users/stevenszeles/Downloads/All_Accounts_GainLoss_Realized_Details_20260303-020415.csv")
DEFAULT_TX_013 = Path("/Users/stevenszeles/Downloads/Limit_Liability_Company_XXX013_Transactions_20260303-030602.csv")


@dataclass
class TransactionImport:
    account: str
    path: Path
    replace: bool


def _require_file(path: Path, label: str) -> Path:
    if not path.exists():
        raise FileNotFoundError(f"{label} file not found: {path}")
    if not path.is_file():
        raise FileNotFoundError(f"{label} path is not a file: {path}")
    return path


def _upload(path: Path) -> UploadFile:
    return UploadFile(filename=path.name, file=io.BytesIO(path.read_bytes()))


def _digits_suffix(value: str, width: int = 4) -> str:
    digits = "".join(re.findall(r"\d", value or ""))
    if not digits:
        return ""
    if len(digits) >= width:
        return digits[-width:]
    return digits


def _guess_account_from_filename(filename: str, accounts: List[str]) -> Optional[str]:
    upper = (filename or "").upper()
    hints: List[str] = []
    for pattern in (r"XXX(\d{3,6})", r"\.\.\.(\d{3,6})", r"(\d{3,6})(?=[^0-9]*$)"):
        match = re.search(pattern, upper)
        if match:
            hints.append(match.group(1))
    if not hints:
        return None
    for hint in hints:
        for account in accounts:
            suffix = _digits_suffix(account)
            if suffix and suffix.endswith(hint[-len(suffix):]):
                return account
            all_digits = "".join(re.findall(r"\d", account))
            if all_digits.endswith(hint):
                return account
    return None


def _parse_positions_accounts(path: Path) -> List[str]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    parsed = admin._parse_custaccs_positions(text)
    accounts = sorted(
        {
            legacy_engine._account_label(str(row.get("account") or "").strip())
            for row in (parsed.get("positions") or [])
            if str(row.get("account") or "").strip()
        }
    )
    return [a for a in accounts if a and a != "ALL"]


def _load_existing_accounts() -> List[str]:
    rows = portfolio_service.get_accounts() or []
    accounts = []
    for row in rows:
        label = legacy_engine._account_label(str((row or {}).get("account") or "").strip())
        if label and label != "ALL":
            accounts.append(label)
    return sorted(set(accounts))


def _parse_balances_targets(path: Path, target_accounts: List[str]) -> Dict[str, Dict[str, Any]]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    rows = list(csv.reader(io.StringIO(text)))
    existing = list(target_accounts)
    mapped: Dict[str, Dict[str, Any]] = {}
    current_account: Optional[str] = None
    asof: Optional[str] = None

    for row in rows:
        if not row or not any((cell or "").strip() for cell in row):
            continue
        cell0 = (row[0] or "").strip()
        if cell0.lower().startswith("balances for"):
            match = re.search(r"(\d{2}/\d{2}/\d{4})", cell0)
            if match:
                try:
                    asof = datetime.strptime(match.group(1), "%m/%d/%Y").date().isoformat()
                except Exception:
                    asof = None
            continue
        if len(row) == 1 and cell0 and not cell0.lower().startswith("total "):
            name = admin._normalize_account_name(cell0)
            key = admin._normalize_account_key(name)
            if key in {"all accounts", "all-accounts", "option details", "funds available", "investments"}:
                current_account = None
                continue
            current_account = admin._match_existing_account(name, existing)
            mapped.setdefault(current_account, {"cash": None, "account_value": None, "asof": asof})
            continue
        if len(row) >= 2 and current_account:
            key = (row[0] or "").strip().lower()
            value = (row[1] or "").strip()
            if key.startswith("cash & cash investments"):
                cash_val = admin._parse_money_value(value)
                if cash_val is not None:
                    mapped[current_account]["cash"] = float(cash_val)
            if key.startswith("account value"):
                nav_val = admin._parse_money_value(value)
                if nav_val is not None:
                    mapped[current_account]["account_value"] = float(nav_val)

    return mapped


def _store_account_values(balance_targets: Dict[str, Dict[str, Any]]) -> int:
    if not balance_targets:
        return 0

    def _run(conn):
        cur = conn.cursor()
        updated = 0
        for account, data in balance_targets.items():
            value = _safe_float(data.get("account_value"))
            if value is None:
                continue
            cur.execute("SELECT account, cash FROM accounts WHERE account=?", (account,))
            row = cur.fetchone()
            if row:
                cur.execute("UPDATE accounts SET account_value=? WHERE account=?", (float(value), account))
            else:
                cash = _safe_float(data.get("cash")) or 0.0
                cur.execute(
                    "INSERT OR REPLACE INTO accounts(account, cash, asof, account_value) VALUES(?,?,?,?)",
                    (account, float(cash), None, float(value)),
                )
            updated += 1
        conn.commit()
        return updated

    return int(with_conn(_run) or 0)


def _clear_account_values(accounts: List[str]) -> int:
    targets = sorted({legacy_engine._account_label(a) for a in accounts if a})
    if not targets:
        return 0

    def _run(conn):
        cur = conn.cursor()
        updated = 0
        for account in targets:
            cur.execute("UPDATE accounts SET account_value=NULL WHERE account=?", (account,))
            try:
                updated += int(cur.rowcount or 0)
            except Exception:
                # Some adapters may not populate rowcount reliably.
                pass
        conn.commit()
        return updated

    return int(with_conn(_run) or 0)


async def _import_positions(path: Path) -> Dict[str, Any]:
    return await admin.import_positions(file=_upload(path), account="ALL")


async def _import_balances(path: Path) -> Dict[str, Any]:
    return await admin.import_balances(file=_upload(path))


async def _import_transactions(path: Path, account: str, replace: bool) -> Dict[str, Any]:
    return await admin.import_transactions(file=_upload(path), account=account, replace=replace)


def _safe_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None


def _latest_nav(account: str) -> Optional[float]:
    point = _latest_nav_point(account)
    if not point:
        return None
    return _safe_float(point.get("nav"))


def _latest_nav_point(account: str) -> Optional[Dict[str, Any]]:
    points = legacy_engine.get_nav_series(limit=1, account=account)
    if not points:
        return None
    point = points[-1]
    return {
        "date": str(point.get("date") or legacy_engine.today_str()),
        "nav": _safe_float(point.get("nav")),
    }


def _insert_cash_flow(account: str, date_iso: str, amount: float, note: str) -> None:
    def _run(conn):
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO cash_flows(account, date, amount, note) VALUES(?,?,?,?)",
            (account, date_iso, float(amount), note),
        )
        conn.commit()

    with_conn(_run)


def _reconcile_to_balances(
    balance_targets: Dict[str, Dict[str, Any]],
    target_accounts: List[str],
    nav_limit: int,
) -> Dict[str, Any]:
    adjustments: List[Dict[str, Any]] = []
    for account in sorted(set(target_accounts)):
        expected = _safe_float((balance_targets.get(account) or {}).get("account_value"))
        if expected is None:
            continue
        latest_point = _latest_nav_point(account)
        if not latest_point:
            continue
        latest = _safe_float(latest_point.get("nav"))
        if latest is None:
            continue
        delta = float(expected - latest)
        if abs(delta) < 0.005:
            continue
        nav_date = legacy_engine.parse_iso_date(str(latest_point.get("date") or "")) or legacy_engine.today_str()
        _insert_cash_flow(account, nav_date, delta, "NAV_REBUILD_RECONCILE")
        adjustments.append(
            {
                "account": account,
                "date": nav_date,
                "delta": delta,
                "expected": expected,
                "before_latest_nav": latest,
            }
        )

    rebuild = {}
    if adjustments:
        rebuild["ALL"] = portfolio_service.rebuild_nav_history(limit=nav_limit, account=None)
        for account in sorted(set(target_accounts)):
            rebuild[account] = portfolio_service.rebuild_nav_history(limit=nav_limit, account=account)
    return {"count": len(adjustments), "adjustments": adjustments, "rebuild": rebuild}


def _build_report(
    inputs: Dict[str, str],
    imports: Dict[str, Any],
    target_accounts: List[str],
    balance_targets: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    account_rows = []
    accounts_state = {row.get("account"): row for row in portfolio_service.get_accounts()}

    for account in sorted(set(target_accounts)):
        state = accounts_state.get(account, {})
        expected = _safe_float((balance_targets.get(account) or {}).get("account_value"))
        if expected is None:
            expected = _safe_float(state.get("account_value"))
        latest = _latest_nav(account)
        diff = None
        diff_pct = None
        if expected is not None and latest is not None:
            diff = latest - expected
            diff_pct = (diff / expected * 100.0) if abs(expected) > 1e-9 else None
        account_rows.append(
            {
                "account": account,
                "account_value": expected,
                "latest_nav": latest,
                "difference": diff,
                "difference_pct": diff_pct,
                "cash": _safe_float(state.get("cash")),
                "asof": state.get("asof"),
            }
        )

    within_025 = sum(1 for row in account_rows if row.get("difference_pct") is not None and abs(row["difference_pct"]) <= 0.25)
    within_100 = sum(1 for row in account_rows if row.get("difference_pct") is not None and abs(row["difference_pct"]) <= 1.00)

    return {
        "inputs": inputs,
        "imports": imports,
        "accounts": account_rows,
        "summary": {
            "accounts_total": len(account_rows),
            "within_0_25pct": within_025,
            "within_1_00pct": within_100,
        },
    }


def _print_report(report: Dict[str, Any]) -> None:
    print("\nNAV Rebuild Reconciliation")
    print("-" * 120)
    print(f"{'Account':44} {'Account Value':>14} {'Latest NAV':>14} {'Diff':>12} {'Diff %':>9}")
    print("-" * 120)
    for row in report.get("accounts", []):
        account = str(row.get("account") or "")
        expected = row.get("account_value")
        latest = row.get("latest_nav")
        diff = row.get("difference")
        diff_pct = row.get("difference_pct")
        expected_s = f"{expected:,.2f}" if isinstance(expected, (int, float)) else "n/a"
        latest_s = f"{latest:,.2f}" if isinstance(latest, (int, float)) else "n/a"
        diff_s = f"{diff:,.2f}" if isinstance(diff, (int, float)) else "n/a"
        diff_pct_s = f"{diff_pct:.2f}%" if isinstance(diff_pct, (int, float)) else "n/a"
        print(f"{account[:44]:44} {expected_s:>14} {latest_s:>14} {diff_s:>12} {diff_pct_s:>9}")
    print("-" * 120)
    summary = report.get("summary", {})
    print(
        "Summary: "
        f"{summary.get('accounts_total', 0)} accounts, "
        f"{summary.get('within_0_25pct', 0)} within 0.25%, "
        f"{summary.get('within_1_00pct', 0)} within 1.00%"
    )


async def _run(args: argparse.Namespace) -> Dict[str, Any]:
    positions_file: Optional[Path] = None
    if not args.skip_positions:
        positions_file = _require_file(Path(args.positions), "positions")
    balances_file: Optional[Path] = None
    if not args.skip_balances:
        balances_raw = str(args.balances or "").strip()
        if not balances_raw:
            raise RuntimeError("Balances path is required unless --skip-balances is set.")
        balances_file = _require_file(Path(balances_raw), "balances")
    realized_file: Optional[Path] = None
    if (not args.skip_realized) and args.realized:
        realized_file = Path(args.realized)
        _require_file(realized_file, "realized")

    ensure_schema()

    # Parse target accounts from positions file when available.
    target_accounts: List[str] = []
    if positions_file:
        target_accounts = _parse_positions_accounts(positions_file)
        if not target_accounts:
            raise RuntimeError("No accounts parsed from positions file.")
    balance_targets: Dict[str, Dict[str, Any]] = {}
    if balances_file:
        balance_targets = _parse_balances_targets(balances_file, target_accounts)

    tx_imports: List[TransactionImport] = []
    tx_replace = not bool(args.transactions_append)
    guess_accounts = list(target_accounts) if target_accounts else _load_existing_accounts()
    tx_raw_list = list(args.transactions or [])
    if not tx_raw_list:
        if DEFAULT_TX_013.exists():
            tx_raw_list = [str(DEFAULT_TX_013)]
        else:
            raise RuntimeError("At least one --transactions file is required.")

    for raw in tx_raw_list:
        if "=" in raw:
            account_raw, file_raw = raw.split("=", 1)
            account = legacy_engine._account_label(account_raw.strip())
            tx_path = _require_file(Path(file_raw.strip()), "transaction")
            tx_imports.append(TransactionImport(account=account, path=tx_path, replace=tx_replace))
            continue
        tx_path = _require_file(Path(raw.strip()), "transaction")
        guessed = _guess_account_from_filename(tx_path.name, guess_accounts)
        if not guessed:
            raise RuntimeError(
                f"Could not infer account from transaction filename '{tx_path.name}'. "
                "Use --transactions 'Account Name=/abs/path/file.csv'."
            )
        tx_imports.append(TransactionImport(account=guessed, path=tx_path, replace=tx_replace))

    deduped: List[TransactionImport] = []
    seen_tx: set[tuple[str, str]] = set()
    for item in tx_imports:
        key = (item.account, str(item.path.resolve()))
        if key in seen_tx:
            continue
        seen_tx.add(key)
        deduped.append(item)
    tx_imports = deduped

    if not target_accounts:
        target_accounts = sorted({item.account for item in tx_imports})
    if not target_accounts:
        raise RuntimeError("No target accounts resolved. Provide positions file or explicit transaction mappings.")

    if balances_file and not balance_targets:
        balance_targets = _parse_balances_targets(balances_file, target_accounts)

    imports: Dict[str, Any] = {
        "transactions": [],
        "transactions_deduped": len(deduped),
        "positions": None,
        "balances": None,
        "balance_targets": {},
        "realized": [],
        "rebuild_nav": {},
        "reconcile": {},
        "account_values_cleared": 0,
    }

    # 1) Load full transaction ledgers first for high-fidelity trade/cash history.
    imported_tx_accounts = set()
    for item in tx_imports:
        result = await _import_transactions(item.path, account=item.account, replace=item.replace)
        imports["transactions"].append({"account": item.account, "file": str(item.path), "result": result})
        imported_tx_accounts.add(item.account)

    # 2) Optionally refresh all current positions snapshot.
    if positions_file:
        imports["positions"] = await _import_positions(positions_file)
    else:
        imports["positions"] = {"skipped": "skip-positions enabled"}

    if args.clear_account_values:
        imports["account_values_cleared"] = _clear_account_values(target_accounts)

    # 3) Optionally apply all-account balances anchor.
    if balances_file:
        imports["balances"] = await _import_balances(balances_file)
        imports["balance_targets"] = {"accounts": len(balance_targets)}
        imports["balance_targets"]["account_values_written"] = _store_account_values(balance_targets)
    else:
        imports["balances"] = {"skipped": "skip-balances enabled"}
        imports["balance_targets"] = {"accounts": 0, "account_values_written": 0}

    # 4) Backfill closed-lot history from realized lots for accounts without dedicated transactions file.
    if realized_file and not args.skip_realized:
        for account in target_accounts:
            if account in imported_tx_accounts:
                continue
            try:
                result = await _import_transactions(realized_file, account=account, replace=False)
                imports["realized"].append({"account": account, "file": str(realized_file), "result": result})
            except HTTPException as exc:
                detail = str(exc.detail)
                if exc.status_code == 400 and "No transactions found" in detail:
                    imports["realized"].append(
                        {"account": account, "file": str(realized_file), "skipped": "no matching realized rows"}
                    )
                    continue
                raise

    # 5) Rebuild NAV snapshots: ALL first (clears stale rows), then each account.
    imports["rebuild_nav"]["ALL"] = portfolio_service.rebuild_nav_history(limit=args.nav_limit, account=None)
    for account in target_accounts:
        imports["rebuild_nav"][account] = portfolio_service.rebuild_nav_history(limit=args.nav_limit, account=account)

    if args.reconcile_to_balances and balance_targets:
        imports["reconcile"] = _reconcile_to_balances(balance_targets, target_accounts, nav_limit=args.nav_limit)
    elif args.reconcile_to_balances:
        imports["reconcile"] = {"skipped": "no balances loaded", "count": 0, "adjustments": [], "rebuild": {}}
    else:
        imports["reconcile"] = {"skipped": "disabled", "count": 0, "adjustments": [], "rebuild": {}}

    report = _build_report(
        inputs={
            "positions": str(positions_file) if positions_file else "",
            "balances": str(balances_file) if balances_file else "",
            "realized": str(realized_file) if realized_file else "",
            "transactions": ",".join(str(item.path) for item in tx_imports),
        },
        imports=imports,
        target_accounts=target_accounts,
        balance_targets=balance_targets,
    )
    return report


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Framework runner: import Schwab exports and rebuild NAV with reconciliation report."
    )
    parser.add_argument("--positions", default=str(DEFAULT_POSITIONS), help="Positions CSV path (all-accounts CUSTACCS export).")
    parser.add_argument(
        "--skip-positions",
        action="store_true",
        help="Do not import positions snapshot; derive everything from transactions and prices.",
    )
    parser.add_argument("--balances", default=str(DEFAULT_BALANCES), help="Balances CSV path (all-accounts balances export).")
    parser.add_argument(
        "--skip-balances",
        action="store_true",
        help="Do not import balances or account-value anchors; rebuild from transactions + prices only.",
    )
    parser.add_argument(
        "--realized",
        default=str(DEFAULT_REALIZED),
        help="Realized gain/loss lot details CSV path (all-accounts).",
    )
    parser.add_argument(
        "--transactions",
        action="append",
        default=[],
        help=(
            "Transaction CSV path. Use multiple --transactions flags. "
            "Format can be '/path/file.csv' (account inferred) or "
            "'Account Name=/path/file.csv' (explicit mapping)."
        ),
    )
    parser.add_argument(
        "--transactions-append",
        action="store_true",
        help="Append dedicated transaction files instead of replacing existing account trade history.",
    )
    parser.add_argument(
        "--skip-realized",
        action="store_true",
        help="Skip realized-lot backfill step.",
    )
    parser.add_argument(
        "--clear-account-values",
        action="store_true",
        default=True,
        help="Clear account_value anchors before rebuild so NAV/snapshot are transaction+price driven (default: true).",
    )
    parser.add_argument(
        "--no-clear-account-values",
        dest="clear_account_values",
        action="store_false",
        help="Keep existing account_value anchors.",
    )
    parser.add_argument(
        "--reconcile-to-balances",
        action="store_true",
        default=True,
        help="Add NAV_REBUILD_RECONCILE cash-flow adjustments so latest NAV matches imported account values (default: true).",
    )
    parser.add_argument(
        "--no-reconcile-to-balances",
        dest="reconcile_to_balances",
        action="store_false",
        help="Disable final balance reconciliation cash-flow adjustments.",
    )
    parser.add_argument(
        "--nav-limit",
        type=int,
        default=4000,
        help="Max NAV points to rebuild per account.",
    )
    parser.add_argument(
        "--report",
        default=str(REPO_ROOT / "nav_rebuild_report.json"),
        help="Output JSON report path.",
    )
    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()
    try:
        report = asyncio.run(_run(args))
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    _print_report(report)
    print(f"\nReport written to: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
