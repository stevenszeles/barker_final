from __future__ import annotations

import asyncio
import io

from fastapi import UploadFile


def test_import_balance_history_fast_mode_rebuilds_nav_inline(monkeypatch):
    import backend.app.routers.admin as admin_router

    csv_text = "Date,Amount\n05/14/2024,100\n03/03/2026,101\n03/04/2026,102\n"
    rebuild_calls = []

    class _Cursor:
        def __init__(self):
            self.last_sql = ""

        def execute(self, sql, params=None):
            self.last_sql = str(sql)

        def fetchall(self):
            if "SELECT account FROM accounts" in self.last_sql:
                return [{"account": "Limit_Liability_Company ...024"}]
            return []

        def fetchone(self):
            if "SELECT account, cash, asof, account_value FROM accounts" in self.last_sql:
                return {
                    "account": "Limit_Liability_Company ...024",
                    "cash": 500.0,
                    "asof": "2026-03-04",
                    "account_value": 101.0,
                }
            if "SELECT cash, asof, anchor_mode FROM accounts" in self.last_sql:
                return {"cash": 500.0, "asof": "2026-03-04", "anchor_mode": "EOD"}
            return None

    class _Conn:
        def cursor(self):
            return _Cursor()

        def commit(self):
            return None

    monkeypatch.setattr(admin_router, "with_conn", lambda fn: fn(_Conn()))
    monkeypatch.setattr(admin_router, "_balance_history_mode", lambda: "fast")
    monkeypatch.setattr(admin_router.settings, "static_mode", False)
    monkeypatch.setattr(admin_router.legacy_engine, "_effective_nav_start", lambda account: "2024-05-14")
    monkeypatch.setattr(admin_router.legacy_engine, "today_str", lambda: "2026-03-04")
    monkeypatch.setattr(admin_router.legacy_engine, "_clear_nav_cache", lambda: None)
    monkeypatch.setattr(
        admin_router.portfolio_service,
        "rebuild_nav_history",
        lambda limit, account: rebuild_calls.append((limit, account)) or {"ok": True, "count": 3},
    )
    monkeypatch.setattr(
        admin_router,
        "_queue_nav_rebuild",
        lambda account, limit: (_ for _ in ()).throw(AssertionError("fast-mode balance import should rebuild inline")),
    )

    upload = UploadFile(
        filename="Limit Liability Company_XXXX024_Balances_20260304-203445.CSV",
        file=io.BytesIO(csv_text.encode("utf-8")),
    )
    out = asyncio.run(admin_router.import_balances(upload, account=None))

    assert out["ok"] is True
    assert out["account"] == "Limit_Liability_Company ...024"
    assert out["nav_rebuild"] == "complete"
    assert out["nav_rebuild_count"] == 3
    assert rebuild_calls == [(1200, "Limit_Liability_Company ...024")]
