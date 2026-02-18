from datetime import datetime
from typing import Dict, Any, List

import numpy as np
import pandas as pd

from ..config import settings
from . import legacy_engine as engine

STAMP_SOURCE = "demo" if settings.demo_mode else "local" if settings.marketdata_only else "schwab"


def _stamp():
    return {
        "asof": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source": STAMP_SOURCE,
        "method_version": settings.method_version,
    }


def _position_exposure_breakdown(positions: List[Dict[str, Any]]) -> Dict[str, Any]:
    gross = 0.0
    net = 0.0
    long_exposure = 0.0
    short_exposure = 0.0
    class_long: dict[str, float] = {"equity": 0.0, "option": 0.0, "future": 0.0}
    class_short: dict[str, float] = {"equity": 0.0, "option": 0.0, "future": 0.0}
    abs_values: list[float] = []
    futures_notional = 0.0

    for row in positions:
        mv = float(row.get("market_value") or 0.0)
        asset_class = (row.get("asset_class") or "equity").lower()
        gross += abs(mv)
        net += mv
        if mv >= 0:
            long_exposure += mv
            class_long[asset_class] = class_long.get(asset_class, 0.0) + mv
        else:
            short_exposure += abs(mv)
            class_short[asset_class] = class_short.get(asset_class, 0.0) + abs(mv)
        abs_values.append(abs(mv))
        if asset_class == "future":
            futures_notional += abs(mv)

    abs_values.sort(reverse=True)
    return {
        "gross": gross,
        "net": net,
        "long": long_exposure,
        "short": short_exposure,
        "class_long": class_long,
        "class_short": class_short,
        "top1": abs_values[0] if abs_values else 0.0,
        "top5": sum(abs_values[:5]) if abs_values else 0.0,
        "futures_notional": futures_notional,
    }


def get_risk_summary() -> Dict[str, Any]:
    snapshot = engine.get_snapshot(account=None)
    positions = snapshot.get("positions") or []
    nlv = float(snapshot.get("nlv") or 0.0)

    nav_points = engine.get_nav_series(limit=400, account=None)
    nav_df = None
    if nav_points:
        nav_vals = np.array([float(p.get("nav") or 0.0) for p in nav_points], dtype=float)
        nav_df = pd.DataFrame({"nav": nav_vals})

    exposures = _position_exposure_breakdown(positions)
    gross = exposures["gross"]
    net = exposures["net"]

    var_pack = engine.compute_var_metrics_from_nav(nav_df, current_nav=nlv) if nav_df is not None else {"var95_usd": 0.0}
    dd_pack = engine.compute_drawdown_mdd(nav_df) if nav_df is not None else {"mdd_pct": 0.0}
    ss_pack = engine.compute_sharpe_sortino(nav_df) if nav_df is not None else {"sharpe": 0.0, "sortino": 0.0}

    top1_conc = (exposures["top1"] / nlv) if nlv else 0.0
    top5_conc = (exposures["top5"] / nlv) if nlv else 0.0

    matrix = {}
    for cls in ["equity", "option", "future"]:
        long_val = exposures["class_long"].get(cls, 0.0)
        short_val = exposures["class_short"].get(cls, 0.0)
        matrix[f"matrix_{cls}_long"] = (long_val / gross) if gross else 0.0
        matrix[f"matrix_{cls}_short"] = (short_val / gross) if gross else 0.0
        matrix[f"matrix_{cls}_net"] = ((long_val - short_val) / gross) if gross else 0.0

    metrics = [
        {"metric": "gross_exposure", "value": gross, "breached": False},
        {"metric": "net_exposure", "value": net, "breached": False},
        {"metric": "long_exposure", "value": exposures["long"], "breached": False},
        {"metric": "short_exposure", "value": exposures["short"], "breached": False},
        {"metric": "beta", "value": 0.0, "breached": False},
        {"metric": "sharpe", "value": float(ss_pack.get("sharpe", 0.0)), "breached": False},
        {"metric": "max_drawdown", "value": float(dd_pack.get("mdd_pct", 0.0)) / 100.0, "breached": False},
        {"metric": "var_95", "value": float(var_pack.get("var95_usd", 0.0)), "breached": False},
        {"metric": "delta", "value": (net / gross) if gross else 0.0, "breached": False},
        {"metric": "delta_exposure", "value": 0.0, "breached": False},
        {"metric": "gamma_exposure", "value": 0.0, "breached": False},
        {"metric": "theta_exposure", "value": 0.0, "breached": False},
        {"metric": "vega_exposure", "value": 0.0, "breached": False},
        {"metric": "top1_concentration", "value": top1_conc, "breached": False},
        {"metric": "top5_concentration", "value": top5_conc, "breached": False},
        {"metric": "futures_notional", "value": exposures["futures_notional"], "breached": False},
    ]

    for key, value in matrix.items():
        metrics.append({"metric": key, "value": value, "breached": False})

    return {"stamp": _stamp(), "metrics": metrics}
