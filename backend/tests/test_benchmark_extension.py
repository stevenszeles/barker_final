from __future__ import annotations


def test_extend_nav_points_with_benchmark_carries_forward_last_nav():
    from backend.app.services import legacy_engine as engine

    points = [
        {"date": "2026-03-27", "nav": 100.0, "bench": 6368.85, "twr": 1.0},
        {"date": "2026-03-30", "nav": 101.0, "bench": 6343.72, "twr": 1.01},
    ]
    bench_map = {
        "2026-03-27": 6368.85,
        "2026-03-30": 6343.72,
        "2026-03-31": 6528.52,
    }

    out = engine._extend_nav_points_with_benchmark(points, bench_map, limit=10)

    assert [row["date"] for row in out] == ["2026-03-27", "2026-03-30", "2026-03-31"]
    assert out[-1]["nav"] == 101.0
    assert out[-1]["bench"] == 6528.52
    assert out[-1]["twr"] == 1.01
