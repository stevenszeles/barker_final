from datetime import datetime, date, timedelta
from typing import Optional, Dict, Any, List
import csv
import io
import logging
import hashlib
import re
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from ..db import with_conn
from ..config import settings
from ..services import portfolio as portfolio_service
from ..services import legacy_engine as legacy_engine
from ..services import options as options_service

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)


class ResetPayload(BaseModel):
    start_cash: float = 0.0
    delete_accounts: bool = True


class BenchPayload(BaseModel):
    bench_start: str


class NavTextPayload(BaseModel):
    account: str
    text: str
    append: bool = False


class BenchTextPayload(BaseModel):
    text: str
    append: bool = False


class AssignTradeSectorPayload(BaseModel):
    account: str
    sector: str
    symbol: Optional[str] = None
    only_unassigned: bool = True
    realized_only: bool = True


class AutoClassifyTradesPayload(BaseModel):
    account: str
    only_unassigned: bool = True
    realized_only: bool = True


class UpdateTradeSectorPayload(BaseModel):
    trade_id: str
    sector: str


class UpdateTradeRealizedPayload(BaseModel):
    trade_id: str
    realized_pl: Optional[float] = None


class SectorPerformanceInputPayload(BaseModel):
    account: str
    sector: str
    baseline_value: Optional[float] = None
    target_weight: Optional[float] = None


@router.get("/benchmark")
def get_benchmark():
    def _run(conn):
        cur = conn.cursor()
        cur.execute("SELECT value FROM settings WHERE key='bench_start'")
        row = cur.fetchone()
        return row[0] if row else None

    value = with_conn(_run)
    return {"bench_start": value}


@router.get("/accounts")
def list_accounts():
    return {"accounts": portfolio_service.get_accounts()}


@router.post("/reset")
def reset_portfolio(payload: ResetPayload):
    if payload.start_cash <= 0:
        raise HTTPException(status_code=400, detail="Start cash must be > 0")

    def _run(conn):
        cur = conn.cursor()
        cur.execute("DELETE FROM positions")
        cur.execute("DELETE FROM trades")
        cur.execute("DELETE FROM instruments")
        cur.execute("DELETE FROM nav_snapshots")
        cur.execute("DELETE FROM cash_flows")
        cur.execute("DELETE FROM import_event_keys")
        if payload.delete_accounts:
            cur.execute("DELETE FROM accounts")
        else:
            cur.execute("UPDATE accounts SET cash=0, asof=NULL, account_value=NULL, anchor_mode='BOD'")
        cur.execute("DELETE FROM daily_positions")
        cur.execute("DELETE FROM risk_metrics")
        cur.execute("DELETE FROM audit_log")
        cur.execute("DELETE FROM strategies")
        cur.execute("INSERT OR REPLACE INTO settings(key, value) VALUES('cash', ?)", (str(payload.start_cash),))
        cur.execute("INSERT OR REPLACE INTO settings(key, value) VALUES('start_cash', ?)", (str(payload.start_cash),))
        conn.commit()

    with_conn(_run)
    try:
        legacy_engine._clear_nav_cache()
    except Exception:
        pass
    return {"ok": True, "accounts_deleted": bool(payload.delete_accounts)}


@router.post("/benchmark")
def set_benchmark(payload: BenchPayload):
    try:
        datetime.strptime(payload.bench_start, "%Y-%m-%d")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Benchmark start must be YYYY-MM-DD") from exc

    def _run(conn):
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO settings(key, value) VALUES('bench_start', ?)", (payload.bench_start,))
        cur.execute("DELETE FROM settings WHERE key='bench_scale'")
        conn.commit()

    with_conn(_run)
    return {"ok": True}


@router.post("/rebuild-nav")
def rebuild_nav(limit: int = 1500, account: Optional[str] = None):
    if settings.static_mode:
        raise HTTPException(status_code=400, detail="NAV rebuild is disabled in static mode. Import balance history instead.")
    return portfolio_service.rebuild_nav_history(limit=limit, account=account)


@router.post("/clear-nav")
def clear_nav(account: Optional[str] = None):
    if settings.static_mode:
        raise HTTPException(status_code=400, detail="NAV clear is disabled in static mode. Manage NAV via balance imports.")
    return portfolio_service.clear_nav_history(account=account)


def _parse_money(raw: str) -> float:
    if raw is None:
        return 0.0
    text = str(raw).strip()
    if not text or text in {"--", "-"}:
        return 0.0
    text = text.replace("$", "").replace(",", "")
    text = text.replace("(", "-").replace(")", "")
    try:
        return float(text)
    except Exception:
        return 0.0


def _normalize_symbol_token(raw: str) -> str:
    symbol = str(raw or "").strip().upper()
    if not symbol:
        return ""
    if legacy_engine.is_option_symbol(symbol):
        return symbol
    if symbol.startswith("$") and symbol not in {"$SPX"}:
        symbol = symbol[1:]
    if re.fullmatch(r"[A-Z]{1,6}[./][A-Z]{1,3}", symbol):
        symbol = symbol.replace("/", "-").replace(".", "-")
    return symbol


def _parse_float(raw: str) -> float:
    if raw is None:
        return 0.0
    text = str(raw).strip()
    if not text or text in {"--", "-"}:
        return 0.0
    text = text.replace(",", "")
    try:
        return float(text)
    except Exception:
        return 0.0


def _normalize_account_name(raw: str) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _normalize_account_key(raw: str) -> str:
    text = _normalize_account_name(raw)
    if not text:
        return ""
    return text.replace("_", " ").lower()


def _account_identity(raw: str) -> tuple[str, str]:
    text = _normalize_account_name(raw)
    if not text:
        return "", ""
    words = [w for w in re.findall(r"[A-Za-z]+", text) if not re.fullmatch(r"X+", w, re.I)]
    base = " ".join(words).strip().lower()
    digits = "".join(re.findall(r"\d", text))
    return base, digits


def _match_existing_account(name: str, existing_accounts: list[str]) -> str:
    base, digits = _account_identity(name)
    if not base and not digits:
        return name
    best = None
    best_score = -1
    for acct in existing_accounts:
        abase, adigits = _account_identity(acct)
        if base and abase and base != abase:
            continue
        score = 0
        if digits and adigits:
            if digits == adigits:
                score = 100 + len(digits)
            elif digits.endswith(adigits) or adigits.endswith(digits):
                score = 50 + min(len(digits), len(adigits))
            else:
                continue
        elif base and abase and base == abase:
            score = 10
        if score > best_score:
            best_score = score
            best = acct
    return best or name


def _position_meta_key(account: str, symbol: str, asset_class: str) -> tuple[str, str, str]:
    acct = legacy_engine._account_label(account)
    sym = _normalize_symbol_token(symbol)
    cls = str(asset_class or "equity").strip().lower() or "equity"
    if cls not in {"equity", "option", "future", "crypto"}:
        cls = "equity"
    return acct, cls, sym


def _expand_account_aliases(
    target_accounts: List[str],
    existing_accounts: List[str],
) -> tuple[List[str], Dict[str, str]]:
    targets = [legacy_engine._account_label(a) for a in target_accounts if str(a or "").strip()]
    if not targets:
        return [], {}
    alias_to_target: Dict[str, str] = {acct: acct for acct in targets}
    normalized_existing = [legacy_engine._account_label(a) for a in existing_accounts if str(a or "").strip()]
    for acct in normalized_existing:
        mapped = _match_existing_account(acct, targets)
        if mapped in targets:
            alias_to_target[acct] = mapped
    expanded = sorted(alias_to_target.keys())
    return expanded, alias_to_target


def _load_position_metadata(
    accounts_to_read: List[str],
    alias_to_target: Dict[str, str],
) -> Dict[tuple[str, str, str], Dict[str, str]]:
    if not accounts_to_read:
        return {}

    def _run(conn):
        cur = conn.cursor()
        qmarks = ",".join(["?"] * len(accounts_to_read))
        cur.execute(
            f"""
            SELECT p.account, p.instrument_id, p.sector, p.owner, p.entry_date, i.symbol, i.asset_class
            FROM positions p
            LEFT JOIN instruments i ON i.id=p.instrument_id
            WHERE p.account IN ({qmarks})
            """,
            accounts_to_read,
        )
        return cur.fetchall()

    rows = with_conn(_run)
    out: Dict[tuple[str, str, str], Dict[str, str]] = {}
    for row in rows:
        if isinstance(row, dict):
            row_account = legacy_engine._account_label(row.get("account"))
            instrument_id = str(row.get("instrument_id") or "")
            symbol_raw = row.get("symbol")
            asset_class = str(row.get("asset_class") or "equity")
            sector_raw = row.get("sector")
            owner_raw = row.get("owner")
            entry_raw = row.get("entry_date")
        else:
            row_account = legacy_engine._account_label(row[0] if len(row) > 0 else "")
            instrument_id = str(row[1] if len(row) > 1 else "")
            sector_raw = row[2] if len(row) > 2 else ""
            owner_raw = row[3] if len(row) > 3 else ""
            entry_raw = row[4] if len(row) > 4 else ""
            symbol_raw = row[5] if len(row) > 5 else ""
            asset_class = str(row[6] if len(row) > 6 else "equity")

        canonical_account = alias_to_target.get(row_account, row_account)
        symbol = _normalize_symbol_token(str(symbol_raw or ""))
        if not symbol and instrument_id:
            symbol = _normalize_symbol_token(instrument_id.split(":", 1)[0])
        if not symbol:
            continue

        key = _position_meta_key(canonical_account, symbol, asset_class)
        slot = out.setdefault(key, {"sector": "", "owner": "", "entry_date": ""})

        sector = _normalize_sector_value(sector_raw)
        owner = str(owner_raw or "").strip()
        entry_date = legacy_engine.parse_iso_date(entry_raw) or ""

        if sector and not slot["sector"]:
            slot["sector"] = sector
        if owner and not slot["owner"]:
            slot["owner"] = owner
        if entry_date and not slot["entry_date"]:
            slot["entry_date"] = entry_date
    return out


_OPT_RE = re.compile(r"^([A-Z0-9/.\-]+)\s+(\d{2}/\d{2}/\d{4})\s+([0-9]+(?:\.\d+)?)\s+([CP])$", re.I)
_TXN_DATE_RE = re.compile(r"^\s*(\d{1,2}/\d{1,2}/\d{4})(?:\s+as\s+of\s+(\d{1,2}/\d{1,2}/\d{4}))?\s*$", re.I)


def _parse_option_symbol(raw: str) -> Optional[Dict[str, Any]]:
    if not raw:
        return None
    match = _OPT_RE.match(raw.strip().upper())
    if not match:
        return None
    underlying = match.group(1)
    expiry = match.group(2)
    strike = match.group(3)
    right = match.group(4)
    try:
        strike_val = float(strike)
    except Exception:
        return None
    osi = options_service.build_osi_symbol(underlying, expiry, right, strike_val)
    if not osi:
        return None
    option_type = "CALL" if right.upper() == "C" else "PUT"
    return {
        "symbol": osi,
        "underlying": underlying,
        "expiry": options_service._normalize_expiry(expiry),  # type: ignore[attr-defined]
        "strike": strike_val,
        "option_type": option_type,
    }


def _parse_txn_date(raw: str) -> Optional[str]:
    if not raw:
        return None
    text = str(raw).strip()
    match = _TXN_DATE_RE.match(text)
    if match:
        date_text = match.group(2) or match.group(1)
        try:
            return datetime.strptime(date_text, "%m/%d/%Y").date().isoformat()
        except Exception:
            return None
    parsed = legacy_engine.parse_iso_date(text)
    if parsed:
        return parsed
    if len(text) >= 10:
        parsed = legacy_engine.parse_iso_date(text[:10])
        if parsed:
            return parsed
    return None


def _normalize_sector_value(raw: Any) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""
    if text.upper() == "UNASSIGNED":
        return ""
    return text


def _sector_baseline_key(account: str, sector: str) -> str:
    acct = legacy_engine._account_label(account)
    sec = str(sector or "").strip()
    return f"sector_baseline::{acct}::{sec}"


def _sector_target_weight_key(account: str, sector: str) -> str:
    acct = legacy_engine._account_label(account)
    sec = str(sector or "").strip()
    return f"sector_target_weight::{acct}::{sec}"


def _load_symbol_sector_map_for_account(conn, account: str) -> Dict[str, str]:
    acct = legacy_engine._account_label(account)
    out: Dict[str, str] = {}
    cur = conn.cursor()

    # Positions schema may be either legacy(symbol column) or instrument-based(instrument_id + instruments table).
    try:
        cur.execute(
            """
            SELECT symbol, sector
            FROM positions
            WHERE account=?
              AND symbol IS NOT NULL
              AND TRIM(COALESCE(sector, '')) != ''
              AND UPPER(TRIM(sector)) != 'UNASSIGNED'
            """,
            (acct,),
        )
        rows = cur.fetchall() or []
    except Exception:
        cur.execute(
            """
            SELECT p.instrument_id, p.sector, i.symbol
            FROM positions p
            LEFT JOIN instruments i ON i.id=p.instrument_id
            WHERE p.account=?
              AND TRIM(COALESCE(p.sector, '')) != ''
              AND UPPER(TRIM(p.sector)) != 'UNASSIGNED'
            """,
            (acct,),
        )
        rows = cur.fetchall() or []

    for row in rows:
        if isinstance(row, dict):
            symbol_raw = row.get("symbol") or row.get("instrument_id") or ""
            sector_raw = row.get("sector")
        else:
            # legacy query returns (symbol, sector); fallback returns (instrument_id, sector, symbol)
            if len(row) >= 3:
                symbol_raw = row[2] or row[0] or ""
                sector_raw = row[1]
            else:
                symbol_raw = row[0] if len(row) > 0 else ""
                sector_raw = row[1] if len(row) > 1 else ""
        if ":" in str(symbol_raw):
            symbol_raw = str(symbol_raw).split(":", 1)[0]
        symbol = _normalize_symbol_token(symbol_raw or "")
        sector = _normalize_sector_value(sector_raw)
        if symbol and sector:
            out[symbol] = sector

    cur.execute(
        """
        SELECT symbol, sector
        FROM trades
        WHERE account=?
          AND symbol IS NOT NULL
          AND TRIM(COALESCE(sector, '')) != ''
          AND UPPER(TRIM(sector)) != 'UNASSIGNED'
        ORDER BY ts DESC
        """,
        (acct,),
    )
    for row in cur.fetchall() or []:
        symbol = _normalize_symbol_token((row.get("symbol") if isinstance(row, dict) else row[0]) or "")
        sector = _normalize_sector_value(row.get("sector") if isinstance(row, dict) else row[1])
        if symbol and sector and symbol not in out:
            out[symbol] = sector

    return out


def _extract_account_digits(raw: str) -> str:
    return "".join(re.findall(r"\d", str(raw or "")))


def _resolve_balance_history_account(
    filename: Optional[str],
    account_param: Optional[str],
    existing_accounts: List[str],
) -> Optional[str]:
    def _fallback_from_filename() -> Optional[str]:
        stem_local = re.sub(r"\.[A-Za-z0-9]+$", "", str(filename or ""))
        upper_local = stem_local.upper()
        masked_local = re.search(r"(.+?)_X{2,}(\d{3,6})", upper_local)
        if masked_local:
            raw_base = masked_local.group(1).strip(" _-")
            suffix = masked_local.group(2)
            base_words = re.sub(r"\s+", "_", raw_base.title()).strip("_")
            if base_words:
                return f"{base_words} ...{suffix}"
        return None

    explicit = legacy_engine._account_label(str(account_param or "").strip())
    if explicit and explicit != "ALL":
        return explicit
    if not existing_accounts:
        return _fallback_from_filename()

    stem = re.sub(r"\.[A-Za-z0-9]+$", "", str(filename or ""))
    upper = stem.upper()

    # Prefer explicit masked account suffixes like XXX013 / XXXX013.
    masked = re.search(r"X{2,}(\d{3,6})", upper)
    if masked:
        suffix = masked.group(1)
        for acct in existing_accounts:
            digits = _extract_account_digits(acct)
            if digits and digits.endswith(suffix):
                return acct
        # If no existing account matches the masked suffix, use a deterministic
        # account label derived from filename rather than collapsing to a single
        # existing account.
        fallback = _fallback_from_filename()
        if fallback:
            return fallback

    # Fallback fuzzy match on account name from filename.
    candidate = re.sub(r"\bbalances?\b.*$", "", stem, flags=re.I)
    candidate = _normalize_account_name(candidate.replace("_", " ").replace("-", " "))
    if candidate:
        matched = _match_existing_account(candidate, existing_accounts)
        if matched in existing_accounts:
            return matched

    fallback = _fallback_from_filename()
    if fallback:
        return fallback
    if len(existing_accounts) == 1:
        return existing_accounts[0]
    return None


def _parse_balance_history_rows(rows: List[List[str]]) -> List[Dict[str, Any]]:
    if not rows:
        return []
    header = [_normalize_account_key(str(cell or "")) for cell in rows[0]]
    if "date" not in header or "amount" not in header:
        return []
    date_idx = header.index("date")
    amount_idx = header.index("amount")
    parsed: Dict[str, float] = {}
    for row in rows[1:]:
        if len(row) <= max(date_idx, amount_idx):
            continue
        date_iso = _parse_txn_date(row[date_idx])
        amount = _parse_money_value(row[amount_idx])
        if not date_iso or amount is None:
            continue
        parsed[date_iso] = float(amount)
    if len(parsed) < 2:
        return []
    return [{"date": d, "amount": float(parsed[d])} for d in sorted(parsed.keys())]


def _action_cash_only(action_lower: str) -> bool:
    cash_keywords = [
        "dividend",
        "interest",
        "tax",
        "fee",
        "journal",
        "transfer",
        "cash",
        "withholding",
    ]
    return any(k in action_lower for k in cash_keywords)


def _action_to_side(action_lower: str, qty: float) -> Optional[str]:
    if not action_lower:
        return None
    if "expired" in action_lower:
        return "SELL" if qty >= 0 else "BUY"
    if "buy" in action_lower or "reinvest" in action_lower or "cover" in action_lower:
        return "BUY"
    if "sell" in action_lower or "short" in action_lower:
        return "SELL"
    return None


def _action_is_close(action_lower: str) -> bool:
    text = (action_lower or "").strip().lower()
    if not text:
        return False
    close_markers = (
        "to close",
        " buy to close",
        " sell to close",
        "btc",
        "stc",
        "cover",
        "expired",
        "assignment",
        "assigned",
        "called away",
        "exercise",
        "exercised",
    )
    return any(marker in text for marker in close_markers)


def _apply_qty_delta(side: str, current_qty: float, trade_qty: float) -> float:
    if side == "BUY":
        return float(current_qty) + float(trade_qty)
    return float(current_qty) - float(trade_qty)


def _cap_close_qty(side: str, current_qty: float, requested_qty: float) -> float:
    qty = abs(float(requested_qty or 0.0))
    if qty <= 0:
        return 0.0
    cur = float(current_qty or 0.0)
    if side == "SELL":
        return min(qty, max(cur, 0.0))
    return min(qty, max(-cur, 0.0))


def _parse_money_value(raw: Any) -> Optional[float]:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text or text in {"--", "-", "nan", "NaN"}:
        return None
    text = text.replace("$", "").replace(",", "")
    text = text.replace("(", "-").replace(")", "")
    try:
        return float(text)
    except Exception:
        return None


def _event_key_token(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        try:
            return f"{float(value):.8f}"
        except Exception:
            return "0.00000000"
    text = str(value).strip()
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).upper()


def _build_import_event_key(counters: Dict[str, int], *parts: Any) -> str:
    base = "|".join(_event_key_token(part) for part in parts)
    base_hash = hashlib.sha1(base.encode("utf-8")).hexdigest()
    seq = int(counters.get(base_hash, 0)) + 1
    counters[base_hash] = seq
    return hashlib.sha1(f"{base_hash}|{seq}".encode("utf-8")).hexdigest()


def _parse_realized_lot_details_rows(text: str, target_account: str) -> List[Dict[str, Any]]:
    target = legacy_engine._account_label(target_account)
    rows_out: List[Dict[str, Any]] = []
    reader = csv.reader(io.StringIO(text))
    header_map: Dict[str, int] = {}
    section_allowed = True

    def _idx(name: str) -> int:
        return header_map.get(name.lower(), -1)

    def _cell(row: List[str], name: str) -> str:
        i = _idx(name)
        if i < 0 or i >= len(row):
            return ""
        return (row[i] or "").strip()

    for raw_row in reader:
        row = [str(c or "").strip() for c in raw_row]
        nonempty = [c for c in row if c]
        if not nonempty:
            continue
        first = nonempty[0]
        lowered = first.lower()

        if lowered.startswith("realized gain/loss - lot details"):
            continue
        if lowered.startswith("there are no transactions"):
            header_map = {}
            section_allowed = False
            continue

        if len(nonempty) == 1 and lowered != "symbol":
            title = _normalize_account_name(first)
            if title:
                section_allowed = _match_existing_account(title, [target]) == target
                header_map = {}
            continue

        if lowered == "symbol":
            header_map = {name.strip().lower(): idx for idx, name in enumerate(row)}
            continue

        if not header_map or not section_allowed:
            continue

        symbol_raw = _normalize_symbol_token(_cell(row, "Symbol"))
        if not symbol_raw:
            continue
        opened = _parse_txn_date(_cell(row, "Opened Date"))
        closed = _parse_txn_date(_cell(row, "Closed Date"))
        qty_signed = float(_parse_money_value(_cell(row, "Quantity")) or 0.0)
        qty = abs(qty_signed)
        if not opened or not closed or qty <= 0:
            continue

        desc = _cell(row, "Name")
        cost_per_share = float(_parse_money_value(_cell(row, "Cost Per Share")) or 0.0)
        proceeds_per_share = float(_parse_money_value(_cell(row, "Proceeds Per Share")) or 0.0)
        gain_loss = float(
            _parse_money_value(
                _cell(row, "Gain/Loss ($)")
                or _cell(row, "Total Transaction Gain/Loss ($)")
                or _cell(row, "ST Transaction Gain/Loss ($)")
                or _cell(row, "LT Transaction Gain/Loss ($)")
            )
            or 0.0
        )
        parsed_option = _parse_option_symbol(symbol_raw) or _parse_option_symbol(desc)
        asset_class = "option" if parsed_option else "equity"
        symbol = parsed_option["symbol"] if parsed_option else symbol_raw
        mult = legacy_engine.contract_multiplier(symbol, asset_class)

        buy_amount = -(qty * cost_per_share * mult)
        sell_amount = qty * proceeds_per_share * mult

        if qty_signed < 0:
            rows_out.append(
                {
                    "Date": opened,
                    "Action": "SELL",
                    "Symbol": symbol,
                    "Description": desc,
                    "Quantity": qty,
                    "Price": proceeds_per_share,
                    "Amount": sell_amount,
                    "RealizedPL": 0.0,
                }
            )
            rows_out.append(
                {
                    "Date": closed,
                    "Action": "BUY",
                    "Symbol": symbol,
                    "Description": desc,
                    "Quantity": qty,
                    "Price": cost_per_share,
                    "Amount": buy_amount,
                    "RealizedPL": gain_loss,
                }
            )
        else:
            rows_out.append(
                {
                    "Date": opened,
                    "Action": "BUY",
                    "Symbol": symbol,
                    "Description": desc,
                    "Quantity": qty,
                    "Price": cost_per_share,
                    "Amount": buy_amount,
                    "RealizedPL": 0.0,
                }
            )
            rows_out.append(
                {
                    "Date": closed,
                    "Action": "SELL",
                    "Symbol": symbol,
                    "Description": desc,
                    "Quantity": qty,
                    "Price": proceeds_per_share,
                    "Amount": sell_amount,
                    "RealizedPL": gain_loss,
                }
            )

    return rows_out


def _parse_custaccs_positions(text: str) -> Dict[str, Any]:
    reader = csv.reader(io.StringIO(text))
    current_account = None
    header = []
    header_map: Dict[str, int] = {}
    positions: List[Dict[str, Any]] = []
    cash_by_account: Dict[str, float] = {}
    account_value_by_account: Dict[str, float] = {}
    asof_date: Optional[str] = None

    def _set_header(row):
        nonlocal header, header_map
        header = [col.strip() for col in row]
        header_map = {name: idx for idx, name in enumerate(header)}

    def _cell(row, name):
        idx = header_map.get(name, -1)
        if idx < 0 or idx >= len(row):
            return ""
        return row[idx]

    for row in reader:
        if not row or not any(cell.strip() for cell in row):
            continue
        header_cell = row[0].strip()
        if header_cell.startswith("Positions for"):
            # Supports:
            # "Positions for CUSTACCS as of 01:18 AM ET, 02/10/2026"
            # "Positions for account Limit Liability Company ...013 as of 02:18 AM ET, 2026/02/18"
            match = re.search(r"(\d{2}/\d{2}/\d{4})", header_cell)
            if match:
                try:
                    asof_date = datetime.strptime(match.group(1), "%m/%d/%Y").date().isoformat()
                except Exception:
                    asof_date = None
            else:
                match = re.search(r"(\d{4}/\d{2}/\d{2})", header_cell)
                if match:
                    try:
                        asof_date = datetime.strptime(match.group(1), "%Y/%m/%d").date().isoformat()
                    except Exception:
                        asof_date = None
            acct_match = re.search(r"Positions for account\s+(.+?)\s+as of", header_cell, re.I)
            if acct_match:
                name = _normalize_account_name(acct_match.group(1))
                key = _normalize_account_key(name)
                if key not in {"all accounts", "all-accounts"}:
                    current_account = name
                    header = []
                    header_map = {}
            continue
        if len(row) == 1 and row[0].strip() and row[0].strip().lower() not in {"account total"}:
            name = _normalize_account_name(row[0])
            key = _normalize_account_key(name)
            if key in {"all accounts", "all-accounts"}:
                continue
            current_account = name
            header = []
            header_map = {}
            continue
        if row[0].strip().lower() == "symbol":
            _set_header(row)
            continue
        if not header_map or not current_account:
            continue
        symbol = _normalize_symbol_token(row[0].strip())
        if not symbol:
            continue
        symbol_lower = symbol.lower()
        qty = _parse_float(_cell(row, "Qty (Quantity)"))
        security_type = _cell(row, "Security Type")
        security_type_lower = str(security_type or "").strip().lower()
        mkt_val = _parse_money(_cell(row, "Mkt Val (Market Value)"))
        if symbol_lower.startswith("account total"):
            total_val = mkt_val
            if total_val is not None:
                account_value_by_account[current_account] = float(total_val)
            continue
        # Schwab summary rows (e.g. "Futures Cash", "Cash & Cash Investments")
        # are not tradable positions; fold them into cash when present.
        if abs(qty) <= 1e-12 and (
            symbol_lower.startswith("cash")
            or symbol_lower.startswith("futures cash")
            or "cash investments" in symbol_lower
        ):
            if mkt_val is not None:
                cash_by_account[current_account] = float(cash_by_account.get(current_account, 0.0)) + float(mkt_val)
            continue
        # Skip non-position summary rows that can otherwise leak into holdings.
        if abs(qty) <= 1e-12:
            if mkt_val is not None and (
                "positions market value" in symbol_lower
                or "market value total" in symbol_lower
                or "account value" in symbol_lower
                or "total accounts value" in symbol_lower
            ):
                account_value_by_account.setdefault(current_account, float(mkt_val))
            continue
        price = _parse_float(_cell(row, "Price"))
        day_chg = _parse_money(_cell(row, "Day Chng $ (Day Change $)"))
        cost_basis = _parse_money(_cell(row, "Cost Basis"))
        gain = _parse_money(_cell(row, "Gain $ (Gain/Loss $)"))
        parsed_option = _parse_option_symbol(symbol) or _parse_option_symbol(_cell(row, "Description"))
        asset_class = "option" if parsed_option or "option" in security_type_lower else "equity"
        underlying = symbol
        expiry = None
        strike = None
        option_type = None
        multiplier = 100.0 if asset_class == "option" else 1.0
        if asset_class == "option":
            parsed = parsed_option or _parse_option_symbol(symbol) or _parse_option_symbol(_cell(row, "Description"))
            if parsed:
                symbol = parsed["symbol"]
                underlying = parsed["underlying"]
                expiry = parsed["expiry"]
                strike = parsed["strike"]
                option_type = parsed["option_type"]
        instrument_id = f"{symbol}:{'OPTION' if asset_class == 'option' else 'EQUITY'}"
        avg_cost = price
        if qty and cost_basis:
            try:
                avg_cost = cost_basis / (qty * multiplier)
            except Exception:
                avg_cost = price
        positions.append(
            {
                "account": current_account,
                "instrument_id": instrument_id,
                "symbol": symbol,
                "qty": qty,
                "price": price,
                "avg_cost": avg_cost,
                "asset_class": asset_class,
                "underlying": underlying,
                "expiry": expiry,
                "strike": strike,
                "option_type": option_type,
                "multiplier": multiplier,
                "market_value": mkt_val if mkt_val else qty * price * multiplier,
                "day_pnl": day_chg,
                "total_pnl": gain,
            }
        )

    return {
        "positions": positions,
        "cash": cash_by_account,
        "asof": asof_date,
        "account_values": account_value_by_account,
    }


def _create_import_trade(position_data: Dict[str, Any], import_timestamp: str, asof: Optional[str]) -> Optional[Dict[str, Any]]:
    qty = float(position_data.get("qty") or 0)
    if qty == 0:
        return None
    trade_date = asof or import_timestamp[:10]
    return {
        "trade_id": f"IMPORT_{position_data['account']}_{position_data['instrument_id']}_{import_timestamp.replace(':', '').replace('-', '')}",
        "ts": import_timestamp,
        "trade_date": trade_date,
        "account": position_data["account"],
        "instrument_id": position_data["instrument_id"],
        "symbol": position_data["symbol"],
        "side": "BUY" if qty > 0 else "SELL",
        "qty": abs(qty),
        "price": position_data.get("avg_cost") or position_data.get("price") or 0,
        "trade_type": "IMPORT",
        "status": "FILLED",
        "source": "CSV_IMPORT",
        "asset_class": position_data.get("asset_class"),
        "underlying": position_data.get("underlying"),
        "expiry": position_data.get("expiry"),
        "strike": position_data.get("strike"),
        "option_type": position_data.get("option_type"),
        "multiplier": position_data.get("multiplier"),
    }


def _get_account_record(account: str) -> Dict[str, Any]:
    def _run(conn):
        cur = conn.cursor()
        cur.execute("SELECT account, cash, asof, account_value FROM accounts WHERE account=?", (account,))
        row = cur.fetchone()
        if isinstance(row, dict):
            return row
        if not row:
            return {}
        return {"account": row[0], "cash": row[1], "asof": row[2], "account_value": row[3]}

    return with_conn(_run)


@router.post("/import-nav-text")
async def import_nav_text(payload: NavTextPayload):
    account = (payload.account or "").strip()
    if not account or account.upper() == "ALL":
        raise HTTPException(status_code=400, detail="Select a specific account (not ALL) for NAV import.")
    acct = legacy_engine._account_label(account)
    text = payload.text or ""
    lines = [ln.strip() for ln in text.splitlines()]
    if not any(lines):
        raise HTTPException(status_code=400, detail="No NAV lines provided.")

    bench_map: Dict[str, float] = {}
    try:
        bench_series = legacy_engine.get_bench_series()
        if bench_series is not None and len(bench_series):
            bench_map = {str(r["d"]): float(r["close"]) for _, r in bench_series.iterrows()}
    except Exception:
        bench_map = {}

    entries: Dict[str, float] = {}
    for line in lines:
        if not line or line.startswith("#"):
            continue
        date_match = re.search(r"(\d{4}-\d{2}-\d{2})", line)
        date_iso = None
        if date_match:
            date_iso = legacy_engine.parse_iso_date(date_match.group(1))
        if not date_iso:
            date_match = re.search(r"(\d{4}/\d{2}/\d{2})", line)
            if date_match:
                try:
                    date_iso = datetime.strptime(date_match.group(1), "%Y/%m/%d").date().isoformat()
                except Exception:
                    date_iso = None
        if not date_iso:
            date_match = re.search(r"(\d{2}/\d{2}/\d{4})", line)
            if date_match:
                try:
                    date_iso = datetime.strptime(date_match.group(1), "%m/%d/%Y").date().isoformat()
                except Exception:
                    date_iso = None
        if not date_iso:
            continue
        num_matches = re.findall(r"[-$]?[0-9][0-9,]*\.?[0-9]*", line)
        if not num_matches:
            continue
        nav_val = _parse_money_value(num_matches[-1])
        if nav_val is None:
            continue
        entries[date_iso] = float(nav_val)

    if not entries:
        raise HTTPException(status_code=400, detail="No valid NAV lines found.")

    if not payload.append:
        def _clear(conn):
            cur = conn.cursor()
            cur.execute("DELETE FROM nav_snapshots WHERE account=?", (acct,))
            conn.commit()
        with_conn(_clear)

    for date_iso, nav in sorted(entries.items()):
        bench_val = bench_map.get(date_iso) if bench_map else None
        legacy_engine.store_nav_snapshot(acct, date_iso, nav, bench=bench_val)

    latest_date = max(entries.keys())
    latest_nav = entries[latest_date]
    def _update_account(conn):
        cur = conn.cursor()
        cur.execute(
            (
                "INSERT OR REPLACE INTO accounts(account, cash, asof, account_value, anchor_mode) "
                "VALUES(?, COALESCE((SELECT cash FROM accounts WHERE account=?), 0), ?, ?, "
                "COALESCE((SELECT anchor_mode FROM accounts WHERE account=?), 'EOD'))"
            ),
            (acct, acct, latest_date, float(latest_nav), acct),
        )
        conn.commit()
    with_conn(_update_account)

    try:
        legacy_engine._clear_nav_cache()
    except Exception:
        pass

    return {"ok": True, "account": acct, "count": len(entries), "latest": latest_date}


@router.post("/import-benchmark-text")
async def import_benchmark_text(payload: BenchTextPayload):
    text = payload.text or ""
    lines = [ln.strip() for ln in text.splitlines()]
    if not any(lines):
        raise HTTPException(status_code=400, detail="No benchmark lines provided.")

    entries: Dict[str, float] = {}
    for line in lines:
        if not line or line.startswith("#"):
            continue
        date_match = re.search(r"(\d{4}-\d{2}-\d{2})", line)
        date_iso = None
        if date_match:
            date_iso = legacy_engine.parse_iso_date(date_match.group(1))
        if not date_iso:
            date_match = re.search(r"(\d{4}/\d{2}/\d{2})", line)
            if date_match:
                try:
                    date_iso = datetime.strptime(date_match.group(1), "%Y/%m/%d").date().isoformat()
                except Exception:
                    date_iso = None
        if not date_iso:
            date_match = re.search(r"(\d{2}/\d{2}/\d{4})", line)
            if date_match:
                try:
                    date_iso = datetime.strptime(date_match.group(1), "%m/%d/%Y").date().isoformat()
                except Exception:
                    date_iso = None
        if not date_iso:
            continue
        num_matches = re.findall(r"[-$]?[0-9][0-9,]*\.?[0-9]*", line)
        if not num_matches:
            continue
        close_val = _parse_money_value(num_matches[-1])
        if close_val is None:
            continue
        entries[date_iso] = float(close_val)

    if not entries:
        raise HTTPException(status_code=400, detail="No valid benchmark lines found.")

    if not payload.append:
        def _clear(conn):
            cur = conn.cursor()
            cur.execute("DELETE FROM price_cache WHERE symbol=?", ("^GSPC",))
            conn.commit()
        with_conn(_clear)

    def _insert(conn):
        cur = conn.cursor()
        for date_iso, close in sorted(entries.items()):
            cur.execute(
                "INSERT OR REPLACE INTO price_cache(symbol, date, close) VALUES(?,?,?)",
                ("^GSPC", date_iso, float(close)),
            )
        conn.commit()
    with_conn(_insert)

    try:
        legacy_engine._clear_nav_cache()
    except Exception:
        pass

    latest_date = max(entries.keys())
    return {"ok": True, "symbol": "^GSPC", "count": len(entries), "latest": latest_date}


def _build_nav_from_transactions_static(rows: List[Dict[str, Any]], account: str) -> Dict[str, Any]:
    acct = legacy_engine._account_label(account)
    acct_record = _get_account_record(acct)
    asof = legacy_engine.parse_iso_date(str(acct_record.get("asof") or "")) or legacy_engine.today_str()
    bench_start = legacy_engine._get_bench_start()

    positions = portfolio_service.get_positions(account=acct)
    pos_map: Dict[str, Dict[str, Any]] = {}
    for row in positions:
        sym = str(row.get("symbol") or "").strip().upper()
        if not sym:
            continue
        pos_map[sym] = row

    events_by_date: Dict[str, List[Dict[str, Any]]] = {}
    cash_by_date: Dict[str, float] = {}
    net_trade_qty: Dict[str, float] = {}
    trades_created = 0
    cash_flows = 0
    last_trade_price: Dict[str, float] = {}
    price_points: Dict[str, Dict[str, float]] = {}
    running_qty: Dict[str, float] = {}
    for row in rows:
        raw_date = row.get("Date") or row.get("date")
        trade_date = _parse_txn_date(raw_date)
        if not trade_date:
            continue
        if trade_date < bench_start or trade_date > asof:
            continue
        action = str(row.get("Action") or row.get("action") or "").strip()
        if not action:
            continue
        action_lower = action.lower()
        action_tag = re.sub(r"[^A-Z0-9]+", "_", action.upper()).strip("_") or "UNKNOWN"
        symbol_raw = _normalize_symbol_token(str(row.get("Symbol") or row.get("symbol") or "").strip().upper())
        description = str(row.get("Description") or row.get("description") or "").strip().upper()
        qty_val = _parse_money_value(row.get("Quantity") or row.get("quantity") or row.get("Qty") or row.get("qty"))
        qty = float(qty_val or 0.0)
        price_val = _parse_money_value(row.get("Price") or row.get("price"))
        amount_val = _parse_money_value(row.get("Amount") or row.get("amount"))

        if amount_val is not None and (_action_cash_only(action_lower) or qty == 0):
            cash_by_date[trade_date] = cash_by_date.get(trade_date, 0.0) + float(amount_val)
            cash_flows += 1
            continue

        side = _action_to_side(action_lower, qty)
        if side is None or qty == 0:
            if amount_val is not None:
                cash_by_date[trade_date] = cash_by_date.get(trade_date, 0.0) + float(amount_val)
                cash_flows += 1
            continue

        parsed_option = _parse_option_symbol(symbol_raw) or _parse_option_symbol(description)
        asset_class = "equity"
        underlying = symbol_raw
        expiry = None
        strike = None
        option_type = None
        if parsed_option:
            asset_class = "option"
            symbol_raw = parsed_option["symbol"]
            underlying = parsed_option["underlying"]
            expiry = parsed_option["expiry"]
            strike = parsed_option["strike"]
            option_type = parsed_option["option_type"]
        elif legacy_engine.is_option_symbol(symbol_raw):
            asset_class = "option"
            parsed_osi = options_service.parse_osi_symbol(symbol_raw)
            if parsed_osi:
                underlying, expiry, right, strike = parsed_osi
                option_type = "CALL" if str(right).upper().startswith("C") else "PUT"
        symbol_raw = symbol_raw.strip().upper()
        mult = legacy_engine.contract_multiplier(symbol_raw, asset_class)
        price = float(price_val or 0.0)
        current_qty = float(running_qty.get(symbol_raw, float(pos_map.get(symbol_raw, {}).get("qty") or 0.0)))
        requested_qty = abs(float(qty or 0.0))
        is_close = _action_is_close(action_lower)
        if requested_qty <= 0 and is_close:
            if abs(current_qty) <= 1e-12:
                continue
            requested_qty = abs(current_qty)
            if "expired" in action_lower:
                side = "SELL" if current_qty > 0 else "BUY"
        elif requested_qty <= 0:
            continue

        effective_qty = requested_qty
        if is_close:
            effective_qty = _cap_close_qty(side, current_qty, requested_qty)
            if effective_qty <= 1e-12:
                continue
        running_qty[symbol_raw] = _apply_qty_delta(side, current_qty, effective_qty)

        signed_qty = effective_qty if side == "BUY" else -effective_qty
        net_trade_qty[symbol_raw] = net_trade_qty.get(symbol_raw, 0.0) + signed_qty

        trades_created += 1

        cash_amount = amount_val
        if cash_amount is None:
            cash_amount = (-signed_qty * price * mult)
        cash_by_date[trade_date] = cash_by_date.get(trade_date, 0.0) + float(cash_amount)

        if asset_class == "option" and price:
            last_trade_price[symbol_raw] = float(price)
        if asset_class != "option" and price:
            price_points.setdefault(symbol_raw, {})[trade_date] = float(price)

        events_by_date.setdefault(trade_date, []).append(
            {
                "symbol": symbol_raw,
                "signed_qty": signed_qty,
                "price": price,
                "mult": mult,
                "asset_class": asset_class,
                "underlying": underlying,
                "expiry": expiry,
                "strike": strike,
                "option_type": option_type,
            }
        )

    # Build price history for equities/ETFs
    equity_syms = set()
    option_syms = set()
    for sym, row in pos_map.items():
        cls = str(row.get("asset_class") or "").lower()
        if cls == "option" or legacy_engine.is_option_symbol(sym):
            option_syms.add(sym)
        else:
            equity_syms.add(sym)
    for d, events in events_by_date.items():
        for ev in events:
            sym = ev["symbol"]
            if ev.get("asset_class") == "option" or legacy_engine.is_option_symbol(sym):
                option_syms.add(sym)
            else:
                equity_syms.add(sym)
            if ev.get("asset_class") != "option" and ev.get("price"):
                price_points.setdefault(sym, {})[d] = float(ev.get("price") or 0.0)

    option_expiry: Dict[str, str] = {}
    for sym in option_syms:
        exp = None
        row = pos_map.get(sym, {})
        if row.get("expiry"):
            exp = legacy_engine.parse_iso_date(str(row.get("expiry") or "")) or None
        if not exp:
            parsed = options_service.parse_osi_symbol(sym)
            if parsed:
                exp = parsed[1]
        if exp:
            option_expiry[sym] = exp

    bench_series = legacy_engine.get_bench_series()
    if bench_series is not None and len(bench_series):
        date_list = [str(d) for d in bench_series["d"].astype(str).tolist() if bench_start <= str(d) <= asof]
    else:
        date_list = legacy_engine._fallback_business_dates(bench_start, asof)
    if not date_list:
        date_list = [bench_start, asof]

    def _load_prices_from_cache(sym: str) -> Dict[str, float]:
        def _run(conn):
            cur = conn.cursor()
            cur.execute(
                "SELECT date, close FROM price_cache WHERE symbol=? AND date>=? AND date<=? ORDER BY date ASC",
                (sym, bench_start, asof),
            )
            return legacy_engine._fetch_rows(cur)
        rows = with_conn(_run)
        out: Dict[str, float] = {}
        for r in rows:
            d = str(r.get("date") or "")
            try:
                out[d] = float(r.get("close") or 0.0)
            except Exception:
                continue
        return out

    price_series: Dict[str, Dict[str, float]] = {}
    for sym in sorted(equity_syms):
        series = _load_prices_from_cache(sym)
        points = price_points.get(sym, {})
        if points:
            series.update(points)
        if not series:
            series = {}
        if asof not in series:
            try:
                series[asof] = float(pos_map.get(sym, {}).get("price") or 0.0)
            except Exception:
                pass
        price_series[sym] = series

    positions_qty: Dict[str, float] = {}
    mult_map: Dict[str, float] = {}
    for sym in equity_syms.union(option_syms):
        row = pos_map.get(sym, {})
        qty = float(row.get("qty") or 0.0)
        net_qty = net_trade_qty.get(sym, 0.0)
        initial_qty = qty - net_qty
        if abs(initial_qty) < 1e-9:
            initial_qty = 0.0
        if initial_qty != 0.0:
            positions_qty[sym] = initial_qty
        mult_map[sym] = float(row.get("multiplier") or legacy_engine.contract_multiplier(sym, row.get("asset_class")))

    cash_asof = acct_record.get("cash")
    if cash_asof is None or cash_asof == "":
        account_value = acct_record.get("account_value")
        net_mv_asof = 0.0
        for sym, row in pos_map.items():
            qty = float(row.get("qty") or 0.0)
            price = float(row.get("price") or 0.0)
            mult = float(row.get("multiplier") or legacy_engine.contract_multiplier(sym, row.get("asset_class")))
            net_mv_asof += qty * price * mult
        if account_value is not None:
            cash_asof = float(account_value) - float(net_mv_asof)
        else:
            cash_asof = 0.0
    cash_asof = float(cash_asof)

    net_cash_change = sum(cash_by_date.values()) if cash_by_date else 0.0
    cash = float(cash_asof) - float(net_cash_change)

    option_price: Dict[str, float] = {}
    for sym in option_syms:
        base = last_trade_price.get(sym)
        if base is None:
            base = float(pos_map.get(sym, {}).get("price") or 0.0)
        option_price[sym] = float(base or 0.0)

    nav_by_date: Dict[str, float] = {}
    for d in date_list:
        for event in events_by_date.get(d, []):
            sym = event["symbol"]
            positions_qty[sym] = positions_qty.get(sym, 0.0) + float(event["signed_qty"])
            mult_map.setdefault(sym, float(event.get("mult") or 1.0))
            if sym in option_syms and event.get("price") is not None:
                option_price[sym] = float(event.get("price") or option_price.get(sym, 0.0))
        if d in cash_by_date:
            cash += float(cash_by_date[d])
        if d == asof:
            for sym, row in pos_map.items():
                positions_qty[sym] = float(row.get("qty") or 0.0)
                mult_map[sym] = float(
                    row.get("multiplier") or legacy_engine.contract_multiplier(sym, row.get("asset_class"))
                )
                if sym in option_syms:
                    option_price[sym] = float(row.get("price") or option_price.get(sym, 0.0))
        nav = float(cash)
        for sym, qty in positions_qty.items():
            if abs(qty) < 1e-12:
                continue
            if sym in option_syms:
                exp = option_expiry.get(sym)
                if exp and d > exp:
                    price = 0.0
                else:
                    price = float(option_price.get(sym, 0.0))
            else:
                series = price_series.get(sym, {})
                price = None
                if series:
                    price = series.get(d)
                    if price is None:
                        # forward fill
                        prior_dates = [x for x in series.keys() if x <= d]
                        if prior_dates:
                            last_dt = max(prior_dates)
                            price = series.get(last_dt, 0.0)
                        else:
                            price = 0.0
                if price is None:
                    price = float(pos_map.get(sym, {}).get("price") or 0.0)
            nav += float(qty) * float(price) * float(mult_map.get(sym, 1.0))
        nav_by_date[d] = nav

    bench_map: Dict[str, float] = {}
    try:
        bench_series = legacy_engine.get_bench_series()
        if bench_series is not None and len(bench_series):
            bench_map = {str(r["d"]): float(r["close"]) for _, r in bench_series.iterrows()}
    except Exception:
        bench_map = {}
    last_bench = None
    first_bench = None
    if bench_map:
        first_bench = bench_map[min(bench_map.keys())]

    def _clear_nav(conn):
        cur = conn.cursor()
        cur.execute("DELETE FROM nav_snapshots WHERE account=?", (acct,))
        conn.commit()
    with_conn(_clear_nav)
    for d in sorted(nav_by_date.keys()):
        nav = nav_by_date[d]
        bench_val = None
        if bench_map:
            if d in bench_map:
                last_bench = bench_map[d]
            if last_bench is None and first_bench is not None:
                last_bench = first_bench
            bench_val = last_bench
        legacy_engine.store_nav_snapshot(acct, d, nav, bench=bench_val)

    return {
        "ok": True,
        "account": acct,
        "asof": asof,
        "bench_start": bench_start,
        "trades_created": trades_created,
        "cash_flows": cash_flows,
        "snapshots": len(nav_by_date),
    }


def _store_transactions_static(
    rows: List[Dict[str, Any]],
    account: str,
    import_source: str,
    replace: bool,
) -> Dict[str, Any]:
    acct = legacy_engine._account_label(account)
    now_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    acct_hash = hashlib.sha1(acct.encode("utf-8")).hexdigest()[:10]

    if replace:
        def _clear(conn):
            cur = conn.cursor()
            cur.execute("DELETE FROM trades WHERE account=?", (acct,))
            cur.execute("DELETE FROM cash_flows WHERE account=?", (acct,))
            cur.execute("DELETE FROM import_event_keys WHERE account=?", (acct,))
            conn.commit()

        with_conn(_clear)

    def _load_event_keys(conn):
        cur = conn.cursor()
        cur.execute("SELECT kind, event_key FROM import_event_keys WHERE account=?", (acct,))
        out = set()
        for row in cur.fetchall() or []:
            kind = row.get("kind") if isinstance(row, dict) else row[0]
            key = row.get("event_key") if isinstance(row, dict) else row[1]
            out.add((str(kind or ""), str(key or "")))
        return out

    if not replace:
        existing_event_keys = with_conn(_load_event_keys)
    else:
        existing_event_keys = set()
    symbol_sector_map = with_conn(lambda conn: _load_symbol_sector_map_for_account(conn, acct))

    event_counters: Dict[str, int] = {}
    cash_rows: List[Dict[str, Any]] = []
    trade_rows: List[Dict[str, Any]] = []
    realized_updates: List[tuple[str, float]] = []
    inserted_event_keys: List[tuple[str, str]] = []
    skipped_duplicate_rows = 0

    for idx, row in enumerate(rows):
        raw_date = row.get("Date") or row.get("date")
        trade_date = _parse_txn_date(raw_date)
        if not trade_date:
            continue

        action = str(row.get("Action") or row.get("action") or "").strip()
        action_lower = action.lower()
        action_tag = re.sub(r"[^A-Z0-9]+", "_", action.upper()).strip("_") or "UNKNOWN"
        symbol_raw = _normalize_symbol_token(str(row.get("Symbol") or row.get("symbol") or "").strip().upper())
        description = str(row.get("Description") or row.get("description") or "").strip().upper()
        qty_val = _parse_money_value(row.get("Quantity") or row.get("quantity") or row.get("Qty") or row.get("qty"))
        qty = float(qty_val or 0.0)
        price_val = _parse_money_value(row.get("Price") or row.get("price"))
        amount_val = _parse_money_value(row.get("Amount") or row.get("amount"))

        cash_event_key = _build_import_event_key(
            event_counters,
            acct,
            "CASH",
            trade_date,
            action_lower,
            symbol_raw,
            amount_val,
            qty,
            price_val,
            description,
            idx,
        )
        if amount_val is not None and (_action_cash_only(action_lower) or (qty == 0 and not _action_is_close(action_lower))):
            if not replace and ("CASH_FLOW", cash_event_key) in existing_event_keys:
                skipped_duplicate_rows += 1
                continue
            cash_rows.append(
                {
                    "account": acct,
                    "date": trade_date,
                    "amount": float(amount_val),
                    "note": f"CASH_FLOW|{action_tag}|{symbol_raw or ''}".strip(),
                    "event_key": cash_event_key,
                }
            )
            inserted_event_keys.append(("CASH_FLOW", cash_event_key))
            continue

        side = _action_to_side(action_lower, qty)
        if side is None:
            if amount_val is not None:
                if not replace and ("CASH_FLOW", cash_event_key) in existing_event_keys:
                    skipped_duplicate_rows += 1
                    continue
                cash_rows.append(
                    {
                        "account": acct,
                        "date": trade_date,
                        "amount": float(amount_val),
                        "note": f"CASH_FLOW|{action_tag}|{symbol_raw or ''}".strip(),
                        "event_key": cash_event_key,
                    }
                )
                inserted_event_keys.append(("CASH_FLOW", cash_event_key))
            continue

        parsed_option = _parse_option_symbol(symbol_raw) or _parse_option_symbol(description)
        asset_class = "equity"
        underlying = symbol_raw
        expiry = None
        strike = None
        option_type = None
        if parsed_option:
            asset_class = "option"
            symbol_raw = parsed_option["symbol"]
            underlying = parsed_option["underlying"]
            expiry = parsed_option["expiry"]
            strike = parsed_option["strike"]
            option_type = parsed_option["option_type"]

        qty_abs = abs(float(qty or 0.0))
        if qty_abs <= 1e-12:
            continue

        mult = float(legacy_engine.contract_multiplier(symbol_raw, asset_class) or 1.0)
        price = float(price_val or 0.0)
        if price <= 0 and amount_val is not None and qty_abs > 0 and mult > 0:
            try:
                price = abs(float(amount_val)) / (qty_abs * mult)
            except Exception:
                price = 0.0

        trade_event_key = _build_import_event_key(
            event_counters,
            acct,
            "TRADE",
            trade_date,
            action_lower,
            symbol_raw,
            qty_abs,
            price,
            amount_val,
            description,
            idx,
        )
        realized_hint = _parse_money_value(
            row.get("RealizedPL")
            or row.get("realized_pl")
            or row.get("Gain/Loss ($)")
            or row.get("Total Transaction Gain/Loss ($)")
        )
        if not replace and ("TRADE", trade_event_key) in existing_event_keys:
            if import_source == "CSV_REALIZED":
                existing_trade_id = f"CSV_STATIC_{acct_hash}_{trade_event_key[:24]}"
                realized_updates.append((existing_trade_id, float(realized_hint or 0.0)))
            skipped_duplicate_rows += 1
            continue

        inferred_cash = (qty_abs * price * mult) if side == "SELL" else (-qty_abs * price * mult)
        cash_flow = float(amount_val) if amount_val is not None else float(inferred_cash)
        explicit_sector = _normalize_sector_value(
            row.get("Sector")
            or row.get("sector")
            or row.get("Industry")
            or row.get("industry")
        )
        mapped_sector = symbol_sector_map.get(symbol_raw, "")
        assigned_sector = explicit_sector or mapped_sector or "Unassigned"
        trade_rows.append(
            {
                "trade_id": f"CSV_STATIC_{acct_hash}_{trade_event_key[:24]}",
                "ts": now_ts,
                "trade_date": trade_date,
                "account": acct,
                "instrument_id": f"{symbol_raw}:{asset_class.upper()}",
                "symbol": symbol_raw,
                "side": side,
                "qty": qty_abs,
                "price": float(price),
                "trade_type": asset_class.upper(),
                "status": "FILLED",
                "source": import_source,
                "asset_class": asset_class,
                "underlying": underlying,
                "expiry": expiry,
                "strike": strike,
                "option_type": option_type,
                "multiplier": mult,
                "strategy_id": None,
                "strategy_name": None,
                "sector": assigned_sector,
                "realized_pl": float(realized_hint or 0.0),
                "cost_basis": None,
                "cash_flow": cash_flow,
                "event_key": trade_event_key,
            }
        )
        inserted_event_keys.append(("TRADE", trade_event_key))

    if cash_rows:
        def _insert_cash(conn):
            cur = conn.cursor()
            cur.executemany(
                "INSERT INTO cash_flows(account, date, amount, note) VALUES(?,?,?,?)",
                [(r["account"], r["date"], float(r["amount"]), r.get("note")) for r in cash_rows],
            )
            conn.commit()

        with_conn(_insert_cash)

    if trade_rows:
        def _insert_trades(conn):
            cur = conn.cursor()
            cur.executemany(
                """
                INSERT INTO trades(
                    trade_id, ts, trade_date, account, instrument_id, symbol, side, qty, price, trade_type, status, source,
                    asset_class, underlying, expiry, strike, option_type, multiplier, strategy_id, strategy_name, sector,
                    realized_pl, cost_basis, cash_flow
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                [
                    (
                        t.get("trade_id"),
                        t.get("ts"),
                        t.get("trade_date"),
                        t.get("account"),
                        t.get("instrument_id"),
                        t.get("symbol"),
                        t.get("side"),
                        t.get("qty"),
                        t.get("price"),
                        t.get("trade_type"),
                        t.get("status"),
                        t.get("source"),
                        t.get("asset_class"),
                        t.get("underlying"),
                        t.get("expiry"),
                        t.get("strike"),
                        t.get("option_type"),
                        t.get("multiplier"),
                        t.get("strategy_id"),
                        t.get("strategy_name"),
                        t.get("sector"),
                        t.get("realized_pl"),
                        t.get("cost_basis"),
                        t.get("cash_flow"),
                    )
                    for t in trade_rows
                ],
            )
            conn.commit()

        with_conn(_insert_trades)

    if realized_updates:
        def _update_realized(conn):
            cur = conn.cursor()
            cur.executemany(
                "UPDATE trades SET realized_pl=? WHERE trade_id=?",
                [(float(realized), trade_id) for trade_id, realized in realized_updates if trade_id],
            )
            conn.commit()

        with_conn(_update_realized)

    if inserted_event_keys:
        unique_keys = {(kind, key) for kind, key in inserted_event_keys if key}
        if unique_keys:
            now_iso = datetime.now().isoformat()

            def _insert_event_keys(conn):
                cur = conn.cursor()
                cur.executemany(
                    "INSERT OR IGNORE INTO import_event_keys(account, kind, event_key, ts) VALUES(?,?,?,?)",
                    [(acct, kind, key, now_iso) for kind, key in unique_keys],
                )
                conn.commit()

            with_conn(_insert_event_keys)

    return {
        "ok": True,
        "account": acct,
        "source": import_source,
        "trades_created": len(trade_rows),
        "cash_flows": len(cash_rows),
        "duplicates_skipped": skipped_duplicate_rows,
        "snapshots_preserved": True,
    }


@router.post("/import-positions")
async def import_positions(file: UploadFile = File(...), account: Optional[str] = None):
    account_raw = str(account or "").strip()
    import_all_accounts = (not account_raw) or (account_raw.upper() == "ALL")
    selected_account = None if import_all_accounts else legacy_engine._account_label(account_raw)
    logger.info(
        "import-positions start file=%r account_param=%r mode=%s",
        file.filename,
        account_raw,
        "ALL" if import_all_accounts else f"specific:{selected_account}",
    )

    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    parsed = _parse_custaccs_positions(text)
    positions = parsed["positions"]
    cash_map = parsed["cash"]
    account_values = parsed.get("account_values", {})
    asof = parsed.get("asof")
    def _load_existing_accounts():
        def _run(conn):
            cur = conn.cursor()
            cur.execute("SELECT account FROM accounts WHERE account != 'ALL'")
            results = cur.fetchall()
            return [r.get("account") if isinstance(r, dict) else r[0] for r in results]
        return with_conn(_run)
    existing_accounts = _load_existing_accounts()
    candidate_accounts = list(existing_accounts)
    if selected_account and selected_account not in candidate_accounts:
        candidate_accounts.append(selected_account)
    if candidate_accounts:
        for row in positions:
            try:
                row["account"] = _match_existing_account(str(row.get("account") or ""), candidate_accounts)
            except Exception:
                pass
        remapped_cash: Dict[str, float] = {}
        for acct, val in cash_map.items():
            mapped = _match_existing_account(str(acct or ""), candidate_accounts)
            try:
                remapped_cash[mapped] = float(remapped_cash.get(mapped, 0.0)) + float(val or 0.0)
            except Exception:
                remapped_cash[mapped] = remapped_cash.get(mapped, 0.0)
        cash_map = remapped_cash
        remapped_values: Dict[str, float] = {}
        for acct, val in account_values.items():
            mapped = _match_existing_account(str(acct or ""), candidate_accounts)
            try:
                remapped_values[mapped] = float(remapped_values.get(mapped, 0.0)) + float(val or 0.0)
            except Exception:
                remapped_values[mapped] = remapped_values.get(mapped, 0.0)
        account_values = remapped_values
    if selected_account:
        label = selected_account
        positions = [row for row in positions if legacy_engine._account_label(row.get("account")) == label]
        cash_map = {k: v for k, v in cash_map.items() if legacy_engine._account_label(k) == label}
        account_values = {k: v for k, v in account_values.items() if legacy_engine._account_label(k) == label}
    if not positions and not cash_map:
        if selected_account:
            raise HTTPException(status_code=400, detail=f"No positions found for account {selected_account}.")
        raise HTTPException(status_code=400, detail="No positions found in CSV.")

    normalized_cash_map: Dict[str, float] = {}
    for acct, val in cash_map.items():
        label = legacy_engine._account_label(acct)
        if not label or label == "ALL":
            continue
        try:
            normalized_cash_map[label] = float(normalized_cash_map.get(label, 0.0)) + float(val or 0.0)
        except Exception:
            normalized_cash_map[label] = normalized_cash_map.get(label, 0.0)
    cash_map = normalized_cash_map

    normalized_account_values: Dict[str, float] = {}
    for acct, val in account_values.items():
        label = legacy_engine._account_label(acct)
        if not label or label == "ALL":
            continue
        try:
            normalized_account_values[label] = float(normalized_account_values.get(label, 0.0)) + float(val or 0.0)
        except Exception:
            normalized_account_values[label] = normalized_account_values.get(label, 0.0)
    account_values = normalized_account_values

    if selected_account:
        accounts = [selected_account]
    else:
        accounts = sorted(
            {
                legacy_engine._account_label(row.get("account"))
                for row in positions
                if legacy_engine._account_label(row.get("account")) != "ALL"
            }
            | set(cash_map.keys())
            | set(account_values.keys())
        )
    clear_accounts, _alias_map = _expand_account_aliases(accounts, existing_accounts)
    preserved_meta = _load_position_metadata(clear_accounts, _alias_map)

    deduped_positions: Dict[tuple[str, str], Dict[str, Any]] = {}
    for row in positions:
        acct = legacy_engine._account_label(row.get("account"))
        if not acct or acct == "ALL":
            continue
        row["account"] = acct
        symbol = _normalize_symbol_token(str(row.get("symbol") or ""))
        asset_class = str(row.get("asset_class") or "equity").strip().lower() or "equity"
        meta = preserved_meta.get(_position_meta_key(acct, symbol, asset_class))
        if meta:
            if not _normalize_sector_value(row.get("sector")) and meta.get("sector"):
                row["sector"] = meta["sector"]
            if not str(row.get("owner") or "").strip() and meta.get("owner"):
                row["owner"] = meta["owner"]
            if not legacy_engine.parse_iso_date(row.get("entry_date")) and meta.get("entry_date"):
                row["entry_date"] = meta["entry_date"]
        deduped_positions[(acct, str(row.get("instrument_id") or ""))] = row
    positions = list(deduped_positions.values())

    if selected_account:
        accounts = [selected_account]
    else:
        accounts = sorted({row["account"] for row in positions} | set(cash_map.keys()) | set(account_values.keys()))
    clear_accounts, alias_to_target = _expand_account_aliases(accounts, existing_accounts)
    import_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    accounts_with_real_trades: set[str] = set()
    accounts_with_balance_history: set[str] = set()
    if clear_accounts:
        def _inspect_accounts(conn):
            cur = conn.cursor()
            for acct in clear_accounts:
                cur.execute(
                    "SELECT 1 FROM trades WHERE account=? AND NOT (trade_type='IMPORT' OR source='CSV_IMPORT') LIMIT 1",
                    (acct,),
                )
                if cur.fetchone():
                    accounts_with_real_trades.add(acct)
                cur.execute(
                    """
                    SELECT 1
                    FROM cash_flows
                    WHERE account=?
                      AND note LIKE 'BALANCE_ADJ_HISTORY%'
                    LIMIT 1
                    """,
                    (acct,),
                )
                if cur.fetchone():
                    accounts_with_balance_history.add(acct)
        with_conn(_inspect_accounts)

        portfolio_service.clear_positions_for_accounts(clear_accounts)
        for acct in clear_accounts:
            preserve_balance_history = (not settings.static_mode) and (acct in accounts_with_balance_history)
            if not preserve_balance_history:
                # Clear stale NAV only when we are not preserving imported balance-history calibration.
                try:
                    portfolio_service.clear_nav_history(account=acct)
                except Exception:
                    pass
            if settings.static_mode or acct not in accounts_with_real_trades:
                try:
                    if preserve_balance_history:
                        def _clear_import_trades(conn):
                            cur = conn.cursor()
                            cur.execute(
                                """
                                DELETE FROM trades
                                WHERE account=?
                                  AND (COALESCE(UPPER(trade_type), '')='IMPORT'
                                       OR COALESCE(UPPER(source), '')='CSV_IMPORT')
                                """,
                                (acct,),
                            )
                            conn.commit()
                        with_conn(_clear_import_trades)
                    else:
                        portfolio_service.clear_trades_for_account(account=acct)
                except Exception:
                    pass
                if not preserve_balance_history:
                    try:
                        def _clear_cash(conn):
                            cur = conn.cursor()
                            cur.execute("DELETE FROM cash_flows WHERE account=?", (acct,))
                            conn.commit()
                        with_conn(_clear_cash)
                    except Exception:
                        pass
    trades_created = 0
    for row in positions:
        portfolio_service.upsert_position(row)
        acct = legacy_engine._account_label(row.get("account"))
        if settings.static_mode or acct in accounts_with_real_trades:
            continue
        trade = _create_import_trade(row, import_timestamp, asof)
        if trade:
            portfolio_service.record_trade(trade)
            trades_created += 1
    for account, cash in cash_map.items():
        acct = legacy_engine._account_label(account)
        if (not settings.static_mode) and acct in accounts_with_real_trades:
            continue
        portfolio_service.set_account_cash(account, cash, asof=asof, account_value=account_values.get(acct))
    for account, value in account_values.items():
        acct = legacy_engine._account_label(account)
        if acct in cash_map:
            continue
        portfolio_service.set_account_cash(account, legacy_engine.compute_cash_balance_total(acct), asof=asof, account_value=value)
    if asof and accounts:
        # Avoid network-bound benchmark fetches during import; read cache only.
        bench_val = None
        try:
            bench_symbol = legacy_engine.normalize_benchmark_symbol(legacy_engine._get_benchmark())
            candidates = [bench_symbol]
            for alias in ("^GSPC", "^SPX", "SPX", "$SPX", "SPY"):
                if alias not in candidates:
                    candidates.append(alias)

            def _load_bench(conn):
                cur = conn.cursor()
                for sym in candidates:
                    cur.execute(
                        "SELECT close FROM price_cache WHERE symbol=? AND date<=? ORDER BY date DESC LIMIT 1",
                        (sym, asof),
                    )
                    row = cur.fetchone()
                    if row:
                        val = row.get("close") if isinstance(row, dict) else row[0]
                        try:
                            num = float(val)
                            if num > 0:
                                return num
                        except Exception:
                            continue
                return None

            bench_val = with_conn(_load_bench)
        except Exception:
            bench_val = None
        nav_by_account: Dict[str, float] = {acct: float(account_values.get(acct) or 0.0) for acct in accounts}
        for row in positions:
            acct = row.get("account")
            if not acct or account_values.get(acct) is not None:
                continue
            nav_by_account[acct] = float(nav_by_account.get(acct, 0.0)) + float(row.get("market_value") or 0.0)
        for acct, nav in nav_by_account.items():
            if nav > 0:
                portfolio_service.store_nav_snapshot(acct, asof, nav, bench=bench_val)
    try:
        legacy_engine._clear_nav_cache()
    except Exception:
        pass
    logger.info(
        "import-positions done file=%r mode=%s accounts=%s positions=%d trades=%d",
        file.filename,
        "ALL" if import_all_accounts else f"specific:{selected_account}",
        accounts,
        len(positions),
        trades_created,
    )
    return {
        "ok": True,
        "accounts": accounts,
        "positions_count": len(positions),
        "count": len(positions),
        "trades_created": trades_created,
    }


@router.post("/import-transactions")
async def import_transactions(
    file: UploadFile = File(...),
    account: Optional[str] = None,
    replace: bool = True,
    allow_overlap: bool = False,
):
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    if not account or str(account).strip().upper() == "ALL":
        raise HTTPException(status_code=400, detail="Select a specific account (not ALL) for transaction import.")
    acct = legacy_engine._account_label(account)
    is_realized_import = "Realized Gain/Loss - Lot Details" in text[:4000]
    import_source = "CSV_REALIZED" if is_realized_import else "CSV_TRANSACTION"
    if is_realized_import:
        rows = _parse_realized_lot_details_rows(text, acct)
    else:
        reader = csv.DictReader(io.StringIO(text))
        rows = [row for row in reader if row and any(cell.strip() for cell in row.values() if isinstance(cell, str))]
    if not rows:
        raise HTTPException(status_code=400, detail="No transactions found in CSV.")

    current_cash_total = float(legacy_engine.compute_cash_balance_total(acct) or 0.0)
    existing_account = _get_account_record(acct)
    existing_anchor_cash = _parse_money_value(existing_account.get("cash")) if existing_account else None
    existing_anchor_asof = legacy_engine.parse_iso_date(existing_account.get("asof")) if existing_account else None

    if settings.static_mode:
        result = _store_transactions_static(rows, acct, import_source=import_source, replace=replace)
        try:
            legacy_engine._clear_nav_cache()
        except Exception:
            pass
        return result

    if is_realized_import and not replace and not allow_overlap:
        def _has_non_import_trades(conn):
            cur = conn.cursor()
            cur.execute(
                """
                SELECT 1
                FROM trades
                WHERE account=?
                  AND COALESCE(UPPER(trade_type), '') != 'IMPORT'
                  AND COALESCE(UPPER(source), '') != 'CSV_IMPORT'
                LIMIT 1
                """,
                (acct,),
            )
            return cur.fetchone() is not None

        if with_conn(_has_non_import_trades):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Realized lot CSV overlaps existing transaction history for this account. "
                    "Use replace=true or pass allow_overlap=true only if you intentionally want double-count behavior."
                ),
            )

    if replace:
        def _clear(conn):
            cur = conn.cursor()
            cur.execute("DELETE FROM positions WHERE account=?", (acct,))
            cur.execute("DELETE FROM trades WHERE account=?", (acct,))
            cur.execute("DELETE FROM cash_flows WHERE account=?", (acct,))
            cur.execute("DELETE FROM nav_snapshots WHERE account=?", (acct,))
            cur.execute("DELETE FROM import_event_keys WHERE account=?", (acct,))
            conn.commit()

        with_conn(_clear)

    def _load_live_qty(conn):
        cur = conn.cursor()
        cur.execute("SELECT instrument_id, qty FROM positions WHERE account=?", (acct,))
        out: Dict[str, float] = {}
        for row in cur.fetchall() or []:
            instrument_id = row.get("instrument_id") if isinstance(row, dict) else row[0]
            qty_val = row.get("qty") if isinstance(row, dict) else row[1]
            if not instrument_id:
                continue
            try:
                out[str(instrument_id)] = float(qty_val or 0.0)
            except Exception:
                out[str(instrument_id)] = 0.0
        return out

    def _load_event_keys(conn):
        cur = conn.cursor()
        cur.execute("SELECT kind, event_key FROM import_event_keys WHERE account=?", (acct,))
        return {(str((r.get("kind") if isinstance(r, dict) else r[0]) or ""), str((r.get("event_key") if isinstance(r, dict) else r[1]) or "")) for r in (cur.fetchall() or [])}

    live_qty: Dict[str, float] = with_conn(_load_live_qty) if not replace else {}
    existing_event_keys = with_conn(_load_event_keys) if not replace else set()
    symbol_sector_map = with_conn(lambda conn: _load_symbol_sector_map_for_account(conn, acct))
    acct_hash = hashlib.sha1(acct.encode("utf-8")).hexdigest()[:10]
    realized_updates_existing: List[tuple[str, float]] = []

    trades: List[Dict[str, Any]] = []
    cash_flows: List[Dict[str, Any]] = []
    earliest_date: Optional[str] = None
    parsed_rows: List[Dict[str, Any]] = []
    event_counters: Dict[str, int] = {}
    skipped_duplicate_rows = 0

    for idx, row in enumerate(rows):
        raw_date = row.get("Date") or row.get("date")
        trade_date = _parse_txn_date(raw_date)
        if not trade_date:
            continue
        if earliest_date is None or trade_date < earliest_date:
            earliest_date = trade_date

        action = str(row.get("Action") or row.get("action") or "").strip()
        if not action:
            continue
        action_lower = action.lower()
        action_tag = re.sub(r"[^A-Z0-9]+", "_", action.upper()).strip("_") or "UNKNOWN"
        symbol_raw = _normalize_symbol_token(str(row.get("Symbol") or row.get("symbol") or "").strip().upper())
        description = str(row.get("Description") or row.get("description") or "").strip().upper()
        qty_val = _parse_money_value(row.get("Quantity") or row.get("quantity") or row.get("Qty") or row.get("qty"))
        qty = float(qty_val or 0.0)
        price_val = _parse_money_value(row.get("Price") or row.get("price"))
        amount_val = _parse_money_value(row.get("Amount") or row.get("amount"))

        cash_event_key = _build_import_event_key(
            event_counters,
            acct,
            "CASH",
            trade_date,
            action_lower,
            symbol_raw,
            amount_val,
            qty,
            price_val,
            description,
        )
        if amount_val is not None and (_action_cash_only(action_lower) or (qty == 0 and not _action_is_close(action_lower))):
            if not replace and ("CASH_FLOW", cash_event_key) in existing_event_keys:
                skipped_duplicate_rows += 1
                continue
            cash_flows.append(
                {
                    "account": acct,
                    "date": trade_date,
                    "amount": float(amount_val),
                    "note": f"CASH_FLOW|{action_tag}|{symbol_raw or ''}".strip(),
                    "event_key": cash_event_key,
                }
            )
            continue

        side = _action_to_side(action_lower, qty)
        if side is None:
            if amount_val is not None:
                if not replace and ("CASH_FLOW", cash_event_key) in existing_event_keys:
                    skipped_duplicate_rows += 1
                    continue
                cash_flows.append(
                        {
                            "account": acct,
                            "date": trade_date,
                            "amount": float(amount_val),
                            "note": f"CASH_FLOW|{action_tag}|{symbol_raw or ''}".strip(),
                            "event_key": cash_event_key,
                        }
                    )
            continue

        parsed_option = _parse_option_symbol(symbol_raw) or _parse_option_symbol(description)
        asset_class = "equity"
        underlying = symbol_raw
        expiry = None
        strike = None
        option_type = None
        if parsed_option:
            asset_class = "option"
            symbol_raw = parsed_option["symbol"]
            underlying = parsed_option["underlying"]
            expiry = parsed_option["expiry"]
            strike = parsed_option["strike"]
            option_type = parsed_option["option_type"]
        elif legacy_engine.is_option_symbol(symbol_raw):
            asset_class = "option"
            parsed_osi = options_service.parse_osi_symbol(symbol_raw)
            if parsed_osi:
                underlying, expiry, right, strike = parsed_osi
                option_type = "CALL" if str(right).upper().startswith("C") else "PUT"

        price = float(price_val or 0.0)
        if price == 0.0 and amount_val is not None and qty:
            mult = legacy_engine.contract_multiplier(symbol_raw, asset_class)
            try:
                price = abs(float(amount_val)) / (abs(float(qty)) * float(mult))
            except Exception:
                price = 0.0

        trade_event_key = _build_import_event_key(
            event_counters,
            acct,
            "TRADE",
            trade_date,
            action_lower,
            symbol_raw,
            qty,
            price,
            amount_val,
            description,
        )
        realized_hint = _parse_money_value(
            row.get("RealizedPL")
            or row.get("realized_pl")
            or row.get("Gain/Loss ($)")
            or row.get("Total Transaction Gain/Loss ($)")
        )
        if not replace and ("TRADE", trade_event_key) in existing_event_keys:
            if import_source == "CSV_REALIZED":
                existing_trade_id = f"CSV_{acct_hash}_{trade_event_key[:24]}"
                realized_updates_existing.append((existing_trade_id, float(realized_hint or 0.0)))
            skipped_duplicate_rows += 1
            continue

        parsed_rows.append(
            {
                "row_index": idx,
                "trade_date": trade_date,
                "action_lower": action_lower,
                "is_close": _action_is_close(action_lower),
                "symbol": symbol_raw,
                "instrument_id": f"{symbol_raw}:{asset_class.upper()}",
                "side": side,
                "qty": abs(float(qty or 0.0)),
                "price": price,
                "amount": amount_val,
                "asset_class": asset_class,
                "underlying": underlying,
                "expiry": expiry,
                "strike": strike,
                "option_type": option_type,
                "sector": _normalize_sector_value(
                    row.get("Sector")
                    or row.get("sector")
                    or row.get("Industry")
                    or row.get("industry")
                ),
                "realized_pl_hint": realized_hint,
                "event_key": trade_event_key,
            }
        )

    parsed_rows.sort(key=lambda r: (r.get("trade_date") or "", int(r.get("row_index") or 0)))

    anchor_asof = None
    if earliest_date:
        try:
            anchor_asof = (date.fromisoformat(earliest_date) - timedelta(days=1)).isoformat()
        except Exception:
            anchor_asof = earliest_date

    # For replace imports, seed anchor once before replaying all trades.
    if replace and anchor_asof:
        seed_cash = float(current_cash_total or 0.0)
        if existing_anchor_cash is not None and existing_anchor_asof and existing_anchor_asof == anchor_asof:
            seed_cash = float(existing_anchor_cash)

        def _seed_anchor(conn):
            cur = conn.cursor()
            cur.execute("SELECT account_value FROM accounts WHERE account=?", (acct,))
            row = cur.fetchone()
            account_value = row.get("account_value") if isinstance(row, dict) else (row[0] if row else None)
            cur.execute(
                "INSERT OR REPLACE INTO accounts(account, cash, asof, account_value, anchor_mode) VALUES(?,?,?,?,?)",
                (acct, seed_cash, anchor_asof, account_value, "BOD"),
            )
            conn.commit()

        with_conn(_seed_anchor)

    skipped_close_rows = 0
    skipped_trade_event_keys: List[str] = []
    for row in parsed_rows:
        event_key = str(row.get("event_key") or "")
        instrument_id = str(row.get("instrument_id") or "")
        side = str(row.get("side") or "")
        action_lower = str(row.get("action_lower") or "")
        current_qty = float(live_qty.get(instrument_id, 0.0))
        requested_qty = abs(float(row.get("qty") or 0.0))
        is_close = bool(row.get("is_close"))

        if requested_qty <= 0 and is_close:
            if abs(current_qty) <= 1e-12:
                skipped_close_rows += 1
                if event_key:
                    skipped_trade_event_keys.append(event_key)
                continue
            requested_qty = abs(current_qty)
            if "expired" in action_lower:
                side = "SELL" if current_qty > 0 else "BUY"
        elif requested_qty <= 0:
            continue

        effective_qty = requested_qty
        if is_close:
            effective_qty = _cap_close_qty(side, current_qty, requested_qty)
            if effective_qty <= 1e-12:
                skipped_close_rows += 1
                if event_key:
                    skipped_trade_event_keys.append(event_key)
                continue

        live_qty[instrument_id] = _apply_qty_delta(side, current_qty, effective_qty)

        symbol_raw = _normalize_symbol_token(str(row.get("symbol") or "").strip().upper())
        asset_class = str(row.get("asset_class") or "equity").lower()
        explicit_sector = _normalize_sector_value(row.get("sector"))
        mapped_sector = symbol_sector_map.get(symbol_raw, "")
        assigned_sector = explicit_sector or mapped_sector or "Unassigned"
        price = float(row.get("price") or 0.0)
        allow_zero_price = ("expired" in action_lower) or (
            (asset_class == "option" or legacy_engine.is_option_symbol(symbol_raw)) and price <= 0
        )

        trades.append(
            {
                "trade_id": f"CSV_{acct_hash}_{event_key[:24]}",
                "instrument_id": instrument_id,
                "symbol": symbol_raw,
                "side": side,
                "qty": effective_qty,
                "price": price,
                "trade_date": row.get("trade_date"),
                "sector": assigned_sector,
                "trade_type": asset_class.upper(),
                "asset_class": asset_class,
                "underlying": row.get("underlying"),
                "expiry": row.get("expiry"),
                "strike": row.get("strike"),
                "option_type": row.get("option_type"),
                "account": acct,
                "source": import_source,
                "skip_cash_check": True,
                "allow_zero_price": allow_zero_price,
                "realized_pl_hint": float(row.get("realized_pl_hint") or 0.0),
                "event_key": event_key,
            }
        )

        amount_val = row.get("amount")
        if amount_val is not None and asset_class != "future":
            mult = legacy_engine.contract_multiplier(symbol_raw, asset_class)
            expected = (effective_qty * price * mult) if side == "SELL" else (-effective_qty * price * mult)
            fee_adj = float(amount_val) - float(expected)
            if abs(fee_adj) > 0.005:
                fee_event_key = hashlib.sha1(f"FEE|{event_key}".encode("utf-8")).hexdigest()
                if not replace and ("CASH_FLOW", fee_event_key) in existing_event_keys:
                    skipped_duplicate_rows += 1
                else:
                    cash_flows.append(
                        {
                            "account": acct,
                            "date": row.get("trade_date"),
                            "amount": fee_adj,
                            "note": f"FEE_ADJ {symbol_raw}".strip(),
                            "event_key": fee_event_key,
                        }
                    )

    inserted_cash_event_keys: List[str] = []
    if cash_flows:
        def _insert_flows(conn):
            cur = conn.cursor()
            for flow in cash_flows:
                cur.execute(
                    "INSERT INTO cash_flows(account, date, amount, note) VALUES(?,?,?,?)",
                    (flow["account"], flow["date"], float(flow["amount"]), flow.get("note")),
                )
                event_key = str(flow.get("event_key") or "")
                if event_key:
                    inserted_cash_event_keys.append(event_key)
            conn.commit()

        with_conn(_insert_flows)

    trades_created = 0
    inserted_trade_event_keys: List[str] = []
    for trade in trades:
        ok, msg, created_trade_id = legacy_engine.apply_trade(trade)
        if not ok:
            raise HTTPException(status_code=400, detail=msg)
        realized_hint = float(trade.get("realized_pl_hint") or 0.0)
        if import_source == "CSV_REALIZED" and abs(realized_hint) > 1e-12 and created_trade_id:
            def _set_realized(conn):
                cur = conn.cursor()
                cur.execute(
                    "UPDATE trades SET realized_pl=? WHERE trade_id=?",
                    (realized_hint, created_trade_id),
                )
                conn.commit()

            with_conn(_set_realized)
        trades_created += 1
        event_key = str(trade.get("event_key") or "")
        if event_key:
            inserted_trade_event_keys.append(event_key)

    if realized_updates_existing:
        def _update_existing_realized(conn):
            cur = conn.cursor()
            cur.executemany(
                "UPDATE trades SET realized_pl=? WHERE trade_id=?",
                [(float(realized), trade_id) for trade_id, realized in realized_updates_existing if trade_id],
            )
            conn.commit()

        with_conn(_update_existing_realized)

    if inserted_trade_event_keys or inserted_cash_event_keys or skipped_trade_event_keys:
        now_ts = datetime.now().isoformat()
        rows_to_insert: List[tuple[str, str, str, str]] = []
        rows_to_insert.extend((acct, "TRADE", key, now_ts) for key in inserted_trade_event_keys)
        rows_to_insert.extend((acct, "TRADE", key, now_ts) for key in skipped_trade_event_keys)
        rows_to_insert.extend((acct, "CASH_FLOW", key, now_ts) for key in inserted_cash_event_keys)

        def _insert_event_keys(conn):
            cur = conn.cursor()
            cur.executemany(
                "INSERT OR IGNORE INTO import_event_keys(account, kind, event_key, ts) VALUES(?,?,?,?)",
                rows_to_insert,
            )
            conn.commit()

        with_conn(_insert_event_keys)

    auto_closed_expired = 0
    try:
        auto_closed_expired = int(legacy_engine.close_expired_options(account=acct) or 0)
    except Exception:
        auto_closed_expired = 0

    # Infer account start cash only when an external anchor exists (e.g. imported account balances).
    trusted_end_cash = (
        existing_anchor_cash is not None
        and bool(existing_anchor_asof)
        and (not anchor_asof or existing_anchor_asof != anchor_asof)
    )
    if replace and trusted_end_cash and earliest_date:
        def _sum_flows(conn):
            cur = conn.cursor()
            cur.execute("SELECT COALESCE(SUM(amount),0) as total FROM cash_flows WHERE account=?", (acct,))
            row = cur.fetchone()
            cash_adj = float(row.get("total") if isinstance(row, dict) else row[0] or 0.0)
            cur.execute("SELECT COALESCE(SUM(cash_flow),0) as total FROM trades WHERE account=?", (acct,))
            row = cur.fetchone()
            trade_flow = float(row.get("total") if isinstance(row, dict) else row[0] or 0.0)
            return cash_adj + trade_flow

        net_flow = with_conn(_sum_flows)
        inferred_start = float(current_cash_total) - float(net_flow)
        seed_asof = anchor_asof or earliest_date

        def _set_account(conn):
            cur = conn.cursor()
            cur.execute("SELECT account_value FROM accounts WHERE account=?", (acct,))
            row = cur.fetchone()
            existing_value = row.get("account_value") if isinstance(row, dict) else (row[0] if row else None)
            cur.execute(
                "INSERT OR REPLACE INTO accounts(account, cash, asof, account_value, anchor_mode) VALUES(?,?,?,?,?)",
                (acct, float(inferred_start), seed_asof, existing_value, "BOD"),
            )
            conn.commit()

        with_conn(_set_account)

    try:
        legacy_engine._clear_nav_cache()
    except Exception:
        pass
    portfolio_service.rebuild_nav_history(limit=2000, account=acct)

    return {
        "ok": True,
        "account": acct,
        "source": import_source,
        "trades_created": trades_created,
        "cash_flows": len(cash_flows),
        "auto_closed_expired": auto_closed_expired,
        "skipped_close_rows": skipped_close_rows,
        "duplicates_skipped": skipped_duplicate_rows,
    }


@router.post("/trades/assign-sector")
def assign_trade_sector(payload: AssignTradeSectorPayload):
    acct = legacy_engine._account_label(payload.account)
    if acct == "ALL":
        raise HTTPException(status_code=400, detail="Select a specific account (not ALL).")
    sector_value = _normalize_sector_value(payload.sector) or "Unassigned"
    symbol = _normalize_symbol_token(payload.symbol or "")

    def _run(conn):
        cur = conn.cursor()
        where_parts = ["account=?"]
        params: List[Any] = [acct]
        if symbol:
            where_parts.append("UPPER(symbol)=?")
            params.append(symbol.upper())
        if payload.only_unassigned:
            where_parts.append("(sector IS NULL OR TRIM(sector)='' OR UPPER(TRIM(sector))='UNASSIGNED')")
        if payload.realized_only:
            where_parts.append("(UPPER(COALESCE(source,''))='CSV_REALIZED' OR realized_pl IS NOT NULL)")

        sql = f"UPDATE trades SET sector=? WHERE {' AND '.join(where_parts)}"
        cur.execute(sql, [sector_value] + params)
        updated = int(cur.rowcount or 0)
        conn.commit()
        return updated

    updated = with_conn(_run)
    try:
        legacy_engine._clear_nav_cache()
    except Exception:
        pass
    return {
        "ok": True,
        "account": acct,
        "sector": sector_value,
        "symbol": symbol or None,
        "updated": updated,
        "only_unassigned": bool(payload.only_unassigned),
        "realized_only": bool(payload.realized_only),
    }


@router.post("/trades/auto-classify")
def auto_classify_trade_sectors(payload: AutoClassifyTradesPayload):
    acct = legacy_engine._account_label(payload.account)
    if acct == "ALL":
        raise HTTPException(status_code=400, detail="Select a specific account (not ALL).")

    def _run(conn):
        cur = conn.cursor()
        symbol_sector_map = _load_symbol_sector_map_for_account(conn, acct)
        if not symbol_sector_map:
            return 0, 0

        updated_total = 0
        for symbol, sector in symbol_sector_map.items():
            where_parts = ["account=?", "UPPER(symbol)=?"]
            params: List[Any] = [acct, symbol.upper()]
            if payload.only_unassigned:
                where_parts.append("(sector IS NULL OR TRIM(sector)='' OR UPPER(TRIM(sector))='UNASSIGNED')")
            if payload.realized_only:
                where_parts.append("(UPPER(COALESCE(source,''))='CSV_REALIZED' OR realized_pl IS NOT NULL)")
            sql = f"UPDATE trades SET sector=? WHERE {' AND '.join(where_parts)}"
            cur.execute(sql, [sector] + params)
            updated_total += int(cur.rowcount or 0)

        conn.commit()
        return updated_total, len(symbol_sector_map)

    updated, mapped_symbols = with_conn(_run)
    try:
        legacy_engine._clear_nav_cache()
    except Exception:
        pass
    return {
        "ok": True,
        "account": acct,
        "updated": updated,
        "mapped_symbols": mapped_symbols,
        "only_unassigned": bool(payload.only_unassigned),
        "realized_only": bool(payload.realized_only),
    }


@router.post("/trades/update-sector")
def update_trade_sector(payload: UpdateTradeSectorPayload):
    trade_id = str(payload.trade_id or "").strip()
    if not trade_id:
        raise HTTPException(status_code=400, detail="trade_id is required.")
    sector_value = _normalize_sector_value(payload.sector) or "Unassigned"

    def _run(conn):
        cur = conn.cursor()
        cur.execute("UPDATE trades SET sector=? WHERE trade_id=?", (sector_value, trade_id))
        updated = int(cur.rowcount or 0)
        conn.commit()
        return updated

    updated = with_conn(_run)
    if updated <= 0:
        raise HTTPException(status_code=404, detail="Trade not found.")
    try:
        legacy_engine._clear_nav_cache()
    except Exception:
        pass
    return {"ok": True, "trade_id": trade_id, "sector": sector_value}


@router.post("/trades/update-realized")
def update_trade_realized(payload: UpdateTradeRealizedPayload):
    trade_id = str(payload.trade_id or "").strip()
    if not trade_id:
        raise HTTPException(status_code=400, detail="trade_id is required.")
    realized_val = None if payload.realized_pl is None else float(payload.realized_pl)

    def _run(conn):
        cur = conn.cursor()
        cur.execute("UPDATE trades SET realized_pl=? WHERE trade_id=?", (realized_val, trade_id))
        updated = int(cur.rowcount or 0)
        conn.commit()
        return updated

    updated = with_conn(_run)
    if updated <= 0:
        raise HTTPException(status_code=404, detail="Trade not found.")
    try:
        legacy_engine._clear_nav_cache()
    except Exception:
        pass
    return {"ok": True, "trade_id": trade_id, "realized_pl": realized_val}


@router.get("/sector-performance-inputs")
def get_sector_performance_inputs(account: str):
    acct = legacy_engine._account_label(account)
    if not acct or acct == "ALL":
        raise HTTPException(status_code=400, detail="Select a specific account (not ALL).")
    sectors = [str(s) for s in (legacy_engine.DEFAULT_SECTORS or []) if str(s).strip() and str(s).strip().lower() != "cash"]

    def _run(conn):
        cur = conn.cursor()
        baseline_prefix = f"sector_baseline::{acct}::%"
        weight_prefix = f"sector_target_weight::{acct}::%"
        cur.execute(
            "SELECT key, value FROM settings WHERE key LIKE ? OR key LIKE ?",
            (baseline_prefix, weight_prefix),
        )
        rows = cur.fetchall() or []
        baselines: Dict[str, float] = {}
        weights: Dict[str, float] = {}
        for row in rows:
            key = str(row.get("key") if isinstance(row, dict) else row[0] or "")
            raw_val = row.get("value") if isinstance(row, dict) else row[1]
            try:
                value = float(raw_val)
            except Exception:
                continue
            parts = key.split("::", 2)
            if len(parts) != 3:
                continue
            kind, _acct, sector_name = parts
            if kind == "sector_baseline":
                baselines[sector_name] = value
            elif kind == "sector_target_weight":
                weights[sector_name] = value
        return baselines, weights

    baselines, weights = with_conn(_run)
    all_sectors = sorted(set(sectors) | set(baselines.keys()) | set(weights.keys()))
    rows = [
        {
            "sector": sec,
            "baseline_value": baselines.get(sec),
            "target_weight": weights.get(sec),
        }
        for sec in all_sectors
    ]
    return {"ok": True, "account": acct, "rows": rows}


@router.post("/sector-performance-inputs")
def set_sector_performance_input(payload: SectorPerformanceInputPayload):
    acct = legacy_engine._account_label(payload.account)
    if not acct or acct == "ALL":
        raise HTTPException(status_code=400, detail="Select a specific account (not ALL).")
    sector = _normalize_sector_value(payload.sector)
    if not sector:
        raise HTTPException(status_code=400, detail="Sector is required.")

    baseline_key = _sector_baseline_key(acct, sector)
    weight_key = _sector_target_weight_key(acct, sector)
    baseline = payload.baseline_value
    target_weight = payload.target_weight
    if baseline is not None and baseline < 0:
        raise HTTPException(status_code=400, detail="baseline_value must be >= 0.")
    if target_weight is not None and not (-100.0 <= target_weight <= 100.0):
        raise HTTPException(status_code=400, detail="target_weight must be between -100 and 100.")

    def _run(conn):
        cur = conn.cursor()
        if baseline is None:
            cur.execute("DELETE FROM settings WHERE key=?", (baseline_key,))
        else:
            cur.execute("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)", (baseline_key, str(float(baseline))))
        if target_weight is None:
            cur.execute("DELETE FROM settings WHERE key=?", (weight_key,))
        else:
            cur.execute("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)", (weight_key, str(float(target_weight))))
        conn.commit()

    with_conn(_run)
    try:
        legacy_engine._clear_nav_cache()
    except Exception:
        pass
    return {
        "ok": True,
        "account": acct,
        "sector": sector,
        "baseline_value": None if baseline is None else float(baseline),
        "target_weight": None if target_weight is None else float(target_weight),
    }


@router.post("/import-balances")
async def import_balances(file: UploadFile = File(...), account: Optional[str] = None):
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        raise HTTPException(status_code=400, detail="No balances found in CSV.")

    def _load_existing_accounts():
        def _run(conn):
            cur = conn.cursor()
            cur.execute("SELECT account FROM accounts WHERE account != 'ALL'")
            results = cur.fetchall()
            return [r.get("account") if isinstance(r, dict) else r[0] for r in results]
        return with_conn(_run)

    existing_accounts = _load_existing_accounts()

    balance_history = _parse_balance_history_rows(rows)
    if balance_history:
        target_account = _resolve_balance_history_account(file.filename, account, existing_accounts)
        if not target_account:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Could not determine target account for Date/Amount balance history CSV. "
                    "Select a specific account before upload."
                ),
            )
        existing_account = _get_account_record(target_account)
        anchor_date_for_calibration = legacy_engine.parse_iso_date(existing_account.get("asof")) if existing_account else None

        # Accept one-day lead from broker timezone cutover (e.g., ET export while local date is prior day).
        today_iso = legacy_engine.today_str()
        try:
            max_allowed_date = (date.fromisoformat(today_iso) + timedelta(days=1)).isoformat()
        except Exception:
            max_allowed_date = today_iso
        history_non_future = [r for r in balance_history if str(r.get("date") or "") <= max_allowed_date]
        future_points_ignored = len(balance_history) - len(history_non_future)
        calibration_history = history_non_future if history_non_future else list(balance_history)

        effective_start = legacy_engine._effective_nav_start(target_account)
        earliest_history_date = str(calibration_history[0]["date"])
        calibration_start = min(effective_start, earliest_history_date) if effective_start else earliest_history_date
        history_for_nav = [r for r in calibration_history if str(r.get("date") or "") >= calibration_start]
        if not history_for_nav:
            history_for_nav = list(calibration_history)

        start_iso = str(history_for_nav[0]["date"])
        end_iso = str(calibration_history[-1]["date"])

        if settings.static_mode:
            bench_series = legacy_engine.get_bench_series(start_date=start_iso)
            bench_map_history: Dict[str, float] = {}
            if bench_series is not None and len(bench_series):
                for _, r in bench_series.iterrows():
                    d = str(r.get("d") or "")
                    if not d:
                        continue
                    try:
                        close_val = float(r.get("close") or 0.0)
                    except Exception:
                        continue
                    if close_val > 0:
                        bench_map_history[d] = close_val

            history_points_for_snapshots = history_non_future if history_non_future else list(calibration_history)
            latest_nav = float(history_points_for_snapshots[-1]["amount"])
            latest_date = str(history_points_for_snapshots[-1]["date"])
            nav_snapshots_written = 0

            def _store_static(conn):
                nonlocal nav_snapshots_written
                cur = conn.cursor()
                cur.execute("DELETE FROM nav_snapshots WHERE account=?", (target_account,))
                for point in history_points_for_snapshots:
                    d = str(point.get("date") or "")
                    if not d:
                        continue
                    nav_val = float(point.get("amount") or 0.0)
                    bench_val = bench_map_history.get(d)
                    cur.execute(
                        "INSERT OR REPLACE INTO nav_snapshots(account, date, nav, bench) VALUES(?,?,?,?)",
                        (target_account, d, nav_val, bench_val),
                    )
                    nav_snapshots_written += 1

                cur.execute("SELECT cash, anchor_mode FROM accounts WHERE account=?", (target_account,))
                row = cur.fetchone()
                existing_cash = row.get("cash") if isinstance(row, dict) else (row[0] if row else None)
                existing_mode = row.get("anchor_mode") if isinstance(row, dict) else (row[1] if row and len(row) > 1 else None)
                seed_cash = float(existing_cash) if existing_cash is not None else float(latest_nav)
                seed_mode = str(existing_mode or "EOD").strip().upper() or "EOD"
                cur.execute(
                    "INSERT OR REPLACE INTO accounts(account, cash, asof, account_value, anchor_mode) VALUES(?,?,?,?,?)",
                    (target_account, seed_cash, latest_date, latest_nav, seed_mode),
                )
                conn.commit()

            with_conn(_store_static)
            try:
                legacy_engine._clear_nav_cache()
            except Exception:
                pass
            return {
                "ok": True,
                "account": target_account,
                "history_points": len(balance_history),
                "history_points_used_total": len(calibration_history),
                "history_points_used": len(history_for_nav),
                "history_start": start_iso,
                "history_end": end_iso,
                "matched_nav_points": len(history_points_for_snapshots),
                "history_adjustments": 0,
                "history_anchor_adjustment": 0.0,
                "history_adjustment_mode": "none",
                "future_points_ignored": future_points_ignored,
                "nav_snapshots_written": nav_snapshots_written,
            }

        use_external_history_flows = bool(legacy_engine._has_non_import_trades(target_account))
        history_note_prefix = "BALANCE_ADJ_HISTORY_EXTERNAL" if use_external_history_flows else "BALANCE_ADJ_HISTORY"

        def _clear_prior_history_adjustments(conn):
            cur = conn.cursor()
            cur.execute(
                (
                    "DELETE FROM cash_flows WHERE account=? "
                    "AND (note LIKE 'BALANCE_ADJ_HISTORY%' OR note LIKE 'BALANCE_ADJ_HISTORY_EXTERNAL%')"
                ),
                (target_account,),
            )
            conn.commit()

        with_conn(_clear_prior_history_adjustments)
        try:
            legacy_engine._clear_nav_cache()
        except Exception:
            pass

        bench_series = legacy_engine.get_bench_series(start_date=start_iso)
        bench_map_history: Dict[str, float] = {}
        if bench_series is not None and len(bench_series):
            for _, r in bench_series.iterrows():
                d = str(r.get("d") or "")
                if not d:
                    continue
                try:
                    close_val = float(r.get("close") or 0.0)
                except Exception:
                    continue
                if close_val > 0:
                    bench_map_history[d] = close_val
        nav_df = legacy_engine.build_daily_nav_series(start_iso, bench_series, account=target_account)
        nav_map: Dict[str, float] = {}
        if nav_df is not None and len(nav_df):
            for _, r in nav_df.iterrows():
                d = str(r.get("d") or "")
                if not d:
                    continue
                try:
                    nav_map[d] = float(r.get("nav") or 0.0)
                except Exception:
                    continue

        adjustments: List[tuple[str, str, float, str]] = []
        residual_prev = 0.0
        matched_points = 0
        for row in history_for_nav:
            d = str(row.get("date") or "")
            target_nav = float(row.get("amount") or 0.0)
            if not d or d not in nav_map:
                continue
            residual_now = float(target_nav - float(nav_map[d]))
            flow_amt = float(residual_now - residual_prev)
            if abs(flow_amt) > 0.005:
                adjustments.append((target_account, d, flow_amt, history_note_prefix))
            residual_prev = residual_now
            matched_points += 1

        anchor_adjustment = 0.0
        if anchor_date_for_calibration and abs(residual_prev) > 0.005:
            # Keep historical calibration anchored at account.asof so back-casting from
            # anchored cash does not introduce a constant offset across the full series.
            anchor_adjustment = float(-residual_prev)
            adjustments.append(
                (
                    target_account,
                    anchor_date_for_calibration,
                    anchor_adjustment,
                    f"{history_note_prefix}_ANCHOR",
                )
            )

        latest_nav = float(calibration_history[-1]["amount"])
        latest_date = str(calibration_history[-1]["date"])
        history_points_for_snapshots = history_non_future if history_non_future else list(calibration_history)
        nav_snapshots_written = 0

        def _store(conn):
            nonlocal nav_snapshots_written
            cur = conn.cursor()
            if adjustments:
                cur.executemany(
                    "INSERT INTO cash_flows(account, date, amount, note) VALUES(?,?,?,?)",
                    adjustments,
                )
            cur.execute("SELECT cash, asof, anchor_mode FROM accounts WHERE account=?", (target_account,))
            row = cur.fetchone()
            existing_cash = row.get("cash") if isinstance(row, dict) else (row[0] if row else None)
            existing_asof = row.get("asof") if isinstance(row, dict) else (row[1] if row else None)
            existing_mode = row.get("anchor_mode") if isinstance(row, dict) else (row[2] if row else None)
            if row:
                cur.execute(
                    "UPDATE accounts SET account_value=? WHERE account=?",
                    (latest_nav, target_account),
                )
            else:
                seed_cash = float(existing_cash) if existing_cash is not None else latest_nav
                seed_asof = legacy_engine.parse_iso_date(existing_asof) or latest_date
                seed_mode = str(existing_mode or "EOD").strip().upper() or "EOD"
                cur.execute(
                    "INSERT OR REPLACE INTO accounts(account, cash, asof, account_value, anchor_mode) VALUES(?,?,?,?,?)",
                    (target_account, float(seed_cash), seed_asof, latest_nav, seed_mode),
                )
            if settings.static_mode:
                cur.execute("DELETE FROM nav_snapshots WHERE account=?", (target_account,))
                for point in history_points_for_snapshots:
                    d = str(point.get("date") or "")
                    if not d:
                        continue
                    try:
                        nav_val = float(point.get("amount") or 0.0)
                    except Exception:
                        continue
                    bench_val = bench_map_history.get(d)
                    cur.execute(
                        "INSERT OR REPLACE INTO nav_snapshots(account, date, nav, bench) VALUES(?,?,?,?)",
                        (target_account, d, nav_val, bench_val),
                    )
                    nav_snapshots_written += 1
            conn.commit()

        with_conn(_store)
        try:
            legacy_engine._clear_nav_cache()
        except Exception:
            pass
        if not settings.static_mode:
            portfolio_service.rebuild_nav_history(limit=4000, account=target_account)
        return {
            "ok": True,
            "account": target_account,
            "history_points": len(balance_history),
            "history_points_used_total": len(calibration_history),
            "history_points_used": len(history_for_nav),
            "history_start": start_iso,
            "history_end": end_iso,
            "matched_nav_points": matched_points,
            "history_adjustments": len(adjustments),
            "history_anchor_adjustment": anchor_adjustment,
            "history_adjustment_mode": "external" if use_external_history_flows else "internal",
            "future_points_ignored": future_points_ignored,
            "nav_snapshots_written": nav_snapshots_written,
        }

    asof = None
    accounts: Dict[str, Dict[str, Any]] = {}
    current_account = None

    for row in rows:
        if not row or not any(cell.strip() for cell in row):
            continue
        cell0 = row[0].strip()
        if cell0.lower().startswith("balances for"):
            # Example: Balances for All-Accounts as of 02/17/2026 05:37 PM ET
            match = re.search(r"(\d{2}/\d{2}/\d{4})", cell0)
            if match:
                try:
                    asof = datetime.strptime(match.group(1), "%m/%d/%Y").date().isoformat()
                except Exception:
                    asof = None
            continue
        if len(row) == 1 and cell0 and not cell0.lower().startswith("total "):
            name = _normalize_account_name(cell0)
            key = _normalize_account_key(name)
            if key in {"all accounts", "all-accounts", "option details", "funds available", "investments"}:
                current_account = None
                continue
            current_account = _match_existing_account(name, existing_accounts)
            accounts.setdefault(current_account, {})
            continue
        if len(row) >= 2 and current_account:
            key = row[0].strip()
            value = row[1].strip() if len(row) > 1 else ""
            if not key:
                continue
            if key.lower().startswith("cash & cash investments"):
                cash_val = _parse_money_value(value)
                if cash_val is not None:
                    accounts[current_account]["cash"] = float(cash_val)
            if key.lower().startswith("account value"):
                nav_val = _parse_money_value(value)
                if nav_val is not None:
                    accounts[current_account]["account_value"] = float(nav_val)

    if not accounts:
        raise HTTPException(status_code=400, detail="No account balances found in CSV.")

    updated = 0
    adjusted = 0

    def _run(conn):
        nonlocal updated, adjusted
        cur = conn.cursor()
        for name, data in accounts.items():
            cash_val = data.get("cash")
            if cash_val is None:
                continue
            account_value = data.get("account_value")
            if settings.static_mode:
                cur.execute(
                    "INSERT OR REPLACE INTO accounts(account, cash, asof, account_value, anchor_mode) VALUES(?,?,?,?,?)",
                    (name, float(cash_val), asof or datetime.now().date().isoformat(), account_value, "EOD"),
                )
                updated += 1
                continue
            cur.execute("SELECT 1 FROM trades WHERE account=? LIMIT 1", (name,))
            has_trades = cur.fetchone() is not None
            if has_trades:
                try:
                    current_cash = float(legacy_engine.compute_cash_balance_total(name))
                except Exception:
                    current_cash = 0.0
                diff = float(cash_val) - current_cash
                if abs(diff) > 0.005:
                    cur.execute(
                        "INSERT INTO cash_flows(account, date, amount, note) VALUES(?,?,?,?)",
                        (name, asof or datetime.now().date().isoformat(), float(diff), "BALANCE_ADJ"),
                    )
                    adjusted += 1
            else:
                cur.execute(
                    "INSERT OR REPLACE INTO accounts(account, cash, asof, account_value, anchor_mode) VALUES(?,?,?,?,?)",
                    (name, float(cash_val), asof or datetime.now().date().isoformat(), account_value, "EOD"),
                )
                updated += 1
        conn.commit()

    with_conn(_run)

    # In static mode, also store NAV snapshots from the balance import
    # so charts reflect the imported account values
    if settings.static_mode:
        bench_map: Dict[str, float] = {}
        try:
            bench_series = legacy_engine.get_bench_series()
            if bench_series is not None and len(bench_series):
                bench_map = {str(r["d"]): float(r["close"]) for _, r in bench_series.iterrows()}
        except Exception:
            bench_map = {}
        for name, data in accounts.items():
            nav_val = data.get("account_value") or data.get("cash")
            if nav_val and nav_val > 0:
                date_iso = asof or datetime.now().date().isoformat()
                bench_val = bench_map.get(date_iso)
                portfolio_service.store_nav_snapshot(name, date_iso, float(nav_val), bench=bench_val)

    try:
        legacy_engine._clear_nav_cache()
    except Exception:
        pass
    return {"ok": True, "accounts_updated": updated, "cash_adjustments": adjusted}
