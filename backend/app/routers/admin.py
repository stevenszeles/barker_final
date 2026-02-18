from datetime import datetime
from typing import Optional, Dict, Any, List
import csv
import io
import re
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from ..db import with_conn
from ..config import settings
from ..services import portfolio as portfolio_service
from ..services import legacy_engine as legacy_engine
from ..services import options as options_service

router = APIRouter(prefix="/admin", tags=["admin"])


class ResetPayload(BaseModel):
    start_cash: float = 0.0


class BenchPayload(BaseModel):
    bench_start: str


class NavTextPayload(BaseModel):
    account: str
    text: str
    append: bool = False


class BenchTextPayload(BaseModel):
    text: str
    append: bool = False


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
        cur.execute("DELETE FROM accounts")
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
    return {"ok": True}


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
    return portfolio_service.rebuild_nav_history(limit=limit, account=account)


@router.post("/clear-nav")
def clear_nav(account: Optional[str] = None):
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


_OPT_RE = re.compile(r"^([A-Z0-9/.\-]+)\s+(\d{2}/\d{2}/\d{4})\s+([0-9]+(?:\.\d+)?)\s+([CP])$", re.I)
_TXN_DATE_RE = re.compile(r"^\s*(\d{2}/\d{2}/\d{4})(?:\s+as\s+of\s+(\d{2}/\d{2}/\d{4}))?\s*$", re.I)


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
    match = _TXN_DATE_RE.match(str(raw))
    if not match:
        return None
    date_text = match.group(2) or match.group(1)
    try:
        return datetime.strptime(date_text, "%m/%d/%Y").date().isoformat()
    except Exception:
        return None


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
    if action_lower == "expired":
        return "SELL" if qty >= 0 else "BUY"
    if "buy" in action_lower or "reinvest" in action_lower or "cover" in action_lower:
        return "BUY"
    if "sell" in action_lower or "short" in action_lower:
        return "SELL"
    return None


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
        symbol = row[0].strip()
        if not symbol:
            continue
        if symbol.lower() == "account total":
            total_val = _parse_money(_cell(row, "Mkt Val (Market Value)"))
            if total_val is not None:
                account_value_by_account[current_account] = float(total_val)
            continue
        if symbol.lower().startswith("cash"):
            cash = _parse_money(_cell(row, "Mkt Val (Market Value)"))
            cash_by_account[current_account] = cash
            continue
        qty = _parse_float(_cell(row, "Qty (Quantity)"))
        price = _parse_float(_cell(row, "Price"))
        mkt_val = _parse_money(_cell(row, "Mkt Val (Market Value)"))
        day_chg = _parse_money(_cell(row, "Day Chng $ (Day Change $)"))
        cost_basis = _parse_money(_cell(row, "Cost Basis"))
        gain = _parse_money(_cell(row, "Gain $ (Gain/Loss $)"))
        security_type = _cell(row, "Security Type")
        parsed_option = _parse_option_symbol(symbol) or _parse_option_symbol(_cell(row, "Description"))
        asset_class = "option" if parsed_option or "option" in (security_type or "").lower() else "equity"
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
            "INSERT OR REPLACE INTO accounts(account, cash, asof, account_value) VALUES(?, COALESCE((SELECT cash FROM accounts WHERE account=?), 0), ?, ?)",
            (acct, acct, latest_date, float(latest_nav)),
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
        symbol_raw = str(row.get("Symbol") or row.get("symbol") or "").strip().upper()
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
        symbol_raw = symbol_raw.strip().upper()
        mult = legacy_engine.contract_multiplier(symbol_raw, asset_class)
        price = float(price_val or 0.0)
        signed_qty = abs(qty) if side == "BUY" else -abs(qty)
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

@router.post("/import-positions")
async def import_positions(file: UploadFile = File(...), account: Optional[str] = None):
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
    if account:
        acct_label = legacy_engine._account_label(account)
        if acct_label and acct_label not in candidate_accounts:
            candidate_accounts.append(acct_label)
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
    if account and str(account).strip().upper() == "ALL":
        raise HTTPException(status_code=400, detail="Select a specific account (not ALL) for positions import.")
    if account:
        label = legacy_engine._account_label(account)
        positions = [row for row in positions if legacy_engine._account_label(row.get("account")) == label]
        cash_map = {k: v for k, v in cash_map.items() if legacy_engine._account_label(k) == label}
        account_values = {k: v for k, v in account_values.items() if legacy_engine._account_label(k) == label}
    if not positions and not cash_map:
        if account:
            raise HTTPException(status_code=400, detail=f"No positions found for account {account}.")
        raise HTTPException(status_code=400, detail="No positions found in CSV.")
    if account:
        accounts = [legacy_engine._account_label(account)]
    else:
        accounts = sorted({row["account"] for row in positions} | set(cash_map.keys()) | set(account_values.keys()))
    import_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    accounts_with_real_trades: set[str] = set()
    if accounts:
        def _find_real(conn):
            cur = conn.cursor()
            for acct in accounts:
                cur.execute(
                    "SELECT 1 FROM trades WHERE account=? AND NOT (trade_type='IMPORT' OR source='CSV_IMPORT') LIMIT 1",
                    (acct,),
                )
                if cur.fetchone():
                    accounts_with_real_trades.add(acct)
        with_conn(_find_real)

        portfolio_service.clear_positions_for_accounts(accounts)
        for acct in accounts:
            # Always clear nav history so the chart rebuilds from fresh import data
            try:
                portfolio_service.clear_nav_history(account=acct)
            except Exception:
                pass
            if settings.static_mode or acct not in accounts_with_real_trades:
                try:
                    portfolio_service.clear_trades_for_account(account=acct)
                except Exception:
                    pass
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
        bench_map: Dict[str, float] = {}
        try:
            bench_series = legacy_engine.get_bench_series()
            if bench_series is not None and len(bench_series):
                bench_map = {str(r["d"]): float(r["close"]) for _, r in bench_series.iterrows()}
        except Exception:
            bench_map = {}
        bench_val = bench_map.get(asof) if bench_map else None
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
    return {
        "ok": True,
        "accounts": accounts,
        "positions_count": len(positions),
        "count": len(positions),
        "trades_created": trades_created,
    }


@router.post("/import-transactions")
async def import_transactions(file: UploadFile = File(...), account: Optional[str] = None, replace: bool = True):
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    rows = [row for row in reader if row and any(cell.strip() for cell in row.values() if isinstance(cell, str))]
    if not rows:
        raise HTTPException(status_code=400, detail="No transactions found in CSV.")

    if not account or str(account).strip().upper() == "ALL":
        raise HTTPException(status_code=400, detail="Select a specific account (not ALL) for transaction import.")
    acct = legacy_engine._account_label(account)
    current_cash_total = legacy_engine.compute_cash_balance_total(acct)

    if settings.static_mode:
        result = _build_nav_from_transactions_static(rows, acct)
        try:
            legacy_engine._clear_nav_cache()
        except Exception:
            pass
        return result

    if replace:
        def _clear(conn):
            cur = conn.cursor()
            cur.execute("DELETE FROM positions WHERE account=?", (acct,))
            cur.execute("DELETE FROM trades WHERE account=?", (acct,))
            cur.execute("DELETE FROM cash_flows WHERE account=?", (acct,))
            cur.execute("DELETE FROM nav_snapshots WHERE account=?", (acct,))
            cur.execute("DELETE FROM strategies")
            conn.commit()
        with_conn(_clear)

    trades: List[Dict[str, Any]] = []
    cash_flows: List[Dict[str, Any]] = []
    earliest_date: Optional[str] = None

    for row in rows:
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
        symbol_raw = str(row.get("Symbol") or row.get("symbol") or "").strip().upper()
        description = str(row.get("Description") or row.get("description") or "").strip().upper()
        qty_val = _parse_money_value(row.get("Quantity") or row.get("quantity") or row.get("Qty") or row.get("qty"))
        qty = float(qty_val or 0.0)
        price_val = _parse_money_value(row.get("Price") or row.get("price"))
        amount_val = _parse_money_value(row.get("Amount") or row.get("amount"))

        if action_lower in {"cash dividend"}:
            if amount_val is None:
                continue
            cash_flows.append(
                {"account": acct, "date": trade_date, "amount": float(amount_val), "note": f"DIVIDEND {symbol_raw or ''}".strip()}
            )
            continue

        if "reinvest" in action_lower:
            side = "BUY"
        elif "buy" in action_lower:
            side = "BUY"
        elif "sell" in action_lower:
            side = "SELL"
        elif action_lower == "expired":
            side = "SELL" if qty >= 0 else "BUY"
        else:
            continue

        if qty == 0:
            continue
        qty = abs(qty)

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

        price = float(price_val or 0.0)
        if price == 0.0 and amount_val is not None and qty:
            mult = legacy_engine.contract_multiplier(symbol_raw, asset_class)
            try:
                price = abs(float(amount_val)) / (abs(float(qty)) * float(mult))
            except Exception:
                price = 0.0
        allow_zero_price = action_lower == "expired"

        trades.append(
            {
                "symbol": symbol_raw,
                "side": side,
                "qty": qty,
                "price": price,
                "trade_date": trade_date,
                "sector": "Unassigned",
                "trade_type": asset_class.upper(),
                "asset_class": asset_class,
                "underlying": underlying,
                "expiry": expiry,
                "strike": strike,
                "option_type": option_type,
                "account": acct,
                "skip_cash_check": True,
                "allow_zero_price": allow_zero_price,
            }
        )

        if amount_val is not None and asset_class != "future":
            mult = legacy_engine.contract_multiplier(symbol_raw, asset_class)
            expected = (qty * price * mult) if side == "SELL" else (-qty * price * mult)
            fee_adj = float(amount_val) - float(expected)
            if abs(fee_adj) > 0.005:
                cash_flows.append(
                    {"account": acct, "date": trade_date, "amount": fee_adj, "note": f"FEE_ADJ {symbol_raw}".strip()}
                )

    trades.sort(key=lambda r: r.get("trade_date") or "")

    for flow in cash_flows:
        def _run(conn):
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO cash_flows(account, date, amount, note) VALUES(?,?,?,?)",
                (flow["account"], flow["date"], float(flow["amount"]), flow.get("note")),
            )
            conn.commit()
        with_conn(_run)

    trades_created = 0
    for trade in trades:
        ok, msg, _ = legacy_engine.apply_trade(trade)
        if not ok:
            raise HTTPException(status_code=400, detail=msg)
        trades_created += 1

    if earliest_date:
        current_bench = legacy_engine._get_bench_start()
        if earliest_date < current_bench:
            legacy_engine._set_setting("bench_start", earliest_date)

    # Infer start cash from current cash if possible
    if current_cash_total and current_cash_total > 0 and earliest_date:
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
        if acct == "ALL":
            legacy_engine._set_setting("start_cash", inferred_start)
        else:
            def _set_account(conn):
                cur = conn.cursor()
                cur.execute(
                    "INSERT OR REPLACE INTO accounts(account, cash, asof) VALUES(?,?,?)",
                    (acct, float(inferred_start), earliest_date),
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
        "trades_created": trades_created,
        "cash_flows": len(cash_flows),
    }


@router.post("/import-balances")
async def import_balances(file: UploadFile = File(...)):
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
                    "INSERT OR REPLACE INTO accounts(account, cash, asof, account_value) VALUES(?,?,?,?)",
                    (name, float(cash_val), asof or datetime.now().date().isoformat(), account_value),
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
                    "INSERT OR REPLACE INTO accounts(account, cash, asof, account_value) VALUES(?,?,?,?)",
                    (name, float(cash_val), asof or datetime.now().date().isoformat(), account_value),
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
