from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timezone

from .db import with_conn

Migration = tuple[int, str, Callable]


def _migration_1_operational_foundation(conn) -> None:
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS import_batches (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            actor TEXT NOT NULL,
            source TEXT NOT NULL,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            file_count INTEGER NOT NULL DEFAULT 0,
            summary_json TEXT,
            error TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS import_files (
            id TEXT PRIMARY KEY,
            batch_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            file_type TEXT NOT NULL,
            account TEXT,
            sha256 TEXT NOT NULL,
            byte_size INTEGER NOT NULL,
            row_count INTEGER NOT NULL DEFAULT 0,
            result_json TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            job_type TEXT NOT NULL,
            status TEXT NOT NULL,
            payload_json TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,
            scheduled_at TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT,
            locked_by TEXT,
            error TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS calculation_runs (
            id TEXT PRIMARY KEY,
            calculation_type TEXT NOT NULL,
            scope TEXT NOT NULL,
            effective_date TEXT,
            algorithm_version TEXT NOT NULL,
            input_watermark TEXT,
            status TEXT NOT NULL,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            warnings_json TEXT
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_import_batches_started ON import_batches(started_at)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_import_files_batch ON import_files(batch_id)")
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_import_files_hash ON import_files(sha256, file_type, account)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status_schedule ON jobs(status, scheduled_at)")


MIGRATIONS: list[Migration] = [
    (1, "operational foundation", _migration_1_operational_foundation),
]


def apply_migrations() -> list[int]:
    applied: list[int] = []

    def _run(conn):
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL
            )
            """
        )
        cur.execute("SELECT version FROM schema_migrations")
        existing = {int(row[0]) for row in (cur.fetchall() or [])}
        for version, name, migration in MIGRATIONS:
            if version in existing:
                continue
            migration(conn)
            cur.execute(
                "INSERT INTO schema_migrations(version, name, applied_at) VALUES(?,?,?)",
                (version, name, datetime.now(timezone.utc).isoformat()),
            )
            applied.append(version)
        conn.commit()

    with_conn(_run)
    return applied
