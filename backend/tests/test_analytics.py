import pandas as pd


def test_snapshot_all_series_forward_fills_sparse_account_dates(monkeypatch):
    from backend.app.services import legacy_engine as engine

    class Cursor:
        def __init__(self):
            self.sql = ""
            self.params = None

        def execute(self, sql, params=None):
            self.sql = str(sql)
            self.params = params

        def fetchall(self):
            if "FROM nav_snapshots" in self.sql and "account != 'ALL'" in self.sql:
                return [
                    {"account": "A", "date": "2026-01-01", "nav": 100.0, "bench": None},
                    {"account": "A", "date": "2026-01-02", "nav": 110.0, "bench": None},
                    {"account": "B", "date": "2026-01-02", "nav": 100.0, "bench": None},
                    {"account": "B", "date": "2026-01-03", "nav": 105.0, "bench": None},
                ]
            if "FROM price_cache" in self.sql:
                return [
                    {"date": "2026-01-01", "close": 5000.0},
                    {"date": "2026-01-02", "close": 5100.0},
                    {"date": "2026-01-03", "close": 5200.0},
                ]
            return []

    class Conn:
        def cursor(self):
            return Cursor()

    monkeypatch.setattr(engine, "with_conn", lambda fn: fn(Conn()))

    out = engine._get_nav_series_from_snapshots(limit=10, account="ALL")
    assert [row["date"] for row in out] == ["2026-01-02", "2026-01-03"]
    assert [round(float(row["nav"]), 6) for row in out] == [210.0, 215.0]
    assert [round(float(row["bench"]), 6) for row in out] == [5100.0, 5200.0]
    assert [row["twr"] for row in out] == [None, None]
    assert {row["return_method"] for row in out} == {"nav_change_only"}
    assert {row["data_quality"] for row in out} == {"estimated"}


def test_snapshot_series_prefers_cached_benchmark(monkeypatch):
    from backend.app.services import legacy_engine as engine

    class Cursor:
        def __init__(self):
            self.sql = ""
            self.params = None

        def execute(self, sql, params=None):
            self.sql = str(sql)
            self.params = params

        def fetchall(self):
            if "FROM nav_snapshots" in self.sql:
                return [
                    {"date": "2026-01-02", "nav": 100.0, "bench": 9999.0},
                    {"date": "2026-01-03", "nav": 103.0, "bench": 9998.0},
                ]
            if "FROM price_cache" in self.sql:
                return [
                    {"date": "2026-01-02", "close": 5000.0},
                    {"date": "2026-01-03", "close": 5100.0},
                ]
            return []

    class Conn:
        def cursor(self):
            return Cursor()

    monkeypatch.setattr(engine, "with_conn", lambda fn: fn(Conn()))
    out = engine._get_nav_series_from_snapshots(limit=10, account="A")
    assert [round(float(row["bench"]), 6) for row in out] == [5000.0, 5100.0]


def test_snapshot_series_does_not_expose_unverified_legacy_benchmark(monkeypatch):
    from backend.app.services import legacy_engine as engine

    class Cursor:
        def __init__(self):
            self.sql = ""

        def execute(self, sql, params=None):
            self.sql = str(sql)

        def fetchall(self):
            if "FROM nav_snapshots" in self.sql:
                return [
                    {"date": "2026-01-02", "nav": 100.0, "bench": 9999.0},
                    {"date": "2026-01-03", "nav": 103.0, "bench": 9998.0},
                ]
            return []

    class Conn:
        def cursor(self):
            return Cursor()

    monkeypatch.setattr(engine, "with_conn", lambda fn: fn(Conn()))
    out = engine._get_nav_series_from_snapshots(limit=10, account="A")
    assert [row["bench"] for row in out] == [None, None]


def test_effective_nav_start_prefers_earliest_balance_history(monkeypatch):
    from backend.app.services import legacy_engine as engine

    monkeypatch.setattr(engine, "_get_bench_start", lambda: "2026-01-01")
    monkeypatch.setattr(engine, "_earliest_portfolio_date", lambda account: "2026-03-04")
    monkeypatch.setattr(engine, "_earliest_balance_history_date", lambda account: "2024-05-14")
    assert engine._effective_nav_start("Limit_Liability_Company ...024") == "2024-05-14"


def test_sector_series_neutralizes_contributions(monkeypatch):
    from backend.app.services import legacy_engine as engine

    monkeypatch.setattr(
        engine,
        "_load_positions_df",
        lambda account: pd.DataFrame(
            [{"symbol": "AAPL", "qty": 15.0, "price": 10.0, "multiplier": 1.0, "sector": "Tech", "entry_date": "2026-01-01"}]
        ),
    )
    monkeypatch.setattr(
        engine,
        "get_bench_series",
        lambda start_date=None: pd.DataFrame(
            [
                {"d": "2026-01-01", "close": 100.0},
                {"d": "2026-01-02", "close": 101.0},
                {"d": "2026-01-03", "close": 102.0},
            ]
        ),
    )
    monkeypatch.setattr(engine, "_get_bench_start", lambda: "2026-01-01")
    monkeypatch.setattr(engine, "ensure_symbol_history", lambda symbol, start_iso, is_bench=False: True)
    monkeypatch.setattr(engine, "today_str", lambda: "2026-01-03")

    class Cursor:
        def __init__(self):
            self.sql = ""

        def execute(self, sql, params=None):
            self.sql = str(sql)

        def fetchall(self):
            if "FROM trades" in self.sql:
                return [
                    {
                        "trade_date": "2026-01-01",
                        "symbol": "AAPL",
                        "qty": 10.0,
                        "side": "BUY",
                        "cash_flow": -100.0,
                        "multiplier": 1.0,
                        "trade_type": "LIMIT",
                        "source": "MANUAL",
                        "sector": "Tech",
                    },
                    {
                        "trade_date": "2026-01-02",
                        "symbol": "AAPL",
                        "qty": 5.0,
                        "side": "BUY",
                        "cash_flow": -50.0,
                        "multiplier": 1.0,
                        "trade_type": "LIMIT",
                        "source": "MANUAL",
                        "sector": "Tech",
                    },
                ]
            return [
                {"symbol": "AAPL", "date": "2026-01-01", "close": 10.0},
                {"symbol": "AAPL", "date": "2026-01-02", "close": 10.0},
                {"symbol": "AAPL", "date": "2026-01-03", "close": 10.0},
            ]

    class Conn:
        def cursor(self):
            return Cursor()

    monkeypatch.setattr(engine, "with_conn", lambda fn: fn(Conn()))
    series = engine.get_sector_series("Tech", limit=10, source="sleeve", account="ACC1")
    assert len(series) == 3
    assert all(abs(float(row["sector"])) < 1e-9 for row in series)


def test_risk_profile_includes_correlation_and_rolling(monkeypatch):
    from backend.app.services import risk as risk_service

    snapshot = {
        "nlv": 100000.0,
        "positions": [
            {"symbol": "AAPL", "sector": "Tech", "market_value": 60000.0, "qty": 100.0, "price": 600.0, "asset_class": "equity"},
            {"symbol": "MSFT", "sector": "Tech", "market_value": 40000.0, "qty": 50.0, "price": 800.0, "asset_class": "equity"},
        ],
    }
    nav = []
    nav_value, benchmark_value, twr = 100000.0, 5000.0, 1.0
    for index in range(1, 120):
        point_date = pd.Timestamp("2025-10-01") + pd.Timedelta(days=index)
        if point_date.weekday() >= 5:
            continue
        portfolio_return = 0.0008 + (index % 5) * 0.0001
        benchmark_return = 0.0005 + (index % 3) * 0.0001
        twr *= 1.0 + portfolio_return
        nav_value *= 1.0 + portfolio_return
        benchmark_value *= 1.0 + benchmark_return
        nav.append({"date": point_date.date().isoformat(), "nav": nav_value, "bench": benchmark_value, "twr": twr})

    sector_series = [{"date": row["date"], "sector": (index + 1) * 0.06} for index, row in enumerate(nav)]
    monkeypatch.setattr(risk_service.engine, "get_snapshot", lambda account=None: snapshot)
    monkeypatch.setattr(risk_service.engine, "get_nav_series", lambda limit=900, account=None: nav)
    monkeypatch.setattr(
        risk_service.engine,
        "get_sector_series",
        lambda sector, limit=700, source="auto", account=None: sector_series,
    )

    out = risk_service.get_risk_profile()
    assert {"metrics", "correlation", "rolling"} <= out.keys()
    assert {"Portfolio", "SPX"} <= set(out["correlation"]["labels"])
    assert out["correlation"]["observations"] > 20
    assert out["rolling"]["dates"]
