import math
import threading
import time
from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from ..db import with_conn
from ..config import settings
from . import schwab, stooq, options as options_service, futures as futures_service
from .cache import cache

DEFAULT_SECTORS = [
    "Information Technology",
    "Financials",
    "Communication Services",
    "Consumer Discretionary",
    "Health Care",
    "Industrials",
    "Consumer Staples",
    "Utilities",
    "Real Estate",
    "Energy",
    "Materials",
    "Cash",
]

SECTOR_ETF = {
    "Information Technology": "XLK",
    "Financials": "XLF",
    "Communication Services": "XLC",
    "Consumer Discretionary": "XLY",
    "Health Care": "XLV",
    "Industrials": "XLI",
    "Consumer Staples": "XLP",
    "Utilities": "XLU",
    "Real Estate": "XLRE",
    "Energy": "XLE",
    "Materials": "XLB",
    "Cash": "",
}

DEFAULT_BENCH = "^GSPC"
START_CASH_DEFAULT = 5_000_000.0

SHORT_EXTRA_MARGIN_PCT = 0.50
SHORT_PROCEEDS_LOCK_PCT = 1.00

MAX_DAILY_JUMP_BENCH = 0.25
MAX_DAILY_JUMP_STOCK = 0.60

RISK_FREE_ANNUAL = 0.0415
TRADING_DAYS = 252

QUOTE_CACHE: Dict[str, Tuple[float, float]] = {}
QUOTE_CACHE_TTL = 60.0

NAV_CACHE: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
NAV_CACHE_TTL = 60.0

BACKGROUND_UPDATE_THREAD: Optional[threading.Thread] = None
STOP_BACKGROUND_UPDATES = False


# ----------------------------
# Basic helpers
# ----------------------------

def today_str() -> str:
    return date.today().isoformat()


def now_ts_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def year_start_date() -> str:
    y = date.today().year
    return date(y, 1, 1).isoformat()


def parse_iso_date(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text).isoformat()
    except Exception:
        return None


def normalize_benchmark_symbol(symbol: Optional[str]) -> str:
    base = (symbol or "").strip().upper()
    if base in {"SPX", "^SPX", "$SPX", "^GSPC"}:
        return "^GSPC"
    return base or DEFAULT_BENCH


def _fetch_rows(cur) -> List[Dict[str, Any]]:
    return [dict(row) for row in cur.fetchall()]


def _account_label(account: Optional[str]) -> str:
    raw = (account or "").strip()
    if not raw or raw.upper() == "ALL":
        return "ALL"
    return raw


def _exclude_all_account(conn) -> bool:
    cur = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) as cnt FROM positions WHERE account != 'ALL'")
        if float((cur.fetchone() or {}).get("cnt", 0) or 0) > 0:
            return True
    except Exception:
        pass
    try:
        cur.execute("SELECT COUNT(*) as cnt FROM trades WHERE account != 'ALL'")
        if float((cur.fetchone() or {}).get("cnt", 0) or 0) > 0:
            return True
    except Exception:
        pass
    return False


def _account_where(conn, account: Optional[str], alias: str = "") -> Tuple[str, List[Any]]:
    label = _account_label(account)
    prefix = f"{alias}." if alias else ""
    if label == "ALL":
        return f"{prefix}account != 'ALL'", []
    return f"{prefix}account = ?", [label]


# ----------------------------
# Settings
# ----------------------------

def _get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    def _run(conn):
        cur = conn.cursor()
        cur.execute("SELECT value FROM settings WHERE key=?", (key,))
        row = cur.fetchone()
        if not row:
            return default
        if isinstance(row, dict):
            return row.get("value", default)
        return row[0]

    return with_conn(_run)


def _set_setting(key: str, value: Any) -> None:
    def _run(conn):
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)", (key, str(value)))
        conn.commit()

    with_conn(_run)


def _get_benchmark() -> str:
    return normalize_benchmark_symbol(_get_setting("benchmark", DEFAULT_BENCH))


def _get_bench_start() -> str:
    start = _get_setting("bench_start", year_start_date())
    if not parse_iso_date(start):
        return year_start_date()
    return str(start)


def _earliest_portfolio_date(account: Optional[str]) -> Optional[str]:
    def _run(conn):
        where, params = _account_where(conn, account)
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT MIN(entry_date) AS d
            FROM positions
            WHERE {where}
              AND entry_date IS NOT NULL
              AND TRIM(entry_date) != ''
            """,
            params,
        )
        row = cur.fetchone()
        pos_date = parse_iso_date(row.get("d") if isinstance(row, dict) else (row[0] if row else None))
        cur.execute(
            f"""
            SELECT MIN(trade_date) AS d
            FROM trades
            WHERE {where}
              AND trade_date IS NOT NULL
              AND TRIM(trade_date) != ''
            """,
            params,
        )
        row = cur.fetchone()
        trade_date = parse_iso_date(row.get("d") if isinstance(row, dict) else (row[0] if row else None))
        dates = [d for d in [pos_date, trade_date] if d]
        return min(dates) if dates else None

    return with_conn(_run)


def _effective_nav_start(account: Optional[str]) -> str:
    bench_start = _get_bench_start()
    earliest = _earliest_portfolio_date(account)
    # If we have explicit portfolio dating (entry dates / trades),
    # anchor NAV + benchmark at that date so relative returns align.
    if earliest:
        return earliest
    return bench_start


def _has_trade_or_entry_data(account: Optional[str]) -> bool:
    def _run(conn):
        where, params = _account_where(conn, account)
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) AS cnt FROM trades WHERE {where}", params)
        row = cur.fetchone()
        trade_cnt = int((row.get("cnt") if isinstance(row, dict) else row[0]) or 0) if row else 0
        cur.execute(
            f"""
            SELECT COUNT(*) AS cnt
            FROM positions
            WHERE {where}
              AND entry_date IS NOT NULL
              AND TRIM(entry_date) != ''
            """,
            params,
        )
        row = cur.fetchone()
        entry_cnt = int((row.get("cnt") if isinstance(row, dict) else row[0]) or 0) if row else 0
        return trade_cnt > 0 or entry_cnt > 0

    return bool(with_conn(_run))


def _symbol_start_map_from_positions_df(pos_df: pd.DataFrame, default_start: str) -> Dict[str, str]:
    out: Dict[str, str] = {}
    default_iso = parse_iso_date(default_start) or year_start_date()
    if pos_df is None or pos_df.empty:
        return out
    for _, row in pos_df.iterrows():
        sym = str(row.get("symbol") or "").strip().upper()
        if not sym or sym == "NAN" or is_option_symbol(sym):
            continue
        entry_iso = parse_iso_date(row.get("entry_date"))
        start_iso = entry_iso or default_iso
        prev = out.get(sym)
        if not prev or start_iso < prev:
            out[sym] = start_iso
    return out


def _position_symbol_start_map(account: Optional[str], default_start: str) -> Dict[str, str]:
    pos_df = _load_positions_df(account)
    return _symbol_start_map_from_positions_df(pos_df, default_start)


def _get_start_cash(account: Optional[str] = None) -> float:
    cash, _ = _get_cash_anchor_info(account)
    if cash is not None:
        try:
            return float(cash)
        except Exception:
            pass
    value = _get_setting("start_cash", str(START_CASH_DEFAULT))
    try:
        return float(value)
    except Exception:
        return float(START_CASH_DEFAULT)


def _normalize_asof(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    if len(text) >= 10:
        text = text[:10]
    return parse_iso_date(text)


def _get_cash_anchor_info(account: Optional[str]) -> Tuple[Optional[float], Optional[str]]:
    label = _account_label(account)
    def _load_rows(conn):
        cur = conn.cursor()
        if label == "ALL":
            cur.execute("SELECT account, cash, asof FROM accounts WHERE account != 'ALL'")
            return _fetch_rows(cur)
        cur.execute("SELECT cash, asof FROM accounts WHERE account=?", (label,))
        row = cur.fetchone()
        if not row:
            return []
        if isinstance(row, dict):
            return [row]
        return [{"cash": row[0], "asof": row[1]}]

    rows = with_conn(_load_rows)
    if not rows:
        return None, None

    if label == "ALL":
        total_cash = 0.0
        asof_dates: List[str] = []
        for row in rows:
            try:
                total_cash += float(row.get("cash") or 0.0)
            except Exception:
                pass
            asof = _normalize_asof(row.get("asof"))
            if asof:
                asof_dates.append(asof)
        anchor_asof = min(asof_dates) if asof_dates else None
        return float(total_cash), anchor_asof

    row = rows[0]
    cash_val = row.get("cash") if isinstance(row, dict) else None
    asof_val = row.get("asof") if isinstance(row, dict) else None
    return (float(cash_val) if cash_val is not None else None), _normalize_asof(asof_val)


# ----------------------------
# Instruments and symbols
# ----------------------------

def is_option_symbol(symbol: str) -> bool:
    return options_service.is_osi_symbol(symbol or "")


def build_option_symbol(underlying: str, expiry_iso: str, right: str, strike: float) -> str:
    right = (right or "").strip().upper()
    opt_type = "CALL" if right == "C" else "PUT"
    return options_service.build_osi_symbol(underlying, expiry_iso, opt_type, strike)


def parse_osi_option(symbol: str) -> Optional[Dict[str, Any]]:
    parsed = options_service.parse_osi_symbol(symbol or "")
    if not parsed:
        return None
    underlying, expiry, right, strike = parsed
    return {
        "underlying": underlying,
        "expiry": expiry,
        "right": right,
        "strike": float(strike),
    }


def infer_underlying_from_symbol(symbol: str) -> str:
    sym = (symbol or "").strip().upper()
    if is_option_symbol(sym):
        info = parse_osi_option(sym)
        return info.get("underlying") if info else ""
    if futures_service.parse_future_symbol(sym):
        spec = futures_service.get_future_spec(sym)
        return (spec.get("root") or sym).upper()
    return sym


def contract_multiplier(symbol: str, asset_class: Optional[str] = None) -> float:
    sym = (symbol or "").strip().upper()
    if asset_class:
        cls = asset_class.lower()
        if cls == "option":
            return 100.0
        if cls == "future":
            spec = futures_service.get_future_spec(sym)
            return float(spec.get("multiplier") or 1.0)
    if is_option_symbol(sym):
        return 100.0
    if futures_service.parse_future_symbol(sym):
        spec = futures_service.get_future_spec(sym)
        return float(spec.get("multiplier") or 1.0)
    return 1.0


def _derive_instrument_fields(instrument_id: str) -> Dict[str, Any]:
    raw = (instrument_id or "").strip()
    symbol = raw
    asset_class = "equity"
    if ":" in raw:
        symbol, suffix = raw.split(":", 1)
        suffix = suffix.strip().lower()
        if suffix in {"eq", "equity"}:
            asset_class = "equity"
        elif suffix in {"option", "opt"}:
            asset_class = "option"
        elif suffix in {"future", "fut"}:
            asset_class = "future"
        elif suffix:
            asset_class = suffix
    symbol = (symbol or "").strip().upper()
    underlying = symbol
    expiry = None
    strike = None
    option_type = None
    multiplier = 1.0
    if asset_class == "option" or is_option_symbol(symbol):
        try:
            symbol, underlying, expiry, option_type, strike = options_service.normalize_option_fields(
                symbol, symbol, None, None, None
            )
        except Exception:
            pass
        asset_class = "option"
        multiplier = 100.0
    elif asset_class == "equity" and futures_service.parse_future_symbol(symbol):
        asset_class = "future"
        spec = futures_service.get_future_spec(symbol)
        underlying = spec.get("root") or underlying
        expiry = spec.get("expiry") or expiry
        multiplier = float(spec.get("multiplier") or 1.0)
    elif asset_class == "future":
        spec = futures_service.get_future_spec(symbol)
        underlying = spec.get("root") or underlying
        expiry = spec.get("expiry") or expiry
        multiplier = float(spec.get("multiplier") or 1.0)
    return {
        "id": instrument_id,
        "symbol": symbol,
        "asset_class": asset_class,
        "underlying": underlying,
        "expiry": expiry,
        "strike": strike,
        "option_type": option_type,
        "multiplier": multiplier,
    }


def _ensure_instrument(conn, instrument_id: str, fields: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cur = conn.cursor()
    cur.execute("SELECT id, symbol, asset_class, underlying, expiry, strike, option_type, multiplier FROM instruments WHERE id=?", (instrument_id,))
    row = cur.fetchone()
    if row:
        data = dict(row)
        if not data.get("symbol") and fields:
            data.update(fields)
        return data
    data = fields or _derive_instrument_fields(instrument_id)
    cur.execute(
        """
        INSERT OR IGNORE INTO instruments(
            id, symbol, asset_class, underlying, expiry, strike, option_type, multiplier, exchange, currency
        ) VALUES(?,?,?,?,?,?,?,?,?,?)
        """,
        (
            data["id"],
            data["symbol"],
            data["asset_class"],
            data.get("underlying"),
            data.get("expiry"),
            data.get("strike"),
            data.get("option_type"),
            data.get("multiplier") or 1.0,
            None,
            "USD",
        ),
    )
    conn.commit()
    return data


def _ensure_account(conn, account: str) -> None:
    if not account:
        return
    cur = conn.cursor()
    cur.execute(
        "INSERT OR IGNORE INTO accounts(account, cash, asof) VALUES(?,?,?)",
        (account, 0.0, now_ts_str()),
    )
    conn.commit()


# ----------------------------
# Price cache helpers
# ----------------------------

def _sanitize_price_df(df: pd.DataFrame, is_bench: bool) -> pd.DataFrame:
    if df is None or len(df) == 0:
        return pd.DataFrame(columns=["date", "close"])
    x = df.copy()
    x["date"] = x["date"].astype(str)
    x["close"] = pd.to_numeric(x["close"], errors="coerce")
    x = x.dropna()
    x = x[x["close"] > 0].copy()
    x = x.sort_values("date").reset_index(drop=True)
    if len(x) < 2:
        return pd.DataFrame(columns=["date", "close"])
    c = x["close"].astype(float)
    pct = c.pct_change().abs()
    max_jump = MAX_DAILY_JUMP_BENCH if is_bench else MAX_DAILY_JUMP_STOCK
    x["close"] = c.mask(pct > max_jump).ffill()
    x = x.dropna()
    x = x[x["close"] > 0].copy()
    return x[["date", "close"]].reset_index(drop=True)


def _detect_cached_corruption(symbol: str, start_date: str, is_bench: bool) -> bool:
    def _run(conn):
        cur = conn.cursor()
        cur.execute(
            "SELECT date, close FROM price_cache WHERE symbol=? AND date>=? ORDER BY date ASC",
            (symbol, start_date),
        )
        rows = _fetch_rows(cur)
        return rows

    rows = with_conn(_run)
    if not rows or len(rows) < 2:
        return False
    df = pd.DataFrame(rows)
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    if df["close"].isna().any():
        return True
    if (df["close"] <= 0).any():
        return True
    c = df["close"].astype(float)
    pct = c.pct_change().abs().dropna()
    if len(pct) == 0:
        return False
    max_jump = MAX_DAILY_JUMP_BENCH if is_bench else MAX_DAILY_JUMP_STOCK
    return bool((pct > max_jump).any())


def _overwrite_price_cache(symbol: str, start_date: str, history: List[Dict[str, Any]]) -> None:
    if not history:
        return
    df = pd.DataFrame(history)
    if df.empty:
        return
    df = df.rename(columns={"d": "date"})
    df["date"] = df["date"].astype(str)
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df = df.dropna()
    df = df[df["close"] > 0].copy()
    if df.empty:
        return

    def _run(conn):
        cur = conn.cursor()
        cur.execute("DELETE FROM price_cache WHERE symbol=? AND date>=?", (symbol, start_date))
        cur.executemany(
            "INSERT OR REPLACE INTO price_cache(symbol, date, close) VALUES(?,?,?)",
            [(symbol, str(r["date"]), float(r["close"])) for _, r in df.iterrows()],
        )
        conn.commit()

    with_conn(_run)


def _get_last_price_date(symbol: str) -> Optional[str]:
    def _run(conn):
        cur = conn.cursor()
        cur.execute("SELECT MAX(date) as d FROM price_cache WHERE symbol=?", (symbol,))
        row = cur.fetchone()
        if not row:
            return None
        if isinstance(row, dict):
            return row.get("d")
        return row[0]

    return with_conn(_run)


def get_price_on_or_before(symbol: str, date_iso: str) -> Optional[float]:
    def _run(conn):
        cur = conn.cursor()
        cur.execute(
            "SELECT close FROM price_cache WHERE symbol=? AND date<=? ORDER BY date DESC LIMIT 1",
            (symbol, date_iso),
        )
        row = cur.fetchone()
        if not row:
            return None
        if isinstance(row, dict):
            return row.get("close")
        return row[0]

    value = with_conn(_run)
    try:
        return float(value) if value is not None else None
    except Exception:
        return None


def last_cached_close(symbol: str) -> Optional[float]:
    def _run(conn):
        cur = conn.cursor()
        cur.execute("SELECT close FROM price_cache WHERE symbol=? ORDER BY date DESC LIMIT 1", (symbol,))
        row = cur.fetchone()
        if not row:
            return None
        if isinstance(row, dict):
            return row.get("close")
        return row[0]

    value = with_conn(_run)
    try:
        return float(value) if value is not None else None
    except Exception:
        return None


def _fetch_history_schwab(symbol: str, start_date: str) -> List[Dict[str, Any]]:
    if not schwab.can_use_marketdata():
        return []
    history = schwab.get_price_history(symbol, start_date)
    out = []
    for row in history:
        d = row.get("date") or row.get("d")
        close = row.get("close")
        if not d or close is None:
            continue
        try:
            out.append({"date": str(d), "close": float(close)})
        except Exception:
            continue
    return out


def _fetch_history_stooq(symbol: str, start_date: str) -> List[Dict[str, Any]]:
    history = stooq.get_history(symbol, start_date)
    out = []
    for row in history:
        d = row.get("date") or row.get("d")
        close = row.get("close")
        if not d or close is None:
            continue
        try:
            out.append({"date": str(d), "close": float(close)})
        except Exception:
            continue
    return out


def _fetch_history_primary(symbol: str, start_date: str, is_bench: bool) -> List[Dict[str, Any]]:
    history = _fetch_history_schwab(symbol, start_date)
    if history:
        df = _sanitize_price_df(pd.DataFrame(history), is_bench)
        return [{"date": row["date"], "close": row["close"]} for _, row in df.iterrows()]
    history = _fetch_history_stooq(symbol, start_date)
    if history:
        df = _sanitize_price_df(pd.DataFrame(history), is_bench)
        return [{"date": row["date"], "close": row["close"]} for _, row in df.iterrows()]
    return []


def ensure_symbol_history(symbol: str, start_date: str, is_bench: bool = False) -> bool:
    symbol = (symbol or "").strip().upper()
    if is_bench:
        symbol = normalize_benchmark_symbol(symbol)
    if not symbol:
        return False
    start_iso = parse_iso_date(start_date) or year_start_date()
    if is_option_symbol(symbol):
        return last_cached_close(symbol) is not None

    def _count(conn):
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) as cnt FROM price_cache WHERE symbol=? AND date>=?", (symbol, start_iso))
        row = cur.fetchone()
        if not row:
            return 0
        if isinstance(row, dict):
            return int(row.get("cnt") or 0)
        return int(row[0] or 0)

    have = with_conn(_count)
    need_refetch = have < 25
    if not need_refetch and _detect_cached_corruption(symbol, start_iso, is_bench):
        need_refetch = True

    if need_refetch:
        try:
            history = _fetch_history_primary(symbol, start_iso, is_bench)
        except Exception:
            history = []
        if history:
            _overwrite_price_cache(symbol, start_iso, history)

    return last_cached_close(symbol) is not None


def fetch_prices_incremental(symbol: str, lookback_iso: str, is_bench: bool = False) -> bool:
    if settings.static_mode:
        return last_cached_close(symbol) is not None
    try:
        last_date = _get_last_price_date(symbol)
        if last_date:
            try:
                last_dt = date.fromisoformat(str(last_date))
                if last_dt >= date.today():
                    return True
            except Exception:
                pass
        fetch_from = last_date or lookback_iso
        history = _fetch_history_primary(symbol, fetch_from, is_bench)
        if history:
            _overwrite_price_cache(symbol, fetch_from, history)
        return True
    except Exception:
        return False


def get_bench_series(bench_symbol: Optional[str] = None, start_date: Optional[str] = None) -> pd.DataFrame:
    bench = normalize_benchmark_symbol(bench_symbol or _get_benchmark())
    start_iso = parse_iso_date(start_date) or _get_bench_start()
    ensure_symbol_history(bench, start_iso, is_bench=True)

    def _run(conn):
        cur = conn.cursor()
        candidates = [bench]
        for alias in ("^GSPC", "^SPX", "SPX", "$SPX"):
            if alias not in candidates:
                candidates.append(alias)
        # Proxy fallback when index history is unavailable from provider/cache.
        if bench in {"^GSPC", "^SPX", "SPX", "$SPX"} and "SPY" not in candidates:
            candidates.append("SPY")
        for candidate in candidates:
            cur.execute(
                "SELECT date, close FROM price_cache WHERE symbol=? AND date>=? ORDER BY date ASC",
                (candidate, start_iso),
            )
            rows = _fetch_rows(cur)
            if len(rows) >= 2:
                return rows
        return []

    rows = with_conn(_run)
    df = pd.DataFrame(rows)
    df = df.rename(columns={"date": "d", "close": "close"})
    df = _sanitize_price_df(df.rename(columns={"d": "date"}), is_bench=True)
    if df is None or len(df) < 2:
        return pd.DataFrame(columns=["d", "close", "ret"])
    df = df.rename(columns={"date": "d"})
    c0 = float(df.iloc[0]["close"])
    if c0 <= 0:
        return pd.DataFrame(columns=["d", "close", "ret"])
    df["ret"] = (df["close"].astype(float) / c0 - 1.0) * 100.0
    return df


def warm_position_history_cache(account: Optional[str] = None) -> Dict[str, Any]:
    bench = _get_benchmark()
    bench_start = _get_bench_start()
    bench_ok = ensure_symbol_history(bench, bench_start, is_bench=True)
    start_map = _position_symbol_start_map(account, bench_start)
    warmed = 0
    for symbol, start_iso in start_map.items():
        if is_option_symbol(symbol):
            continue
        if ensure_symbol_history(symbol, start_iso, is_bench=False):
            warmed += 1
    return {"ok": True, "bench": bench_ok, "symbols": warmed}


# ----------------------------
# Quotes
# ----------------------------

def _get_cached_quote(symbol: str) -> Optional[float]:
    if symbol in QUOTE_CACHE:
        price, ts = QUOTE_CACHE[symbol]
        if time.time() - ts < QUOTE_CACHE_TTL:
            return price
        del QUOTE_CACHE[symbol]
    return None


def _cache_quote(symbol: str, price: float) -> None:
    QUOTE_CACHE[symbol] = (price, time.time())


def snapshot_quotes_into_cache(symbols: List[str], date_iso: str) -> None:
    if not settings.live_quotes:
        return
    date_iso = parse_iso_date(date_iso) or today_str()
    syms = [str(s).strip().upper() for s in (symbols or []) if str(s).strip()]
    if not syms:
        return

    def _missing(conn):
        cur = conn.cursor()
        qmarks = ",".join(["?"] * len(syms))
        cur.execute(
            f"SELECT symbol FROM price_cache WHERE date=? AND symbol IN ({qmarks})",
            [date_iso] + syms,
        )
        rows = _fetch_rows(cur)
        have = {str(r.get("symbol")).strip().upper() for r in rows}
        return [s for s in syms if s not in have]

    missing = with_conn(_missing)
    if not missing:
        return

    eq_syms = [s for s in missing if not is_option_symbol(s)]
    op_syms = [s for s in missing if is_option_symbol(s)]

    quotes: Dict[str, float] = {}
    if eq_syms and schwab.can_use_marketdata():
        try:
            qmap = schwab.get_quotes(eq_syms, as_map=True)
            for sym, q in qmap.items():
                price = q.get("price") if isinstance(q, dict) else None
                if price:
                    quotes[sym.upper()] = float(price)
        except Exception:
            quotes = {}
    if eq_syms and not quotes:
        try:
            tickers = stooq.get_quotes(eq_syms)
            for row in tickers or []:
                symbol = (row.get("ticker") or row.get("sym") or row.get("symbol") or "").upper()
                if not symbol:
                    continue
                trade = row.get("lastTrade") or row.get("last_trade") or row.get("trade") or {}
                last = float(trade.get("price") or trade.get("p") or 0)
                quote = row.get("lastQuote") or row.get("quote") or {}
                bid = float(quote.get("bid") or quote.get("bp") or 0)
                ask = float(quote.get("ask") or quote.get("ap") or 0)
                price = last or ((bid + ask) / 2.0 if bid and ask else bid or ask)
                if price:
                    quotes[symbol] = float(price)
        except Exception:
            pass

    if op_syms and schwab.can_use_marketdata():
        try:
            marks = schwab.get_option_marks(op_syms)
            for sym, price in marks.items():
                if price:
                    quotes[sym.upper()] = float(price)
        except Exception:
            pass

    if not quotes:
        return

    def _run(conn):
        cur = conn.cursor()
        for sym, price in quotes.items():
            try:
                price_f = float(price)
            except Exception:
                continue
            if price_f <= 0:
                continue
            cur.execute(
                "INSERT OR REPLACE INTO price_cache(symbol, date, close) VALUES(?,?,?)",
                (sym, date_iso, price_f),
            )
        conn.commit()

    with_conn(_run)


# ----------------------------
# Cash and positions
# ----------------------------

def compute_cash_balance_total(account: Optional[str] = None) -> float:
    label = _account_label(account)
    if settings.static_mode:
        def _run(conn):
            cur = conn.cursor()
            if label == "ALL":
                cur.execute("SELECT COALESCE(SUM(cash),0) AS total FROM accounts WHERE account != 'ALL'")
                row = cur.fetchone()
                return float(row.get("total") if isinstance(row, dict) else row[0] or 0.0)
            cur.execute("SELECT cash FROM accounts WHERE account=?", (label,))
            row = cur.fetchone()
            return float(row.get("cash") if isinstance(row, dict) else row[0] or 0.0) if row else 0.0
        return with_conn(_run)
    if label == "ALL":
        def _load_accounts(conn):
            cur = conn.cursor()
            cur.execute("SELECT account FROM accounts WHERE account != 'ALL'")
            return [row.get("account") if isinstance(row, dict) else row[0] for row in cur.fetchall()]

        accounts = with_conn(_load_accounts)
        if accounts:
            total = 0.0
            for acct in accounts:
                try:
                    total += compute_cash_balance_total(acct)
                except Exception:
                    continue
            return float(total)

    start_cash, anchor_asof = _get_cash_anchor_info(label)
    if start_cash is None:
        start_cash = _get_start_cash(label)

    def _run(conn):
        cur = conn.cursor()
        where, params = _account_where(conn, label)
        cash_params = list(params)
        trade_params = list(params)
        cash_filter = ""
        trade_filter = ""
        if anchor_asof:
            cash_filter = " AND date > ?"
            trade_filter = " AND trade_date > ?"
            cash_params.append(anchor_asof)
            trade_params.append(anchor_asof)
        cur.execute(f"SELECT COALESCE(SUM(amount),0) as total FROM cash_flows WHERE {where}{cash_filter}", cash_params)
        row = cur.fetchone()
        cash_adj = float(row.get("total") if isinstance(row, dict) else row[0] or 0.0)
        cur.execute(
            f"""
            SELECT COALESCE(SUM(cash_flow),0) as total
            FROM trades
            WHERE {where}{trade_filter}
              AND (trade_type IS NULL OR UPPER(trade_type) != 'IMPORT')
              AND (source IS NULL OR UPPER(source) != 'CSV_IMPORT')
            """,
            trade_params,
        )
        row = cur.fetchone()
        trade_flow = float(row.get("total") if isinstance(row, dict) else row[0] or 0.0)
        return cash_adj, trade_flow

    cash_adj, trade_flow = with_conn(_run)
    return float(float(start_cash) + cash_adj + trade_flow)


def _compute_short_market_value(positions: pd.DataFrame) -> float:
    if positions is None or positions.empty:
        return 0.0
    qty = positions["qty"].astype(float).to_numpy()
    last = positions["price"].astype(float).to_numpy()
    mult = positions["multiplier"].astype(float).to_numpy()
    return float(np.sum(np.where(qty < 0, (-qty) * last * mult, 0.0)))


def compute_cash_available(cash_total: float, positions: pd.DataFrame) -> float:
    short_mv = _compute_short_market_value(positions)
    locked = (SHORT_PROCEEDS_LOCK_PCT + SHORT_EXTRA_MARGIN_PCT) * short_mv
    return float(cash_total - locked)


def _load_positions_df(account: Optional[str]) -> pd.DataFrame:
    def _run(conn):
        where, params = _account_where(conn, account)
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT p.account, p.instrument_id, p.qty, p.price, p.market_value, p.avg_cost, p.sector,
                   p.owner, p.entry_date, p.strategy, p.strategy_id, p.strategy_name,
                   i.symbol, i.asset_class, i.underlying, i.expiry, i.strike, i.option_type, i.multiplier
            FROM positions p
            LEFT JOIN instruments i ON p.instrument_id = i.id
            WHERE {where}
            """,
            params,
        )
        rows = _fetch_rows(cur)
        return rows

    rows = with_conn(_run)
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["symbol"] = df["symbol"].fillna("").astype(str).str.upper()
    if "instrument_id" in df.columns:
        missing = df["symbol"] == ""
        if missing.any():
            df.loc[missing, "symbol"] = df.loc[missing, "instrument_id"].astype(str).str.split(":").str[0].str.upper()
    df["qty"] = pd.to_numeric(df["qty"], errors="coerce").fillna(0.0)
    df["avg_cost"] = pd.to_numeric(df["avg_cost"], errors="coerce").fillna(0.0)
    df["price"] = pd.to_numeric(df["price"], errors="coerce").fillna(0.0)
    df["market_value"] = pd.to_numeric(df["market_value"], errors="coerce").fillna(0.0)
    df["multiplier"] = pd.to_numeric(df["multiplier"], errors="coerce").fillna(1.0)
    df["asset_class"] = df["asset_class"].fillna("equity").astype(str).str.lower()
    df["underlying"] = df["underlying"].fillna("").astype(str).str.upper()
    df["expiry"] = df["expiry"].fillna("").astype(str)
    df["option_type"] = df["option_type"].fillna("").astype(str).str.upper()
    df["sector"] = df["sector"].fillna("").astype(str)
    df["owner"] = df["owner"].fillna("").astype(str)
    df["entry_date"] = df["entry_date"].map(parse_iso_date).fillna("")
    df["strategy"] = df["strategy"].fillna("").astype(str)
    df["strategy_id"] = df["strategy_id"].fillna("").astype(str)
    df["strategy_name"] = df["strategy_name"].fillna("").astype(str)
    df["strike"] = pd.to_numeric(df["strike"], errors="coerce").fillna(0.0)
    missing_under = df["underlying"] == ""
    if missing_under.any():
        df.loc[missing_under, "underlying"] = df.loc[missing_under, "symbol"].map(infer_underlying_from_symbol)

    label = _account_label(account)
    if label == "ALL":
        group_cols = [
            "instrument_id",
            "symbol",
            "asset_class",
            "underlying",
            "expiry",
            "strike",
            "option_type",
            "multiplier",
            "sector",
            "owner",
            "strategy",
            "strategy_id",
            "strategy_name",
        ]
        def _weighted_avg(values: pd.Series) -> float:
            if values.empty:
                return 0.0
            weights = np.abs(df.loc[values.index, "qty"].to_numpy(dtype=float))
            total = float(np.sum(weights))
            if total <= 0:
                return float(np.mean(values))
            return float(np.sum(values.to_numpy(dtype=float) * weights) / total)

        agg = df.groupby(group_cols, as_index=False, dropna=False).agg(
            {
                "qty": "sum",
                "market_value": "sum",
                "price": "mean",
                "avg_cost": _weighted_avg,
                "entry_date": "min",
            }
        )
        df = agg
    return df


def build_positions_live(pricing_date_iso: str, start_date_iso: str, account: Optional[str] = None) -> pd.DataFrame:
    close_expired_options(account=account)
    pos = _load_positions_df(account)
    if pos is None or pos.empty:
        return pd.DataFrame(columns=[
            "symbol",
            "instrument_id",
            "asset_class",
            "underlying",
            "expiry",
            "strike",
            "option_type",
            "multiplier",
            "qty",
            "avg_cost",
            "price",
            "market_value",
            "day_pnl",
            "total_pnl",
            "day_pnl_pct",
            "total_pnl_pct",
            "owner",
            "entry_date",
            "sector",
            "strategy",
            "strategy_id",
            "strategy_name",
        ])

    pricing_date_iso = parse_iso_date(pricing_date_iso) or today_str()
    syms = [str(s).strip().upper() for s in pos["symbol"].astype(str).tolist() if str(s).strip()]
    if settings.live_quotes and not settings.static_mode:
        snapshot_quotes_into_cache(syms, pricing_date_iso)

    last_map: Dict[str, float] = {}
    prev_map: Dict[str, float] = {}
    if not settings.static_mode and settings.live_quotes and syms:
        def _prices(conn):
            cur = conn.cursor()
            qmarks = ",".join(["?"] * len(syms))
            cur.execute(
                f"SELECT symbol, date, close FROM price_cache WHERE symbol IN ({qmarks}) AND date<=? ORDER BY symbol, date",
                syms + [pricing_date_iso],
            )
            return _fetch_rows(cur)

        price_rows = with_conn(_prices)
        price_df = pd.DataFrame(price_rows)
        if not price_df.empty:
            price_df["date"] = price_df["date"].astype(str)
            price_df["close"] = pd.to_numeric(price_df["close"], errors="coerce").fillna(0.0)
            for sym, group in price_df.groupby("symbol"):
                group = group.sort_values("date")
                last = group.iloc[-1]["close"] if len(group) else 0.0
                last_map[str(sym).upper()] = float(last)
                prev = group.iloc[-2]["close"] if len(group) >= 2 else float(last)
                prev_map[str(sym).upper()] = float(prev)

    prices = []
    day_pnl = []
    total_pnl = []
    day_pnl_pct = []
    total_pnl_pct = []

    for _, row in pos.iterrows():
        sym = str(row.get("symbol") or "").upper()
        qty = float(row.get("qty") or 0.0)
        avg_cost = float(row.get("avg_cost") or 0.0)
        mult = float(row.get("multiplier") or 1.0)
        last = last_map.get(sym)
        if last is None or last <= 0:
            last = float(row.get("price") or 0.0)
        if last <= 0 and not settings.static_mode:
            last = last_cached_close(sym) or 0.0
        prev = prev_map.get(sym)
        if prev is None or prev <= 0:
            prev = last
        prices.append(last)
        mv = qty * last * mult
        tot = qty * (last - avg_cost) * mult
        dpnl = qty * (last - prev) * mult
        total_pnl.append(tot)
        day_pnl.append(dpnl)
        total_pnl_pct.append(((last / avg_cost) - 1.0) * 100.0 if avg_cost else 0.0)
        day_pnl_pct.append(((last / prev) - 1.0) * 100.0 if prev else 0.0)

    out = pos.copy()
    out["price"] = prices
    out["market_value"] = out["qty"].astype(float) * out["price"].astype(float) * out["multiplier"].astype(float)
    out["day_pnl"] = day_pnl
    out["total_pnl"] = total_pnl
    out["day_pnl_pct"] = day_pnl_pct
    out["total_pnl_pct"] = total_pnl_pct
    out["owner"] = out["owner"].fillna("")
    out["entry_date"] = out["entry_date"].fillna("")
    out["strategy"] = out["strategy"].fillna("")
    out["strategy_id"] = out["strategy_id"].fillna("")
    out["strategy_name"] = out["strategy_name"].fillna("")
    out["sector"] = out["sector"].fillna("")
    out["instrument_id"] = out["instrument_id"].fillna("")
    out["asset_class"] = out["asset_class"].fillna("equity").astype(str).str.lower()
    out["underlying"] = out["underlying"].fillna("")
    out["expiry"] = out["expiry"].fillna("")
    out["option_type"] = out["option_type"].fillna("")
    out["strike"] = out["strike"].fillna(0.0)
    return out


# ----------------------------
# NAV series
# ----------------------------

def _nav_cache_key(limit: int, account: Optional[str]) -> str:
    return f"nav:{_account_label(account)}:{int(limit)}"


def _get_nav_cache(limit: int, account: Optional[str]) -> Optional[List[Dict[str, Any]]]:
    key = _nav_cache_key(limit, account)
    cached = NAV_CACHE.get(key)
    if not cached:
        return None
    ts, data = cached
    if time.time() - ts > NAV_CACHE_TTL:
        return None
    return data


def _set_nav_cache(limit: int, account: Optional[str], data: List[Dict[str, Any]]) -> None:
    NAV_CACHE[_nav_cache_key(limit, account)] = (time.time(), data)


def _clear_nav_cache() -> None:
    NAV_CACHE.clear()


def _fallback_business_dates(start_iso: str, end_iso: str) -> List[str]:
    try:
        start = pd.to_datetime(start_iso)
    except Exception:
        start = pd.to_datetime(year_start_date())
    try:
        end = pd.to_datetime(end_iso)
    except Exception:
        end = pd.to_datetime(today_str())
    if start > end:
        start = end - pd.Timedelta(days=60)
    idx = pd.bdate_range(start=start, end=end)
    if len(idx) < 2:
        idx = pd.date_range(start=start, end=end, freq="D")
    return [d.date().isoformat() for d in idx]


def build_daily_nav_series(start_iso: str, bench_series: pd.DataFrame, account: Optional[str] = None) -> pd.DataFrame:
    close_expired_options(account=account)
    anchor_cash, anchor_asof = _get_cash_anchor_info(account)
    start_cash = anchor_cash if anchor_cash is not None else _get_start_cash(account)
    start_iso = parse_iso_date(start_iso) or year_start_date()
    account_value = _get_account_value(account)

    if bench_series is not None and len(bench_series) >= 2:
        dates = bench_series["d"].astype(str).tolist()
    else:
        dates = _fallback_business_dates(start_iso, today_str())
    if not dates:
        return pd.DataFrame(columns=["d", "nav", "ret", "day_pl"])

    def _load_trades(conn):
        where, params = _account_where(conn, account)
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT trade_date, symbol, qty, side, cash_flow, multiplier, trade_type, source
            FROM trades
            WHERE trade_date>=? AND {where}
            ORDER BY trade_date ASC, ts ASC
            """,
            [dates[0]] + params,
        )
        return _fetch_rows(cur)

    def _load_cash(conn):
        where, params = _account_where(conn, account)
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT date, amount
            FROM cash_flows
            WHERE date>=? AND {where}
            ORDER BY date ASC, id ASC
            """,
            [dates[0]] + params,
        )
        return _fetch_rows(cur)

    trades = with_conn(_load_trades)
    cash_rows = with_conn(_load_cash)

    if settings.static_mode and account_value is not None and not trades and not cash_rows:
        nav = np.full(len(dates), float(account_value), dtype=float)
        nav_begin = nav[0] if abs(nav[0]) > 1e-12 else 1.0
        day_pl = np.concatenate([[0.0], np.diff(nav)])
        ret = (nav / nav_begin - 1.0) * 100.0
        twr = np.ones(len(nav), dtype=float)
        return pd.DataFrame({"d": dates, "nav": nav, "day_pl": day_pl, "ret": ret, "twr": twr})

    cash_rows_for_cash = cash_rows
    if anchor_asof:
        cash_rows_for_cash = [row for row in cash_rows if str(row.get("date") or "") > anchor_asof]

    first_trade_date = None
    if trades:
        try:
            first_trade_date = min(str(r.get("trade_date")) for r in trades if r.get("trade_date"))
        except Exception:
            first_trade_date = None
    nav_anchor = None
    if anchor_asof and first_trade_date:
        nav_anchor = min(anchor_asof, first_trade_date)
    else:
        nav_anchor = anchor_asof or first_trade_date

    pos_now = _load_positions_df(account)
    syms = set()
    if trades:
        syms |= {str(r.get("symbol")).upper() for r in trades if r.get("symbol")}
    if pos_now is not None and not pos_now.empty:
        syms |= set(pos_now["symbol"].astype(str).str.upper().tolist())
    syms = sorted([s for s in syms if s and s != "NAN"])
    symbol_start_map = _symbol_start_map_from_positions_df(pos_now, start_iso)
    for trade in trades:
        sym = str(trade.get("symbol") or "").strip().upper()
        trade_date = parse_iso_date(trade.get("trade_date"))
        if not sym or not trade_date or is_option_symbol(sym):
            continue
        prev = symbol_start_map.get(sym)
        if not prev or trade_date < prev:
            symbol_start_map[sym] = trade_date

    if not syms:
        cash_adj = pd.Series(dtype=float)
        cash_series = pd.Series(index=pd.to_datetime(dates), dtype=float).fillna(0.0)
        ext_flow = pd.Series(0.0, index=cash_series.index)
        if cash_rows_for_cash:
            cash_df = pd.DataFrame(cash_rows_for_cash)
            cash_df["date"] = cash_df["date"].astype(str)
            cash_df["amount"] = pd.to_numeric(cash_df["amount"], errors="coerce").fillna(0.0)
            cash_adj = cash_df.groupby("date")["amount"].sum()
            ext_flow += cash_adj.reindex(ext_flow.index.strftime("%Y-%m-%d")).fillna(0.0).to_numpy(dtype=float)
        if len(cash_adj):
            cash_series = cash_series.add(cash_adj.reindex(cash_series.index.strftime("%Y-%m-%d")).values, fill_value=0.0)
        cash_cum = cash_series.cumsum() + start_cash
        nav = cash_cum.values
        nav_begin = nav[0] if abs(nav[0]) > 1e-12 else 1.0
        day_pl = np.concatenate([[0.0], np.diff(nav)])
        ret = (nav / nav_begin - 1.0) * 100.0
        twr = np.ones(len(nav), dtype=float)
        for i in range(1, len(nav)):
            denom = nav[i - 1]
            flow = float(ext_flow.iloc[i]) if len(ext_flow) else 0.0
            if abs(denom) > 1e-12:
                r = (nav[i] - nav[i - 1] - flow) / denom
                twr[i] = twr[i - 1] * (1.0 + r)
            else:
                twr[i] = twr[i - 1]
        return pd.DataFrame({"d": dates, "nav": nav, "day_pl": day_pl, "ret": ret, "twr": twr})

    for s in syms:
        if not is_option_symbol(s):
            ensure_symbol_history(s, symbol_start_map.get(s, start_iso), is_bench=False)

    def _load_prices(conn):
        cur = conn.cursor()
        qmarks = ",".join(["?"] * len(syms))
        cur.execute(
            f"SELECT symbol, date, close FROM price_cache WHERE date>=? AND symbol IN ({qmarks}) ORDER BY date ASC",
            [dates[0]] + syms,
        )
        return _fetch_rows(cur)

    price_rows = with_conn(_load_prices)
    px = pd.DataFrame(price_rows)
    if px.empty:
        px = pd.DataFrame(columns=["symbol", "date", "close"])
    px["symbol"] = px["symbol"].astype(str).str.upper()
    px["date"] = px["date"].astype(str)
    px["close"] = pd.to_numeric(px["close"], errors="coerce")
    px = px.dropna(subset=["close"])
    px = px[px["close"] > 0].copy()

    date_index = pd.to_datetime(dates)
    if len(px):
        px_piv = px.pivot_table(index="date", columns="symbol", values="close", aggfunc="last")
        px_piv.index = pd.to_datetime(px_piv.index)
        px_piv = px_piv.reindex(date_index).sort_index().ffill().bfill().fillna(0.0)
    else:
        px_piv = pd.DataFrame(index=date_index, columns=syms).fillna(0.0)

    mult_map = {}
    if syms:
        def _load_mult(conn):
            cur = conn.cursor()
            qmarks = ",".join(["?"] * len(syms))
            cur.execute(
                f"SELECT symbol, multiplier FROM instruments WHERE symbol IN ({qmarks})",
                syms,
            )
            return _fetch_rows(cur)

        rows = with_conn(_load_mult)
        for row in rows:
            try:
                mult_map[str(row.get("symbol")).upper()] = float(row.get("multiplier") or 1.0)
            except Exception:
                continue
    for s in syms:
        if s not in mult_map:
            mult_map[s] = contract_multiplier(s)

    tr = pd.DataFrame(trades) if trades else pd.DataFrame()
    baseline_qty: Dict[str, float] = {}
    if pos_now is not None and not pos_now.empty:
        try:
            baseline_qty = (
                pos_now.groupby("symbol")["qty"].sum().astype(float).to_dict()
            )
        except Exception:
            baseline_qty = {}

    if not tr.empty:
        tr["symbol"] = tr["symbol"].astype(str).str.upper()
        tr["trade_date"] = tr["trade_date"].astype(str)
        tr["qty"] = pd.to_numeric(tr["qty"], errors="coerce").fillna(0.0)
        tr["side"] = tr["side"].astype(str).str.upper()
        tr["trade_type"] = tr.get("trade_type", "").astype(str).str.upper()
        tr["source"] = tr.get("source", "").astype(str).str.upper()
        tr["is_import"] = (tr["trade_type"] == "IMPORT") | (tr["source"] == "CSV_IMPORT")
        tr_effective = tr[~tr["is_import"]].copy()
    else:
        tr_effective = pd.DataFrame()

    pre_anchor_syms: set[str] = set()
    if anchor_asof and not tr_effective.empty:
        try:
            pre_anchor_syms = set(
                tr_effective.loc[tr_effective["trade_date"] < anchor_asof, "symbol"].tolist()
            )
        except Exception:
            pre_anchor_syms = set()

    if tr_effective.empty:
        qty_piv = pd.DataFrame(index=date_index, columns=syms).fillna(0.0)
    else:
        tr_effective["signed_qty"] = np.where(tr_effective["side"] == "BUY", tr_effective["qty"], -tr_effective["qty"])
        agg = tr_effective.groupby(["trade_date", "symbol"], as_index=False)["signed_qty"].sum()
        qty_piv = agg.pivot_table(index="trade_date", columns="symbol", values="signed_qty", aggfunc="sum").fillna(0.0)
        qty_piv.index = pd.to_datetime(qty_piv.index)
        qty_piv = qty_piv.reindex(date_index).fillna(0.0).cumsum()

    if baseline_qty:
        baseline_start_map = _symbol_start_map_from_positions_df(pos_now, dates[0])
        for sym, qty in baseline_qty.items():
            if sym in pre_anchor_syms:
                continue
            if sym not in qty_piv.columns:
                qty_piv[sym] = 0.0
            qty_piv[sym] = qty_piv[sym].astype(float)
            start_for_symbol = parse_iso_date(baseline_start_map.get(sym) or dates[0]) or dates[0]
            mask = qty_piv.index >= pd.to_datetime(start_for_symbol)
            if mask.any():
                qty_piv.loc[mask, sym] = qty_piv.loc[mask, sym].astype(float) + float(qty)

    mv = np.zeros(len(date_index), dtype=float)
    for s in syms:
        if s in px_piv.columns:
            qty_vec = qty_piv.get(s, 0.0).to_numpy(dtype=float)
            mv += np.abs(qty_vec) * px_piv[s].to_numpy(dtype=float) * float(mult_map.get(s, 1.0))

    cash_day = pd.Series(0.0, index=date_index)
    ext_flow = pd.Series(0.0, index=date_index)
    if cash_rows_for_cash:
        cl = pd.DataFrame(cash_rows_for_cash)
        cl["date"] = cl["date"].astype(str)
        cl["amount"] = pd.to_numeric(cl["amount"], errors="coerce").fillna(0.0)
        cash_adj = cl.groupby("date")["amount"].sum()
        cash_vals = cash_adj.reindex(cash_day.index.strftime("%Y-%m-%d")).fillna(0.0).to_numpy(dtype=float)
        cash_day += cash_vals
        ext_flow += cash_vals

    if trades:
        tr = pd.DataFrame(trades)
        if "cash_flow" in tr.columns:
            tr["cash_flow"] = pd.to_numeric(tr["cash_flow"], errors="coerce").fillna(0.0)
            if anchor_asof:
                tr = tr[tr["trade_date"].astype(str) > anchor_asof]
            flow_day = tr.groupby("trade_date")["cash_flow"].sum()
            cash_day += flow_day.reindex(cash_day.index.strftime("%Y-%m-%d")).fillna(0.0).to_numpy(dtype=float)

    cash_cum = cash_day.cumsum().to_numpy(dtype=float) + float(start_cash)
    nav = cash_cum + mv

    nav_begin = nav[0] if abs(nav[0]) > 1e-12 else 1.0
    day_pl = np.concatenate([[0.0], np.diff(nav)])
    ret = (nav / nav_begin - 1.0) * 100.0

    twr = np.ones(len(nav), dtype=float)
    for i in range(1, len(nav)):
        denom = nav[i - 1]
        flow = float(ext_flow.iloc[i]) if len(ext_flow) else 0.0
        if abs(denom) > 1e-12:
            r = (nav[i] - nav[i - 1] - flow) / denom
            twr[i] = twr[i - 1] * (1.0 + r)
        else:
            twr[i] = twr[i - 1]

    return pd.DataFrame({"d": dates, "nav": nav, "day_pl": day_pl, "ret": ret, "twr": twr})


def get_nav_series(limit: int = 120, account: Optional[str] = None) -> List[Dict[str, Any]]:
    cached = _get_nav_cache(limit, account)
    if cached is not None:
        return cached
    start_iso = _effective_nav_start(account)
    snapshot_points: List[Dict[str, Any]] = []
    if settings.static_mode:
        snapshot_points = _get_nav_series_from_snapshots(limit=limit, account=account)
        if snapshot_points and not _has_trade_or_entry_data(account):
            _set_nav_cache(limit, account, snapshot_points)
            return snapshot_points
    bench_series = get_bench_series(start_date=start_iso)
    nav_df = build_daily_nav_series(start_iso, bench_series, account=account)
    if nav_df is None or nav_df.empty:
        if snapshot_points:
            _set_nav_cache(limit, account, snapshot_points)
            return snapshot_points
        return []
    nav_df = nav_df.tail(int(limit))
    bench_map = {}
    if bench_series is not None and len(bench_series):
        bench_map = {str(r["d"]): float(r["close"]) for _, r in bench_series.iterrows()}
    points = []
    for _, row in nav_df.iterrows():
        d = str(row["d"])
        twr_val = None
        try:
            if "twr" in nav_df.columns:
                twr_val = float(row["twr"])
        except Exception:
            twr_val = None
        points.append(
            {
                "date": d,
                "nav": float(row["nav"]),
                "bench": float(bench_map.get(d, row["nav"])) if bench_map else float(row["nav"]),
                "twr": twr_val,
            }
        )
    _set_nav_cache(limit, account, points)
    return points


def _get_nav_series_from_snapshots(limit: int = 120, account: Optional[str] = None) -> List[Dict[str, Any]]:
    label = _account_label(account)
    # Build bench_map: date -> raw close price (e.g. SPX index)
    bench_map: Dict[str, float] = {}
    try:
        bench_series = get_bench_series()
        if bench_series is not None and len(bench_series):
            bench_map = {str(r["d"]): float(r["close"]) for _, r in bench_series.iterrows()}
    except Exception:
        bench_map = {}

    def _run(conn):
        cur = conn.cursor()
        rows: List[Dict[str, Any]] = []
        if label == "ALL":
            cur.execute(
                """
                SELECT date, SUM(nav) as nav, MAX(bench) as bench
                FROM nav_snapshots
                WHERE account != 'ALL'
                GROUP BY date
                ORDER BY date ASC
                """
            )
            rows = _fetch_rows(cur)
            if not rows:
                cur.execute(
                    "SELECT date, nav, bench FROM nav_snapshots WHERE account='ALL' ORDER BY date ASC"
                )
                rows = _fetch_rows(cur)
        else:
            cur.execute(
                "SELECT date, nav, bench FROM nav_snapshots WHERE account=? ORDER BY date ASC",
                (label,),
            )
            rows = _fetch_rows(cur)
        return rows

    rows = with_conn(_run)
    if not rows:
        return []
    bench_start = _get_bench_start()
    if len(rows) == 1:
        try:
            first_date = str(rows[0].get("date") or "")
            if bench_start and first_date and bench_start < first_date:
                rows = [{"date": bench_start, "nav": rows[0].get("nav"), "bench": rows[0].get("bench")}] + rows
        except Exception:
            pass
    account_value = _get_account_value(account)
    today = today_str()
    if account_value is not None and (not rows or rows[-1].get("date") != today):
        # For today's bench, use raw SPX price from bench_map
        bench_today_raw = bench_map.get(today)
        rows = rows + [{"date": today, "nav": float(account_value), "bench": bench_today_raw}]

    rows = rows[-int(limit):]
    points = []
    # Track last known bench raw price for forward-fill
    last_bench_raw: Optional[float] = None
    for row in rows:
        d = str(row.get("date") or "")
        nav_val = float(row.get("nav") or 0.0)

        # Prefer live bench_map lookup over stored bench (stored bench may be nav value if bench was missing)
        bench_raw = bench_map.get(d)
        if bench_raw and bench_raw > 0:
            last_bench_raw = bench_raw

        # Use forward-filled bench raw price
        effective_bench = last_bench_raw if last_bench_raw and last_bench_raw > 0 else None

        points.append({
            "date": d,
            "nav": nav_val,
            # bench: raw price for chart normalization; None becomes nav in chart
            "bench": effective_bench,
            "twr": None,
        })

    # If no bench data at all, set bench = nav for all points so chart renders something
    if all(p["bench"] is None for p in points):
        for p in points:
            p["bench"] = p["nav"]
    else:
        # Fill None benches with nav value (chart will treat as "no bench data" gracefully)
        for p in points:
            if p["bench"] is None:
                p["bench"] = p["nav"]

    return points


# ----------------------------
# Risk metrics
# ----------------------------

def compute_var_metrics_from_nav(nav_series: pd.DataFrame, current_nav: float) -> Dict[str, float]:
    out = {"var95_pct": 0.0, "var95_usd": 0.0}
    if nav_series is None or len(nav_series) < 6:
        return out
    s = nav_series.copy()
    s["nav"] = pd.to_numeric(s["nav"], errors="coerce")
    rets = s["nav"].pct_change().dropna()
    if len(rets) < 5:
        return out
    q05 = float(np.quantile(rets.to_numpy(), 0.05))
    var95 = max(0.0, -q05)
    out["var95_pct"] = var95 * 100.0
    out["var95_usd"] = var95 * float(current_nav)
    return out


def compute_drawdown_mdd(nav_series: pd.DataFrame) -> Dict[str, float]:
    out = {"mdd_pct": 0.0}
    if nav_series is None or len(nav_series) < 2:
        return out
    x = nav_series.copy()
    x["nav"] = pd.to_numeric(x["nav"], errors="coerce")
    x = x.dropna(subset=["nav"])
    if len(x) < 2:
        return out
    nav = x["nav"].astype(float).to_numpy()
    peak = np.maximum.accumulate(nav)
    dd = np.where(peak > 0, nav / peak - 1.0, 0.0)
    out["mdd_pct"] = float(np.min(dd) * 100.0)
    return out


def compute_sharpe_sortino(nav_series: pd.DataFrame) -> Dict[str, float]:
    out = {"sharpe": 0.0, "sortino": 0.0}
    if nav_series is None or len(nav_series) < 10:
        return out
    x = nav_series.copy()
    x["nav"] = pd.to_numeric(x["nav"], errors="coerce")
    x = x.dropna(subset=["nav"])
    if len(x) < 10:
        return out
    rets = x["nav"].astype(float).pct_change().dropna()
    if len(rets) < 9:
        return out
    rf_daily = (1.0 + float(RISK_FREE_ANNUAL)) ** (1.0 / float(TRADING_DAYS)) - 1.0
    excess = rets - rf_daily
    mu = float(excess.mean())
    sd = float(excess.std(ddof=1)) if len(excess) > 1 else 0.0
    if sd > 1e-12:
        out["sharpe"] = (mu / sd) * math.sqrt(float(TRADING_DAYS))
    downside = excess[excess < 0]
    ds = float(downside.std(ddof=1)) if len(downside) > 1 else 0.0
    if ds > 1e-12:
        out["sortino"] = (mu / ds) * math.sqrt(float(TRADING_DAYS))
    return out


# ----------------------------
# Strategies
# ----------------------------

def record_strategy(strategy_id: str, underlying: str, name: str, kind: str, entry_net_price: float = 0.0, entry_units: float = 0.0) -> None:
    sid = (strategy_id or "").strip().upper()
    if not sid:
        return

    def _run(conn):
        cur = conn.cursor()
        cur.execute(
            "INSERT OR REPLACE INTO strategies(strategy_id, ts, underlying, name, kind, entry_net_price, entry_units) VALUES(?,?,?,?,?,?,?)",
            (
                sid,
                now_ts_str(),
                str(underlying or "").strip().upper(),
                str(name or "").strip(),
                str(kind or "").strip(),
                float(entry_net_price or 0.0),
                float(entry_units or 0.0),
            ),
        )
        conn.commit()

    with_conn(_run)


def get_strategy_meta_map() -> Dict[str, Dict[str, float]]:
    def _run(conn):
        cur = conn.cursor()
        cur.execute("SELECT strategy_id, entry_net_price, entry_units FROM strategies")
        return _fetch_rows(cur)

    rows = with_conn(_run)
    out: Dict[str, Dict[str, float]] = {}
    for row in rows:
        sid = str(row.get("strategy_id") or "").strip().upper()
        if not sid:
            continue
        try:
            entry_net = float(row.get("entry_net_price") or 0.0)
        except Exception:
            entry_net = 0.0
        try:
            units = float(row.get("entry_units") or 0.0)
        except Exception:
            units = 0.0
        out[sid] = {"entry_net_price": entry_net, "entry_units": units}
    return out


# ----------------------------
# Trades and positions
# ----------------------------

def _upsert_position_row(
    conn,
    account: str,
    instrument_id: str,
    qty: float,
    price: float,
    avg_cost: float,
    multiplier: float,
    sector: Optional[str],
    strategy_id: Optional[str],
    strategy_name: Optional[str],
    owner: Optional[str] = None,
    entry_date: Optional[str] = None,
) -> None:
    cur = conn.cursor()
    cur.execute(
        "SELECT owner, entry_date, sector, strategy_id, strategy_name FROM positions WHERE account=? AND instrument_id=?",
        (account, instrument_id),
    )
    existing = cur.fetchone()
    existing_owner = existing.get("owner") if isinstance(existing, dict) else (existing[0] if existing else None)
    existing_entry = existing.get("entry_date") if isinstance(existing, dict) else (existing[1] if existing else None)
    existing_sector = existing.get("sector") if isinstance(existing, dict) else (existing[2] if existing else None)
    existing_strategy_id = existing.get("strategy_id") if isinstance(existing, dict) else (existing[3] if existing else None)
    existing_strategy_name = existing.get("strategy_name") if isinstance(existing, dict) else (existing[4] if existing else None)

    owner_use = existing_owner if owner is None else owner
    entry_use = existing_entry if entry_date is None else (parse_iso_date(entry_date) or None)
    sector_use = existing_sector if sector is None else sector
    strategy_id_use = existing_strategy_id if strategy_id is None else strategy_id
    strategy_name_use = existing_strategy_name if strategy_name is None else strategy_name

    cur.execute(
        """
        INSERT OR REPLACE INTO positions(
            account, instrument_id, qty, price, market_value, avg_cost, sector, owner, entry_date, strategy, strategy_id, strategy_name
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            account,
            instrument_id,
            float(qty),
            float(price),
            float(qty) * float(price) * float(multiplier),
            float(avg_cost),
            sector_use,
            owner_use,
            entry_use,
            strategy_name_use or "",
            strategy_id_use,
            strategy_name_use,
        ),
    )


def apply_trade(payload: Dict[str, Any]) -> Tuple[bool, str, Optional[str]]:
    side = (payload.get("side") or "").strip().upper()
    symbol = (payload.get("symbol") or "").strip().upper()
    trade_date = parse_iso_date(payload.get("trade_date") or payload.get("tradeDate"))
    if not trade_date:
        return False, "Trade Date must be YYYY-MM-DD.", None
    if side not in {"BUY", "SELL"}:
        return False, "Side must be BUY or SELL.", None
    if not symbol:
        return False, "Symbol required.", None
    try:
        qty = float(payload.get("qty"))
        price = float(payload.get("price"))
    except Exception:
        return False, "Qty and Price must be numbers.", None
    if qty <= 0 or price < 0:
        return False, "Qty must be > 0 and Price >= 0.", None

    account = _account_label(payload.get("account"))
    if account == "ALL":
        return False, "Select a specific account (not ALL) to place trades.", None
    sector = (payload.get("sector") or "").strip() or None
    asset_class = (payload.get("asset_class") or payload.get("trade_type") or "equity").strip().lower()
    if asset_class == "option" or is_option_symbol(symbol):
        asset_class = "option"
    if asset_class == "equity" and futures_service.parse_future_symbol(symbol):
        asset_class = "future"

    underlying = (payload.get("underlying") or infer_underlying_from_symbol(symbol)).strip().upper()
    expiry = payload.get("expiry")
    strike = payload.get("strike")
    option_type = payload.get("option_type")

    if asset_class == "option":
        allow_zero = bool(payload.get("allow_zero_price"))
        try:
            symbol, underlying, expiry, option_type, strike = options_service.normalize_option_fields(
                symbol, underlying, expiry, option_type, strike
            )
        except Exception:
            return False, "Invalid option symbol or fields.", None
        if price <= 0:
            if not allow_zero and schwab.can_use_marketdata():
                try:
                    marks = schwab.get_option_marks([symbol])
                    if marks.get(symbol):
                        price = float(marks.get(symbol))
                except Exception:
                    pass
        if price <= 0 and not allow_zero:
            return False, "Price must be > 0.", None

    multiplier = contract_multiplier(symbol, asset_class)
    instrument_id = payload.get("instrument_id") or f"{symbol}:{asset_class.upper()}"
    strategy_id = (payload.get("strategy_id") or "").strip().upper() or None
    strategy_name = (payload.get("strategy_name") or "").strip() or None

    ts = now_ts_str()
    trade_id = payload.get("trade_id") or f"T-{int(time.time() * 1000)}"
    trade_type = (payload.get("trade_type") or asset_class).upper()
    status = "FILLED"

    # cash check for BUY (allow override for multi-leg)
    if side == "BUY" and asset_class != "future" and not payload.get("skip_cash_check"):
        start_iso = _get_bench_start()
        cash_total = compute_cash_balance_total(account)
        p_live_for_cash = build_positions_live(today_str(), start_iso, account=account)
        cash_avail = compute_cash_available(cash_total, p_live_for_cash)
        cost = qty * price * multiplier
        if cash_avail < cost:
            return False, "Not enough Cash (Avail) for this BUY.", None

    def _run(conn):
        _ensure_account(conn, account)
        _ensure_instrument(
            conn,
            instrument_id,
            {
                "id": instrument_id,
                "symbol": symbol,
                "asset_class": asset_class,
                "underlying": underlying,
                "expiry": expiry,
                "strike": strike,
                "option_type": option_type,
                "multiplier": multiplier,
            },
        )
        cur = conn.cursor()
        cur.execute(
            "SELECT qty, avg_cost, sector FROM positions WHERE account=? AND instrument_id=?",
            (account, instrument_id),
        )
        row = cur.fetchone()
        cur_qty = float(row.get("qty") if isinstance(row, dict) else (row[0] if row else 0.0) or 0.0)
        cur_cost = float(row.get("avg_cost") if isinstance(row, dict) else (row[1] if row else price) or price)
        cur_sector = row.get("sector") if isinstance(row, dict) else (row[2] if row else None)
        if not sector:
            sector_use = cur_sector
        else:
            sector_use = sector

        realized_pl = 0.0
        cost_basis = 0.0
        if side == "BUY":
            if cur_qty >= 0:
                new_qty = cur_qty + qty
                new_avg = ((cur_qty * cur_cost) + (qty * price)) / new_qty if new_qty != 0 else price
                _upsert_position_row(conn, account, instrument_id, new_qty, price, new_avg, multiplier, sector_use, strategy_id, strategy_name)
            else:
                cover_qty = min(qty, -cur_qty)
                realized_pl = cover_qty * (cur_cost - price) * multiplier
                cost_basis = cover_qty * cur_cost * multiplier
                new_qty = cur_qty + cover_qty
                if abs(new_qty) <= 1e-12:
                    cur.execute("DELETE FROM positions WHERE account=? AND instrument_id=?", (account, instrument_id))
                else:
                    _upsert_position_row(conn, account, instrument_id, new_qty, price, cur_cost, multiplier, sector_use, strategy_id, strategy_name)
        else:
            if cur_qty > 0:
                sell_qty = min(qty, cur_qty)
                realized_pl = sell_qty * (price - cur_cost) * multiplier
                cost_basis = sell_qty * cur_cost * multiplier
                remaining = cur_qty - sell_qty
                if remaining <= 1e-12:
                    cur.execute("DELETE FROM positions WHERE account=? AND instrument_id=?", (account, instrument_id))
                else:
                    _upsert_position_row(conn, account, instrument_id, remaining, price, cur_cost, multiplier, sector_use, strategy_id, strategy_name)
            else:
                new_qty = cur_qty - qty
                if cur_qty < 0:
                    new_avg = (((-cur_qty) * cur_cost) + (qty * price)) / ((-cur_qty) + qty)
                else:
                    new_avg = price
                _upsert_position_row(conn, account, instrument_id, new_qty, price, new_avg, multiplier, sector_use, strategy_id, strategy_name)

        if asset_class == "future":
            cash_flow = 0.0
        else:
            cash_flow = (qty * price * multiplier) if side == "SELL" else (-qty * price * multiplier)
        cur.execute(
            """
            INSERT INTO trades(
                trade_id, ts, trade_date, account, instrument_id, symbol, side, qty, price, trade_type, status, source,
                asset_class, underlying, expiry, strike, option_type, multiplier, strategy_id, strategy_name, sector,
                realized_pl, cost_basis, cash_flow
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                trade_id,
                ts,
                trade_date,
                account,
                instrument_id,
                symbol,
                side,
                float(qty),
                float(price),
                trade_type,
                status,
                "LOCAL",
                asset_class,
                underlying,
                expiry,
                strike,
                option_type,
                float(multiplier),
                strategy_id,
                strategy_name,
                sector_use,
                float(realized_pl),
                float(cost_basis),
                float(cash_flow),
            ),
        )
        conn.commit()

    with_conn(_run)
    if not is_option_symbol(symbol):
        history_start = parse_iso_date(trade_date)
        ensure_symbol_history(symbol, history_start or _get_bench_start(), is_bench=False)
    cache.delete_pattern("positions")
    return True, "Trade saved.", trade_id


def preview_trade(payload: Dict[str, Any]) -> Dict[str, Any]:
    symbol = (payload.get("symbol") or "").upper()
    asset_class = (payload.get("asset_class") or "equity").lower()
    if asset_class != "option" and is_option_symbol(symbol):
        asset_class = "option"
    if asset_class == "equity" and futures_service.parse_future_symbol(symbol):
        asset_class = "future"
    qty = abs(float(payload.get("qty", 0)))
    price = float(payload.get("price", 0))
    if asset_class == "option" and price < 0:
        price = abs(price)
    side = (payload.get("side") or "BUY").upper()
    multiplier = contract_multiplier(symbol, asset_class)
    cash_impact = 0.0 if asset_class == "future" else qty * price * multiplier * (-1 if side == "BUY" else 1)
    net_exposure = qty * price * multiplier * (1 if side == "BUY" else -1)
    return {
        "cash_impact": cash_impact,
        "net_exposure_impact": net_exposure,
        "notes": "Preview only. Submit to write trade.",
    }


def submit_multi(legs: List[Dict[str, Any]], strategy_id: Optional[str], strategy_name: Optional[str]) -> Dict[str, Any]:
    if not legs:
        raise ValueError("No legs provided.")
    sid = (strategy_id or f"STRAT-{int(time.time()*1000)}").strip().upper()
    sname = (strategy_name or "Multi-Leg Strategy").strip()

    # Net cash check to avoid false failures on multi-leg
    account = _account_label(legs[0].get("account") if legs else None)
    net_cash = 0.0
    for leg in legs:
        sym = (leg.get("symbol") or "").upper()
        side = (leg.get("side") or "BUY").upper()
        qty = float(leg.get("qty") or 0.0)
        price = float(leg.get("price") or 0.0)
        asset_class = (leg.get("asset_class") or "option").lower()
        mult = contract_multiplier(sym, asset_class)
        cash_flow = (qty * price * mult) if side == "SELL" else (-qty * price * mult)
        if asset_class == "future":
            cash_flow = 0.0
        net_cash += cash_flow
    if net_cash < 0:
        cash_total = compute_cash_balance_total(account)
        p_live = build_positions_live(today_str(), _get_bench_start(), account=account)
        cash_avail = compute_cash_available(cash_total, p_live)
        if cash_avail + net_cash < 0:
            raise ValueError("Not enough Cash (Avail) for multi-leg order.")

    created: List[str] = []
    for leg in legs:
        payload = dict(leg)
        payload["strategy_id"] = sid
        payload["strategy_name"] = sname
        payload["skip_cash_check"] = True
        ok, msg, trade_id = apply_trade(payload)
        if not ok:
            raise ValueError(msg)
        if trade_id:
            created.append(trade_id)
    return {"strategy_id": sid, "strategy_name": sname, "trades": created}


# ----------------------------
# Portfolio snapshot
# ----------------------------

def _stamp() -> Dict[str, Any]:
    if settings.static_mode:
        source = "static"
    else:
        source = "demo" if settings.demo_mode else "local" if settings.marketdata_only else "schwab"
    return {"asof": now_ts_str(), "source": source, "method_version": settings.method_version}


def get_positions_local(account: Optional[str] = None, use_cache: bool = True) -> List[Dict[str, Any]]:
    cache_key = f"positions:{_account_label(account)}"
    if use_cache:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
    live = build_positions_live(today_str(), _get_bench_start(), account=account)
    records = live.to_dict(orient="records") if isinstance(live, pd.DataFrame) else []
    cache.set(cache_key, records)
    return records


def get_positions(account: Optional[str] = None) -> List[Dict[str, Any]]:
    return get_positions_local(account=account, use_cache=False)


def get_accounts() -> List[Dict[str, Any]]:
    def _run(conn):
        cur = conn.cursor()
        cur.execute("SELECT account, cash, asof, account_value FROM accounts WHERE account != 'ALL' ORDER BY account")
        return _fetch_rows(cur)

    return with_conn(_run)


def get_cash(account: Optional[str] = None) -> float:
    return compute_cash_balance_total(account)


def set_cash(value: float) -> None:
    try:
        desired = float(value)
    except Exception:
        raise ValueError("Cash must be a number")
    current = compute_cash_balance_total(None)
    delta = desired - current
    if abs(delta) < 1e-9:
        return
    def _run(conn):
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO cash_flows(account, date, amount, note) VALUES(?,?,?,?)",
            ("ALL", today_str(), float(delta), "SET_CASH"),
        )
        conn.commit()
    with_conn(_run)


def set_account_cash(account: str, cash: float, asof: Optional[str] = None, account_value: Optional[float] = None) -> None:
    label = _account_label(account)
    if label == "ALL":
        raise ValueError("Select a specific account (not ALL) to update balances.")
    date_iso = parse_iso_date(asof) or today_str()
    def _run(conn):
        cur = conn.cursor()
        cur.execute("SELECT account_value FROM accounts WHERE account=?", (label,))
        row = cur.fetchone()
        existing_value = None
        if row:
            existing_value = row.get("account_value") if isinstance(row, dict) else row[0]
        use_value = account_value if account_value is not None else existing_value
        cur.execute(
            "INSERT OR REPLACE INTO accounts(account, cash, asof, account_value) VALUES(?,?,?,?)",
            (label, float(cash), date_iso, use_value),
        )
        cur.execute("DELETE FROM cash_flows WHERE account=?", (label,))
        conn.commit()
    with_conn(_run)


def _get_account_value(account: Optional[str]) -> Optional[float]:
    label = _account_label(account)
    def _run(conn):
        cur = conn.cursor()
        if label == "ALL":
            cur.execute(
                "SELECT COUNT(*) AS cnt, COALESCE(SUM(account_value),0) AS total "
                "FROM accounts WHERE account != 'ALL' AND account_value IS NOT NULL"
            )
            row = cur.fetchone()
            cnt = row.get("cnt") if isinstance(row, dict) else row[0]
            total = row.get("total") if isinstance(row, dict) else row[1]
            return float(total) if cnt else None
        cur.execute("SELECT account_value FROM accounts WHERE account=?", (label,))
        row = cur.fetchone()
        if not row:
            return None
        val = row.get("account_value") if isinstance(row, dict) else row[0]
        return float(val) if val is not None else None
    return with_conn(_run)


def clear_positions_for_accounts(accounts: List[str]) -> None:
    if not accounts:
        return
    def _run(conn):
        cur = conn.cursor()
        cur.executemany("DELETE FROM positions WHERE account=?", [(a,) for a in accounts])
        conn.commit()
    with_conn(_run)


def clear_trades_for_account(account: Optional[str] = None) -> None:
    def _run(conn):
        cur = conn.cursor()
        where, params = _account_where(conn, account)
        cur.execute(f"DELETE FROM trades WHERE {where}", params)
        conn.commit()
    with_conn(_run)


def upsert_position(data: Dict[str, Any]) -> None:
    symbol = (data.get("symbol") or "").strip().upper()
    if not symbol:
        raise ValueError("Symbol required")
    asset_class = (data.get("asset_class") or "equity").strip().lower()
    if asset_class == "option" or is_option_symbol(symbol):
        asset_class = "option"
    if asset_class == "equity" and futures_service.parse_future_symbol(symbol):
        asset_class = "future"

    account = _account_label(data.get("account"))
    if account == "ALL":
        raise ValueError("Select a specific account (not ALL) to update positions.")
    qty = float(data.get("qty") or 0)
    price = float(data.get("price") or 0)
    avg_cost = float(data.get("avg_cost") or price)
    owner_provided = "owner" in data
    entry_date_provided = "entry_date" in data
    sector_provided = "sector" in data
    strategy_id_provided = "strategy_id" in data
    strategy_name_provided = "strategy_name" in data
    strategy_provided = "strategy" in data

    owner = None
    if owner_provided:
        owner = (str(data.get("owner") or "").strip()) or ""

    entry_date = None
    if entry_date_provided:
        raw_entry = str(data.get("entry_date") or "").strip()
        if raw_entry:
            parsed_entry = parse_iso_date(raw_entry)
            if not parsed_entry:
                raise ValueError("Entry date must be YYYY-MM-DD")
            entry_date = parsed_entry
        else:
            entry_date = ""

    sector = None
    if sector_provided:
        sector = (str(data.get("sector") or "").strip()) or ""

    strategy = data.get("strategy")
    strategy_id = None
    strategy_name = None
    if strategy_id_provided:
        strategy_id = (str(data.get("strategy_id") or "").strip().upper()) or ""
    if strategy_name_provided:
        strategy_name = (str(data.get("strategy_name") or "").strip()) or ""
    elif strategy_provided:
        strategy_name = (str(strategy or "").strip()) or ""

    underlying = (data.get("underlying") or infer_underlying_from_symbol(symbol)).strip().upper()
    expiry = data.get("expiry")
    strike = data.get("strike")
    option_type = data.get("option_type")
    if asset_class == "option":
        symbol, underlying, expiry, option_type, strike = options_service.normalize_option_fields(
            symbol, underlying, expiry, option_type, strike
        )
    multiplier = contract_multiplier(symbol, asset_class)
    instrument_id = data.get("instrument_id") or f"{symbol}:{asset_class.upper()}"

    def _run(conn):
        _ensure_account(conn, account)
        _ensure_instrument(
            conn,
            instrument_id,
            {
                "id": instrument_id,
                "symbol": symbol,
                "asset_class": asset_class,
                "underlying": underlying,
                "expiry": expiry,
                "strike": strike,
                "option_type": option_type,
                "multiplier": multiplier,
            },
        )
        _upsert_position_row(
            conn,
            account,
            instrument_id,
            qty,
            price,
            avg_cost,
            multiplier,
            sector,
            strategy_id,
            strategy_name,
            owner=owner if owner_provided else None,
            entry_date=entry_date if entry_date_provided else None,
        )
        conn.commit()

    with_conn(_run)
    cache.delete_pattern("positions")


def record_trade(trade: Dict[str, Any]) -> None:
    def _run(conn):
        cur = conn.cursor()
        _ensure_account(conn, _account_label(trade.get("account")))
        if trade.get("instrument_id"):
            _ensure_instrument(conn, trade.get("instrument_id"))
        cur.execute(
            """
            INSERT INTO trades(
                trade_id, ts, trade_date, account, instrument_id, symbol, side, qty, price, trade_type, status, source,
                asset_class, underlying, expiry, strike, option_type, multiplier, strategy_id, strategy_name, sector,
                realized_pl, cost_basis, cash_flow
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                trade.get("trade_id"),
                trade.get("ts"),
                trade.get("trade_date"),
                trade.get("account"),
                trade.get("instrument_id"),
                trade.get("symbol"),
                trade.get("side"),
                trade.get("qty"),
                trade.get("price"),
                trade.get("trade_type"),
                trade.get("status"),
                trade.get("source"),
                trade.get("asset_class"),
                trade.get("underlying"),
                trade.get("expiry"),
                trade.get("strike"),
                trade.get("option_type"),
                trade.get("multiplier"),
                trade.get("strategy_id"),
                trade.get("strategy_name"),
                trade.get("sector"),
                trade.get("realized_pl"),
                trade.get("cost_basis"),
                trade.get("cash_flow"),
            ),
        )
        conn.commit()
    with_conn(_run)


def delete_position(instrument_id: str, account: Optional[str] = None) -> None:
    label = _account_label(account)
    def _run(conn):
        cur = conn.cursor()
        if label == "ALL":
            cur.execute("DELETE FROM positions WHERE instrument_id=?", (instrument_id,))
        else:
            cur.execute("DELETE FROM positions WHERE account=? AND instrument_id=?", (label, instrument_id))
        conn.commit()
    with_conn(_run)


def close_expired_options(account: Optional[str] = None) -> int:
    today = today_str()

    def _load(conn):
        where, params = _account_where(conn, account)
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT p.account, p.instrument_id, p.qty, p.avg_cost, p.sector, p.strategy_id, p.strategy_name,
                   i.symbol, i.underlying, i.expiry, i.strike, i.option_type, i.multiplier
            FROM positions p
            JOIN instruments i ON p.instrument_id = i.id
            WHERE {where}
              AND LOWER(i.asset_class) = 'option'
              AND i.expiry IS NOT NULL
              AND i.expiry < ?
            """,
            params + [today],
        )
        return _fetch_rows(cur)

    rows = with_conn(_load)
    closed = 0
    for row in rows:
        try:
            qty = float(row.get("qty") or 0.0)
        except Exception:
            qty = 0.0
        if abs(qty) <= 1e-12:
            continue
        expiry = parse_iso_date(row.get("expiry")) or today
        side = "SELL" if qty > 0 else "BUY"
        payload = {
            "account": row.get("account"),
            "instrument_id": row.get("instrument_id"),
            "symbol": row.get("symbol"),
            "side": side,
            "qty": abs(qty),
            "price": 0.0,
            "trade_date": expiry,
            "trade_type": "OPTION",
            "asset_class": "option",
            "underlying": row.get("underlying"),
            "expiry": expiry,
            "strike": row.get("strike"),
            "option_type": row.get("option_type"),
            "multiplier": row.get("multiplier"),
            "strategy_id": row.get("strategy_id"),
            "strategy_name": row.get("strategy_name"),
            "sector": row.get("sector"),
            "skip_cash_check": True,
            "allow_zero_price": True,
        }
        ok, _, _ = apply_trade(payload)
        if ok:
            closed += 1
    if closed:
        _clear_nav_cache()
    return closed


def get_snapshot(account: Optional[str] = None) -> Dict[str, Any]:
    bench = _get_benchmark()
    bench_series = get_bench_series(bench)
    bench_asof = str(bench_series["d"].iloc[-1]) if bench_series is not None and len(bench_series) else today_str()
    live_date = today_str()

    positions_live = build_positions_live(live_date, _get_bench_start(), account=account)
    cash_total = compute_cash_balance_total(account)
    gross_mv = float(np.sum(np.abs(positions_live["market_value"].astype(float).to_numpy()))) if not positions_live.empty else 0.0
    account_value = _get_account_value(account)
    if account_value is not None:
        nav_live = float(account_value)
    else:
        nav_live = float(cash_total + gross_mv) if not positions_live.empty else float(cash_total)
    cash_avail = compute_cash_available(cash_total, positions_live)

    day_pnl = 0.0
    if positions_live is not None and not positions_live.empty:
        try:
            day_pnl = float(positions_live["day_pnl"].astype(float).sum())
        except Exception:
            day_pnl = 0.0

    anchor_cash, anchor_asof = _get_cash_anchor_info(account)
    base_cash = anchor_cash if anchor_cash is not None else _get_start_cash(account)

    def _cash_adj(conn):
        where, params = _account_where(conn, account)
        cur = conn.cursor()
        cash_params = list(params)
        cash_filter = ""
        if anchor_asof:
            cash_filter = " AND date > ?"
            cash_params.append(anchor_asof)
        cur.execute(f"SELECT COALESCE(SUM(amount),0) as total FROM cash_flows WHERE {where}{cash_filter}", cash_params)
        row = cur.fetchone()
        return float(row.get("total") if isinstance(row, dict) else row[0] or 0.0)

    cash_adj = with_conn(_cash_adj)
    # Total PnL should reflect realized + unrealized, not cash inflows/outflows.
    unreal_pnl = 0.0
    if positions_live is not None and not positions_live.empty:
        try:
            unreal_pnl = float(positions_live["total_pnl"].astype(float).sum())
        except Exception:
            unreal_pnl = 0.0

    def _realized(conn):
        where, params = _account_where(conn, account)
        cur = conn.cursor()
        cur.execute(f"SELECT COALESCE(SUM(realized_pl),0) as total FROM trades WHERE {where}", params)
        row = cur.fetchone()
        return float(row.get("total") if isinstance(row, dict) else row[0] or 0.0)

    realized_pnl = with_conn(_realized)
    total_pnl = float(unreal_pnl + realized_pnl)

    gross = float(np.sum(np.abs(positions_live["market_value"].astype(float).to_numpy()))) if not positions_live.empty else 0.0
    net = float(np.sum(positions_live["market_value"].astype(float).to_numpy())) if not positions_live.empty else 0.0
    net_exposure = net / gross if gross else 0.0

    data_quality = {
        "total": int(len(positions_live)),
        "sources": {"cache": int(len(positions_live))},
        "missing": {},
        "all_priced": bool((positions_live["price"].astype(float) > 0).all()) if not positions_live.empty else True,
        "missing_assets": [str(r["symbol"]).upper() for _, r in positions_live.iterrows() if float(r.get("price") or 0) <= 0],
    }

    return {
        "stamp": _stamp(),
        "nlv": float(nav_live),
        "cash": float(cash_total),
        "day_pnl": float(day_pnl),
        "total_pnl": float(total_pnl),
        "buying_power": float(cash_avail),
        "margin_required": float(max(cash_total - cash_avail, 0.0)),
        "margin_available": float(cash_avail),
        "net_exposure": float(net_exposure),
        "positions": positions_live.to_dict(orient="records") if isinstance(positions_live, pd.DataFrame) else [],
        "data_quality": data_quality,
    }


def get_sector_series(sector: str, limit: int = 120, source: str = "auto", account: Optional[str] = None) -> List[Dict[str, Any]]:
    sector_name = (sector or "").strip()
    if not sector_name:
        raise ValueError("Sector is required")

    source = (source or "auto").lower()
    use_etf = source == "etf"
    if source == "auto":
        # If there are any positions in this sector, prefer sleeve
        pos = _load_positions_df(account)
        if pos is None or pos.empty:
            use_etf = True
        else:
            use_etf = sector_name not in pos["sector"].fillna("").tolist()

    if use_etf:
        etf = SECTOR_ETF.get(sector_name)
        if not etf:
            raise ValueError("No ETF mapping for sector")
        ensure_symbol_history(etf, _get_bench_start(), is_bench=False)
        def _run(conn):
            cur = conn.cursor()
            cur.execute(
                "SELECT date, close FROM price_cache WHERE symbol=? AND date>=? ORDER BY date ASC",
                (etf, _get_bench_start()),
            )
            rows = _fetch_rows(cur)
            return rows
        rows = with_conn(_run)
        df = pd.DataFrame(rows)
        if df.empty:
            return []
        df["date"] = df["date"].astype(str)
        df["close"] = pd.to_numeric(df["close"], errors="coerce")
        df = df.dropna()
        if df.empty:
            return []
        base = float(df.iloc[0]["close"]) if float(df.iloc[0]["close"]) != 0 else 1.0
        df["sector"] = (df["close"].astype(float) / base - 1.0) * 100.0
        out = df[["date", "sector"]].tail(int(limit))
        return [{"date": str(r["date"]), "sector": float(r["sector"])} for _, r in out.iterrows()]

    # Sleeve mode: build returns from positions in sector
    pos = _load_positions_df(account)
    pos = pos[pos["sector"] == sector_name] if not pos.empty else pos
    if pos is None or pos.empty:
        return []
    symbols = sorted(set(pos["symbol"].astype(str).str.upper().tolist()))
    if not symbols:
        return []
    start_iso = _get_bench_start()
    for s in symbols:
        if not is_option_symbol(s):
            ensure_symbol_history(s, start_iso, is_bench=False)

    def _load_prices(conn):
        cur = conn.cursor()
        qmarks = ",".join(["?"] * len(symbols))
        cur.execute(
            f"SELECT symbol, date, close FROM price_cache WHERE date>=? AND symbol IN ({qmarks}) ORDER BY date ASC",
            [start_iso] + symbols,
        )
        return _fetch_rows(cur)

    price_rows = with_conn(_load_prices)
    px = pd.DataFrame(price_rows)
    if px.empty:
        return []
    px["date"] = px["date"].astype(str)
    px["close"] = pd.to_numeric(px["close"], errors="coerce").fillna(0.0)
    px = px.dropna()
    if px.empty:
        return []

    px_piv = px.pivot_table(index="date", columns="symbol", values="close", aggfunc="last").fillna(method="ffill")
    px_piv = px_piv.fillna(0.0)
    qty_map = {row["symbol"].upper(): float(row["qty"]) for _, row in pos.iterrows()}
    mult_map = {row["symbol"].upper(): float(row["multiplier"]) for _, row in pos.iterrows()}

    mv = pd.Series(0.0, index=px_piv.index)
    for sym in px_piv.columns:
        mv += float(qty_map.get(sym, 0.0)) * px_piv[sym].astype(float) * float(mult_map.get(sym, 1.0))

    mv = mv.replace([np.inf, -np.inf], np.nan).dropna()
    if mv.empty:
        return []
    base = float(mv.iloc[0]) if float(mv.iloc[0]) != 0 else 1.0
    ret = (mv / base - 1.0) * 100.0
    out = ret.tail(int(limit))
    return [{"date": str(idx), "sector": float(val)} for idx, val in out.items()]


# ----------------------------
# NAV history maintenance
# ----------------------------

def rebuild_nav_history(limit: int = 1500, account: Optional[str] = None) -> Dict[str, Any]:
    start_iso = _effective_nav_start(account)
    bench_series = get_bench_series(start_date=start_iso)
    nav_df = build_daily_nav_series(start_iso, bench_series, account=account)
    if nav_df is None or nav_df.empty:
        points: List[Dict[str, Any]] = []
    else:
        nav_df = nav_df.tail(int(limit))
        bench_map: Dict[str, float] = {}
        if bench_series is not None and len(bench_series):
            bench_map = {str(r["d"]): float(r["close"]) for _, r in bench_series.iterrows()}
        points = []
        for _, row in nav_df.iterrows():
            d = str(row["d"])
            twr_val = None
            try:
                if "twr" in nav_df.columns:
                    twr_val = float(row["twr"])
            except Exception:
                twr_val = None
            points.append(
                {
                    "date": d,
                    "nav": float(row["nav"]),
                    "bench": float(bench_map.get(d, row["nav"])) if bench_map else float(row["nav"]),
                    "twr": twr_val,
                }
            )
    def _run(conn):
        where, params = _account_where(conn, account)
        cur = conn.cursor()
        cur.execute(f"DELETE FROM nav_snapshots WHERE {where}", params)
        for row in points:
            cur.execute(
                "INSERT OR REPLACE INTO nav_snapshots(account, date, nav, bench) VALUES(?,?,?,?)",
                (_account_label(account), row["date"], float(row["nav"]), float(row.get("bench") or row["nav"])),
            )
        conn.commit()
    with_conn(_run)
    _clear_nav_cache()
    return {"ok": True, "count": len(points)}


def store_nav_snapshot(account: Optional[str], date_str: str, nav: float, bench: Optional[float] = None) -> None:
    def _run(conn):
        cur = conn.cursor()
        # Store bench as NULL if not available, so we can distinguish "no data" from "bench=nav"
        bench_val = float(bench) if bench is not None and bench > 0 else None
        cur.execute(
            "INSERT OR REPLACE INTO nav_snapshots(account, date, nav, bench) VALUES(?,?,?,?)",
            (_account_label(account), date_str, float(nav), bench_val),
        )
        conn.commit()
    with_conn(_run)
    _clear_nav_cache()


def clear_nav_history(account: Optional[str] = None) -> Dict[str, Any]:
    def _run(conn):
        cur = conn.cursor()
        where, params = _account_where(conn, account)
        cur.execute(f"DELETE FROM nav_snapshots WHERE {where}", params)
        conn.commit()
    with_conn(_run)
    _clear_nav_cache()
    return {"ok": True}


# ----------------------------
# Background price updates
# ----------------------------

def start_background_price_updates() -> None:
    global BACKGROUND_UPDATE_THREAD, STOP_BACKGROUND_UPDATES
    if settings.static_mode or not settings.live_quotes:
        return
    if BACKGROUND_UPDATE_THREAD and BACKGROUND_UPDATE_THREAD.is_alive():
        return
    STOP_BACKGROUND_UPDATES = False

    def update_loop():
        while not STOP_BACKGROUND_UPDATES:
            try:
                pos = _load_positions_df(None)
                bench = _get_benchmark()
                start_map = _symbol_start_map_from_positions_df(pos, _get_bench_start())
                symbols = set(start_map.keys())
                if bench:
                    symbols.add(bench)
                lookback = (date.today() - timedelta(days=420)).isoformat()
                for sym in sorted(symbols):
                    if STOP_BACKGROUND_UPDATES:
                        break
                    try:
                        start_iso = _get_bench_start() if sym == bench else start_map.get(sym, lookback)
                        fetch_prices_incremental(sym, start_iso, is_bench=(sym == bench))
                    except Exception:
                        continue
                time.sleep(60)
            except Exception:
                time.sleep(10)

    BACKGROUND_UPDATE_THREAD = threading.Thread(target=update_loop, daemon=True)
    BACKGROUND_UPDATE_THREAD.start()


def stop_background_price_updates() -> None:
    global STOP_BACKGROUND_UPDATES
    STOP_BACKGROUND_UPDATES = True
