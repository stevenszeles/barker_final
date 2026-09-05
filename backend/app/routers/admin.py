from datetime import date, datetime, timezone
import json
import logging
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..config import settings
from ..db import with_conn
from ..importing import import_batch, import_history, parse_uploads
from ..security import Identity, require_admin
from ..services import legacy_engine

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)


class BenchmarkSettings(BaseModel):
    start_date: date


def _refresh_benchmark(start_date: str) -> None:
    try:
        legacy_engine.ensure_benchmark_cache_current(start_date=start_date)
        legacy_engine._clear_nav_cache()
    except Exception:
        logger.exception("Benchmark refresh failed")


@router.post("/import-batch")
async def import_files_batch(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    identity: Identity = Depends(require_admin),
):
    if not files:
        raise HTTPException(status_code=400, detail="Select at least one brokerage CSV")
    parsed = await parse_uploads(files)
    try:
        result = import_batch(parsed, actor=identity.subject)
        legacy_engine._clear_nav_cache()
        balance_dates = [
            str(item.rows[0]["date"])
            for item in parsed
            if item.file_type == "balances" and item.rows
        ]
        if balance_dates:
            background_tasks.add_task(_refresh_benchmark, min(balance_dates))
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Atomic import batch failed")
        raise HTTPException(status_code=500, detail="Import failed without changing portfolio data") from exc


@router.get("/import-history")
def get_import_history(
    limit: int = 25,
    _identity: Identity = Depends(require_admin),
):
    return {"imports": import_history(limit=limit)}


@router.get("/settings")
def get_admin_settings(_identity: Identity = Depends(require_admin)):
    def _read(conn):
        cur = conn.cursor()
        cur.execute("SELECT value FROM settings WHERE key='bench_start'")
        row = cur.fetchone()
        return row[0] if row else None

    return {
        "benchmark_start": with_conn(_read),
        "static_mode": settings.static_mode,
        "live_quotes": settings.live_quotes,
        "trading_enabled": settings.trading_enabled,
    }


@router.patch("/settings/benchmark")
def update_benchmark_settings(
    payload: BenchmarkSettings,
    identity: Identity = Depends(require_admin),
):
    if payload.start_date > date.today():
        raise HTTPException(status_code=400, detail="Benchmark start date cannot be in the future")
    value = payload.start_date.isoformat()

    def _write(conn):
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO settings(key, value) VALUES('bench_start', ?)", (value,))
        cur.execute(
            """
            INSERT INTO audit_log(ts, actor, action, details_json)
            VALUES(?,?,?,?)
            """,
            (
                datetime.now(timezone.utc).isoformat(),
                identity.subject,
                "UPDATE_BENCHMARK_START",
                json.dumps({"setting": "bench_start", "value": value}, separators=(",", ":")),
            ),
        )
        conn.commit()

    with_conn(_write)
    legacy_engine._clear_nav_cache()
    return {"ok": True, "benchmark_start": value}


@router.post("/refresh-benchmark")
def refresh_benchmark(
    background_tasks: BackgroundTasks,
    _identity: Identity = Depends(require_admin),
):
    def _earliest(conn):
        cur = conn.cursor()
        cur.execute("SELECT MIN(date) FROM nav_snapshots")
        row = cur.fetchone()
        return str(row[0]) if row and row[0] else date.today().replace(month=1, day=1).isoformat()

    start_date = with_conn(_earliest)
    background_tasks.add_task(_refresh_benchmark, start_date)
    return {"ok": True, "status": "queued", "start_date": start_date}
