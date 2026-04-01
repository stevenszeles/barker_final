from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse

from ..db import with_conn
from ..services import legacy_engine, stooq

router = APIRouter(prefix="/stooq", tags=["stooq"])


BENCHMARK_SYMBOLS = {"^SPX", "SPX", "$SPX", "^GSPC"}


def _normalize_history_symbol(raw_symbol: str) -> tuple[str, bool]:
    symbol = (raw_symbol or "").strip().upper()
    if symbol.endswith(".US"):
        symbol = symbol[:-3]
    if symbol in BENCHMARK_SYMBOLS:
        return "^GSPC", True
    return symbol, False


def _history_candidates(symbol: str, is_benchmark: bool) -> list[str]:
    candidates = [symbol]
    if is_benchmark:
        for alias in ("^SPX", "SPX", "$SPX"):
            if alias not in candidates:
                candidates.append(alias)
    return candidates


def _load_cached_history(symbols: list[str], start_iso: str) -> list[dict]:
    def _run(conn):
        cur = conn.cursor()
        for symbol in symbols:
            cur.execute(
                "SELECT date, close FROM price_cache WHERE symbol=? AND date>=? ORDER BY date ASC",
                (symbol, start_iso),
            )
            rows = cur.fetchall() or []
            if rows:
                return [dict(row) if isinstance(row, dict) else {"date": row[0], "close": row[1]} for row in rows]
        return []

    return with_conn(_run)


def _direct_history_fallback(raw_symbol: str, normalized_symbol: str, start_iso: str) -> list[dict]:
    attempts = [raw_symbol, normalized_symbol]
    if normalized_symbol and normalized_symbol not in BENCHMARK_SYMBOLS:
        attempts.append(f"{normalized_symbol}.US")
    seen = set()
    for attempt in attempts:
        key = (attempt or "").strip().upper()
        if not key or key in seen:
            continue
        seen.add(key)
        history = stooq.get_history(attempt, start_iso)
        if history:
            return history
    return []


@router.get("/q/d/l/", response_class=PlainTextResponse)
def stooq_daily_history(
    s: str = Query(..., min_length=1, description="Stooq-compatible symbol, e.g. xlk.us or ^spx"),
    i: str = Query("d", description="Interval. Only daily history is supported."),
    refresh: bool = Query(False, description="Force a benchmark cache refresh before returning history."),
):
    if i.lower() != "d":
        raise HTTPException(status_code=400, detail="Only daily interval is supported")

    normalized_symbol, is_benchmark = _normalize_history_symbol(s)
    if not normalized_symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")

    start_iso = (date.today() - timedelta(days=3650)).isoformat()
    if is_benchmark or refresh:
        try:
            if is_benchmark:
                legacy_engine.ensure_benchmark_cache_current(normalized_symbol, start_iso)
            else:
                legacy_engine.ensure_symbol_history(normalized_symbol, start_iso, is_bench=False)
        except Exception:
            pass
    history = _load_cached_history(_history_candidates(normalized_symbol, is_benchmark), start_iso)
    latest_cached_date = history[-1].get("date") if history else None
    if not latest_cached_date or latest_cached_date < date.today().isoformat():
        try:
            legacy_engine.fetch_prices_incremental(normalized_symbol, start_iso, is_bench=is_benchmark)
        except Exception:
            pass
        history = _load_cached_history(_history_candidates(normalized_symbol, is_benchmark), start_iso)
    if len(history) < 2:
        try:
            legacy_engine.ensure_symbol_history(normalized_symbol, start_iso, is_bench=is_benchmark)
        except Exception:
            pass
        history = _load_cached_history(_history_candidates(normalized_symbol, is_benchmark), start_iso)
    if len(history) < 2:
        history = _direct_history_fallback(s, normalized_symbol, start_iso)
    if not history:
        raise HTTPException(status_code=404, detail=f"No history found for {normalized_symbol}")

    rows = ["Date,Open,High,Low,Close,Volume"]
    for row in history:
        point_date = row.get("date")
        close = row.get("close")
        if not point_date or close is None:
            continue
        value = f"{float(close):.6f}".rstrip("0").rstrip(".")
        rows.append(f"{point_date},{value},{value},{value},{value},0")

    if len(rows) == 1:
        raise HTTPException(status_code=404, detail=f"No history found for {s}")

    return PlainTextResponse(
        "\n".join(rows) + "\n",
        headers={
            "Cache-Control": "no-store, max-age=0",
            "Pragma": "no-cache",
        },
    )
