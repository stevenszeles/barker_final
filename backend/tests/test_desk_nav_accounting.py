from __future__ import annotations

from backend.app.services import desk_accounting
from backend.app.services import legacy_engine as engine


def _point(date: str, nav: float, bench: float = 100.0, twr: float | None = None):
    return {
        "date": date,
        "nav": nav,
        "bench": bench,
        "twr": twr if twr is not None else (nav / 100.0 if nav else 1.0),
    }


def test_build_desk_nav_points_reattributes_futures_snapshot_series():
    legal_nav = {
        "ALL": [_point("2026-01-01", 150.0), _point("2026-01-02", 160.0), _point("2026-01-03", 170.0)],
        "A": [_point("2026-01-01", 100.0), _point("2026-01-02", 110.0), _point("2026-01-03", 120.0)],
        "B": [_point("2026-01-01", 50.0), _point("2026-01-02", 50.0), _point("2026-01-03", 50.0)],
    }
    position = {
        "account": "A",
        "custodyAccount": "A",
        "symbol": "/ESM6",
        "normalizedSymbol": "/ESM6",
        "assetType": "Future",
        "qty": 1,
        "price": 5300,
        "mktVal": 20,
        "costBasis": 0,
        "source": "futures_statement",
    }
    shared_state = {
        "accounts": {
            "A": {"positions": [position]},
            "B": {"positions": []},
        },
        "positionAttributionOverrides": {
            desk_accounting.get_position_attribution_key(position): "B",
        },
        "futuresPnlSnapshots": {
            desk_accounting.get_position_snapshot_key(position): {
                "2026-01-01": 0,
                "2026-01-02": 10,
                "2026-01-03": 20,
            }
        },
    }

    points_a = desk_accounting.build_desk_nav_points(legal_nav, shared_state, account="A", limit=10)
    points_b = desk_accounting.build_desk_nav_points(legal_nav, shared_state, account="B", limit=10)
    points_all = desk_accounting.build_desk_nav_points(legal_nav, shared_state, account="ALL", limit=10)

    assert [row["nav"] for row in points_a] == [100.0, 100.0, 100.0]
    assert [row["nav"] for row in points_b] == [50.0, 60.0, 70.0]
    assert [row["nav"] for row in points_all] == [150.0, 160.0, 170.0]


def test_build_desk_nav_points_reattributes_realized_trade_linear_carry():
    legal_nav = {
        "ALL": [_point("2026-01-01", 150.0), _point("2026-01-02", 160.0), _point("2026-01-03", 170.0)],
        "A": [_point("2026-01-01", 100.0), _point("2026-01-02", 110.0), _point("2026-01-03", 120.0)],
        "B": [_point("2026-01-01", 50.0), _point("2026-01-02", 50.0), _point("2026-01-03", 50.0)],
    }
    trade = {
        "account": "A",
        "symbol": "AAPL",
        "baseSym": "AAPL",
        "openedDate": "2026-01-01",
        "closedDate": "2026-01-03",
        "qty": 10,
        "proceeds": 1300,
        "cost": 1000,
        "gain": 30,
        "term": "Short Term",
        "isOption": False,
    }
    shared_state = {
        "accounts": {
            "A": {"positions": []},
            "B": {"positions": []},
        },
        "realizedTrades": [trade],
        "realizedTradeAttributionOverrides": {
            desk_accounting.get_realized_trade_override_keys(trade)[0]: "B",
        },
    }

    points_a = desk_accounting.build_desk_nav_points(legal_nav, shared_state, account="A", limit=10)
    points_b = desk_accounting.build_desk_nav_points(legal_nav, shared_state, account="B", limit=10)
    points_all = desk_accounting.build_desk_nav_points(legal_nav, shared_state, account="ALL", limit=10)

    assert [row["nav"] for row in points_a] == [100.0, 95.0, 90.0]
    assert [row["nav"] for row in points_b] == [50.0, 65.0, 80.0]
    assert [row["nav"] for row in points_all] == [150.0, 160.0, 170.0]


def test_engine_get_nav_series_desk_uses_shared_state_accounting(monkeypatch):
    legal_nav = {
        "ALL": [_point("2026-01-01", 150.0), _point("2026-01-02", 160.0), _point("2026-01-03", 170.0)],
        "A": [_point("2026-01-01", 100.0), _point("2026-01-02", 110.0), _point("2026-01-03", 120.0)],
        "B": [_point("2026-01-01", 50.0), _point("2026-01-02", 50.0), _point("2026-01-03", 50.0)],
    }
    position = {
        "account": "A",
        "custodyAccount": "A",
        "symbol": "/NQM6",
        "normalizedSymbol": "/NQM6",
        "assetType": "Future",
        "qty": 1,
        "price": 18200,
        "mktVal": 20,
        "costBasis": 0,
        "source": "futures_statement",
    }
    shared_state = {
        "accounts": {
            "A": {"positions": [position]},
            "B": {"positions": []},
        },
        "positionAttributionOverrides": {
            desk_accounting.get_position_attribution_key(position): "B",
        },
        "futuresPnlSnapshots": {
            desk_accounting.get_position_snapshot_key(position): {
                "2026-01-01": 0,
                "2026-01-02": 10,
                "2026-01-03": 20,
            }
        },
    }

    monkeypatch.setattr(engine, "_get_shared_dashboard_state_for_accounting", lambda: shared_state)
    monkeypatch.setattr(engine, "_get_legal_nav_series", lambda limit=120, account=None: legal_nav["ALL" if account in {None, 'ALL'} else account])
    monkeypatch.setattr(engine, "_load_nav_price_series_for_desk", lambda symbol, start_date: [])

    out = engine.get_nav_series(limit=10, account="B", accounting_mode="desk")
    assert [row["nav"] for row in out] == [50.0, 60.0, 70.0]
