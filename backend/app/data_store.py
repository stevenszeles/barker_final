from __future__ import annotations

import json
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_FILE = BASE_DIR / "data" / "portfolio_data.json"

_CACHE: dict[str, Any] = {"mtime": None, "data": None}


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return fallback


def _normalize_position(position: dict[str, Any]) -> dict[str, Any] | None:
    symbol = str(position.get("symbol") or "").strip().upper()
    shares = _safe_float(position.get("shares"))
    avg_cost = _safe_float(position.get("avg_cost"))
    if not symbol or shares == 0:
        return None
    return {"symbol": symbol, "shares": shares, "avg_cost": max(avg_cost, 0.0)}


def _normalize_dataset(raw: dict[str, Any]) -> dict[str, Any]:
    benchmarks = [str(sym).strip().upper() for sym in (raw.get("benchmarks") or []) if str(sym).strip()]
    if not benchmarks:
        benchmarks = ["SPY"]

    accounts: list[dict[str, Any]] = []
    for account in raw.get("accounts") or []:
        account_id = str(account.get("id") or "").strip().lower()
        account_name = str(account.get("name") or account_id).strip()
        if not account_id:
            continue

        portfolios: list[dict[str, Any]] = []
        for portfolio in account.get("portfolios") or []:
            portfolio_id = str(portfolio.get("id") or "").strip().lower()
            portfolio_name = str(portfolio.get("name") or portfolio_id).strip()
            if not portfolio_id:
                continue

            positions: list[dict[str, Any]] = []
            for position in portfolio.get("positions") or []:
                normalized = _normalize_position(position)
                if normalized:
                    positions.append(normalized)

            portfolios.append(
                {
                    "id": portfolio_id,
                    "name": portfolio_name,
                    "cash": max(_safe_float(portfolio.get("cash")), 0.0),
                    "positions": positions,
                }
            )

        if portfolios:
            accounts.append({"id": account_id, "name": account_name, "portfolios": portfolios})

    if not accounts:
        raise RuntimeError(f"No valid accounts found in {DATA_FILE}")

    return {"benchmarks": benchmarks, "accounts": accounts}


def get_dataset() -> dict[str, Any]:
    if not DATA_FILE.exists():
        raise RuntimeError(f"Missing data file: {DATA_FILE}")

    mtime = DATA_FILE.stat().st_mtime
    if _CACHE["data"] is not None and _CACHE["mtime"] == mtime:
        return _CACHE["data"]

    with DATA_FILE.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)

    normalized = _normalize_dataset(raw)
    _CACHE["mtime"] = mtime
    _CACHE["data"] = normalized
    return normalized


def list_scopes(dataset: dict[str, Any]) -> list[dict[str, str]]:
    scopes = [{"id": "total", "label": "All Accounts", "type": "total"}]
    for account in dataset["accounts"]:
        account_id = account["id"]
        scopes.append(
            {
                "id": f"account:{account_id}",
                "label": account["name"],
                "type": "account",
            }
        )
        for portfolio in account["portfolios"]:
            scopes.append(
                {
                    "id": f"portfolio:{account_id}:{portfolio['id']}",
                    "label": f"{account['name']} - {portfolio['name']}",
                    "type": "portfolio",
                }
            )
    return scopes


def _aggregate_positions(positions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    aggregate: dict[str, dict[str, float]] = {}
    for row in positions:
        symbol = row["symbol"]
        shares = _safe_float(row.get("shares"))
        avg_cost = _safe_float(row.get("avg_cost"))
        if shares == 0:
            continue
        item = aggregate.setdefault(symbol, {"shares": 0.0, "cost_sum": 0.0})
        item["shares"] += shares
        item["cost_sum"] += shares * avg_cost

    out: list[dict[str, Any]] = []
    for symbol, item in aggregate.items():
        shares = item["shares"]
        if shares == 0:
            continue
        out.append({"symbol": symbol, "shares": shares, "avg_cost": item["cost_sum"] / shares})
    out.sort(key=lambda row: row["symbol"])
    return out


def resolve_scope(dataset: dict[str, Any], scope_id: str) -> dict[str, Any]:
    scope_id = (scope_id or "total").strip().lower()

    if scope_id == "total":
        positions: list[dict[str, Any]] = []
        cash = 0.0
        for account in dataset["accounts"]:
            for portfolio in account["portfolios"]:
                positions.extend(portfolio["positions"])
                cash += _safe_float(portfolio.get("cash"))
        return {
            "id": "total",
            "label": "All Accounts",
            "positions": _aggregate_positions(positions),
            "cash": cash,
        }

    if scope_id.startswith("account:"):
        account_id = scope_id.split(":", 1)[1].strip()
        for account in dataset["accounts"]:
            if account["id"] != account_id:
                continue
            positions = []
            cash = 0.0
            for portfolio in account["portfolios"]:
                positions.extend(portfolio["positions"])
                cash += _safe_float(portfolio.get("cash"))
            return {
                "id": scope_id,
                "label": account["name"],
                "positions": _aggregate_positions(positions),
                "cash": cash,
            }
        raise ValueError(f"Unknown account scope: {scope_id}")

    if scope_id.startswith("portfolio:"):
        parts = scope_id.split(":")
        if len(parts) != 3:
            raise ValueError(f"Invalid portfolio scope: {scope_id}")
        account_id, portfolio_id = parts[1], parts[2]
        for account in dataset["accounts"]:
            if account["id"] != account_id:
                continue
            for portfolio in account["portfolios"]:
                if portfolio["id"] != portfolio_id:
                    continue
                return {
                    "id": scope_id,
                    "label": f"{account['name']} - {portfolio['name']}",
                    "positions": _aggregate_positions(portfolio["positions"]),
                    "cash": _safe_float(portfolio.get("cash")),
                }
        raise ValueError(f"Unknown portfolio scope: {scope_id}")

    raise ValueError(f"Unknown scope: {scope_id}")
