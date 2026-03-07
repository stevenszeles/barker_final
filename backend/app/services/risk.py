from datetime import datetime
from typing import Dict, Any, List, Optional

import numpy as np
import pandas as pd

from ..config import settings
from . import legacy_engine as engine

STAMP_SOURCE = "demo" if settings.demo_mode else "local" if settings.marketdata_only else "schwab"
TRADING_DAYS = 252.0
RISK_FREE_ANNUAL = 0.02


def _stamp() -> Dict[str, str]:
    return {
        "asof": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source": STAMP_SOURCE,
        "method_version": settings.method_version,
    }


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        out = float(value)
        if np.isfinite(out):
            return out
    except Exception:
        pass
    return default


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
        mv = _safe_float(row.get("market_value"), 0.0)
        asset_class = str(row.get("asset_class") or "equity").lower()
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


def _greek_exposures(positions: List[Dict[str, Any]]) -> Dict[str, float]:
    delta_exp = 0.0
    gamma_exp = 0.0
    theta_exp = 0.0
    vega_exp = 0.0
    for row in positions:
        qty = _safe_float(row.get("qty"), 0.0)
        px = _safe_float(row.get("price"), 0.0)
        mult = _safe_float(row.get("multiplier"), 1.0) or 1.0
        notion = qty * px * mult
        delta_exp += _safe_float(row.get("delta"), 0.0) * notion
        gamma_exp += _safe_float(row.get("gamma"), 0.0) * qty * mult
        theta_exp += _safe_float(row.get("theta"), 0.0) * qty * mult
        vega_exp += _safe_float(row.get("vega"), 0.0) * qty * mult
    return {
        "delta_exposure": delta_exp,
        "gamma_exposure": gamma_exp,
        "theta_exposure": theta_exp,
        "vega_exposure": vega_exp,
    }


def _build_nav_frame(limit: int = 900) -> pd.DataFrame:
    points = engine.get_nav_series(limit=limit, account=None) or []
    if not points:
        return pd.DataFrame(columns=["date", "portfolio_index", "bench_index", "portfolio_ret", "bench_ret"])
    df = pd.DataFrame(points)
    if df.empty:
        return pd.DataFrame(columns=["date", "portfolio_index", "bench_index", "portfolio_ret", "bench_ret"])

    df["date"] = df["date"].astype(str)
    df["nav"] = pd.to_numeric(df.get("nav"), errors="coerce").fillna(0.0).astype(float)
    df["twr"] = pd.to_numeric(df.get("twr"), errors="coerce")
    df["bench"] = pd.to_numeric(df.get("bench"), errors="coerce")
    df = df.sort_values("date").drop_duplicates("date", keep="last")

    twr_ok = df["twr"].where(df["twr"].notna() & np.isfinite(df["twr"]), np.nan)
    portfolio_index = twr_ok.where(twr_ok > 0, np.nan)
    portfolio_index = portfolio_index.fillna(df["nav"])
    portfolio_index = portfolio_index.where(portfolio_index > 0, np.nan)
    portfolio_index = portfolio_index.ffill().fillna(1.0)

    bench_index = df["bench"].where(df["bench"] > 0, np.nan).ffill()
    if bench_index.isna().all():
        bench_index = pd.Series(np.nan, index=df.index)

    out = pd.DataFrame({"date": df["date"], "portfolio_index": portfolio_index, "bench_index": bench_index})
    out["portfolio_ret"] = out["portfolio_index"].pct_change()
    out["bench_ret"] = out["bench_index"].pct_change()
    return out


def _return_stats(nav_df: pd.DataFrame) -> Dict[str, float]:
    stats = {
        "annualized_return": 0.0,
        "annualized_volatility": 0.0,
        "downside_volatility": 0.0,
        "sharpe": 0.0,
        "sortino": 0.0,
        "max_drawdown": 0.0,
        "current_drawdown": 0.0,
        "calmar": 0.0,
        "var_95_pct": 0.0,
        "cvar_95_pct": 0.0,
        "beta": 0.0,
        "benchmark_correlation": 0.0,
        "tracking_error": 0.0,
        "information_ratio": 0.0,
        "win_rate": 0.0,
        "best_day_return": 0.0,
        "worst_day_return": 0.0,
    }
    if nav_df is None or nav_df.empty:
        return stats

    port = nav_df["portfolio_ret"].dropna().astype(float)
    if len(port) < 2:
        return stats

    rf_daily = (1.0 + RISK_FREE_ANNUAL) ** (1.0 / TRADING_DAYS) - 1.0
    mean_daily = float(port.mean())
    vol_daily = float(port.std(ddof=1)) if len(port) > 1 else 0.0
    downside = port[port < 0]
    down_daily = float(downside.std(ddof=1)) if len(downside) > 1 else 0.0

    years = max(len(port) / TRADING_DAYS, 1e-9)
    total_growth = float(np.prod(1.0 + port.to_numpy(dtype=float)))
    if total_growth > 0:
        stats["annualized_return"] = float(total_growth ** (1.0 / years) - 1.0)
    stats["annualized_volatility"] = float(vol_daily * np.sqrt(TRADING_DAYS))
    stats["downside_volatility"] = float(down_daily * np.sqrt(TRADING_DAYS))

    excess_mean = mean_daily - rf_daily
    if vol_daily > 1e-12:
        stats["sharpe"] = float((excess_mean / vol_daily) * np.sqrt(TRADING_DAYS))
    if down_daily > 1e-12:
        stats["sortino"] = float((excess_mean / down_daily) * np.sqrt(TRADING_DAYS))

    eq_curve = (1.0 + port).cumprod()
    peak = eq_curve.cummax()
    drawdown = (eq_curve / peak) - 1.0
    stats["max_drawdown"] = float(drawdown.min()) if len(drawdown) else 0.0
    stats["current_drawdown"] = float(drawdown.iloc[-1]) if len(drawdown) else 0.0
    if abs(stats["max_drawdown"]) > 1e-12:
        stats["calmar"] = float(stats["annualized_return"] / abs(stats["max_drawdown"]))

    q05 = float(np.quantile(port.to_numpy(dtype=float), 0.05))
    stats["var_95_pct"] = max(0.0, -q05)
    tail = port[port <= q05]
    if len(tail):
        stats["cvar_95_pct"] = max(0.0, -float(tail.mean()))

    stats["win_rate"] = float((port > 0).mean())
    stats["best_day_return"] = float(port.max())
    stats["worst_day_return"] = float(port.min())

    if "bench_ret" in nav_df.columns:
        aligned = nav_df[["portfolio_ret", "bench_ret"]].dropna().astype(float)
        if len(aligned) >= 20:
            cov = np.cov(aligned["portfolio_ret"], aligned["bench_ret"], ddof=1)
            var_b = float(cov[1, 1])
            if var_b > 1e-12:
                stats["beta"] = float(cov[0, 1] / var_b)
            corr = aligned["portfolio_ret"].corr(aligned["bench_ret"])
            stats["benchmark_correlation"] = float(corr) if np.isfinite(corr) else 0.0
            active = aligned["portfolio_ret"] - aligned["bench_ret"]
            te = float(active.std(ddof=1) * np.sqrt(TRADING_DAYS)) if len(active) > 1 else 0.0
            stats["tracking_error"] = te
            if te > 1e-12:
                stats["information_ratio"] = float((active.mean() * TRADING_DAYS) / te)
    return stats


def _metric_row(metric: str, value: float, limit: Optional[float] = None) -> Dict[str, Any]:
    breached = bool(limit is not None and np.isfinite(limit) and np.isfinite(value) and abs(value) > abs(limit))
    return {"metric": metric, "value": float(value), "limit": limit, "breached": breached}


def _build_metrics(snapshot: Dict[str, Any], nav_df: pd.DataFrame) -> List[Dict[str, Any]]:
    positions = snapshot.get("positions") or []
    nlv = _safe_float(snapshot.get("nlv"), 0.0)
    exposures = _position_exposure_breakdown(positions)
    greeks = _greek_exposures(positions)
    ret_stats = _return_stats(nav_df)

    gross = exposures["gross"]
    net = exposures["net"]
    top1_conc = (exposures["top1"] / nlv) if nlv else 0.0
    top5_conc = (exposures["top5"] / nlv) if nlv else 0.0

    metrics = [
        _metric_row("gross_exposure", gross),
        _metric_row("net_exposure", net),
        _metric_row("long_exposure", exposures["long"]),
        _metric_row("short_exposure", exposures["short"]),
        _metric_row("beta", ret_stats["beta"]),
        _metric_row("benchmark_correlation", ret_stats["benchmark_correlation"]),
        _metric_row("sharpe", ret_stats["sharpe"]),
        _metric_row("sortino", ret_stats["sortino"]),
        _metric_row("calmar", ret_stats["calmar"]),
        _metric_row("annualized_return", ret_stats["annualized_return"]),
        _metric_row("annualized_volatility", ret_stats["annualized_volatility"]),
        _metric_row("downside_volatility", ret_stats["downside_volatility"]),
        _metric_row("max_drawdown", ret_stats["max_drawdown"]),
        _metric_row("current_drawdown", ret_stats["current_drawdown"]),
        _metric_row("var_95", ret_stats["var_95_pct"] * nlv),
        _metric_row("var_95_pct", ret_stats["var_95_pct"]),
        _metric_row("cvar_95_pct", ret_stats["cvar_95_pct"]),
        _metric_row("tracking_error", ret_stats["tracking_error"]),
        _metric_row("information_ratio", ret_stats["information_ratio"]),
        _metric_row("win_rate", ret_stats["win_rate"]),
        _metric_row("best_day_return", ret_stats["best_day_return"]),
        _metric_row("worst_day_return", ret_stats["worst_day_return"]),
        _metric_row("delta", (net / gross) if gross else 0.0),
        _metric_row("delta_exposure", greeks["delta_exposure"]),
        _metric_row("gamma_exposure", greeks["gamma_exposure"]),
        _metric_row("theta_exposure", greeks["theta_exposure"]),
        _metric_row("vega_exposure", greeks["vega_exposure"]),
        _metric_row("top1_concentration", top1_conc),
        _metric_row("top5_concentration", top5_conc),
        _metric_row("futures_notional", exposures["futures_notional"]),
    ]

    for cls in ["equity", "option", "future"]:
        long_val = exposures["class_long"].get(cls, 0.0)
        short_val = exposures["class_short"].get(cls, 0.0)
        metrics.append(_metric_row(f"matrix_{cls}_long", (long_val / gross) if gross else 0.0))
        metrics.append(_metric_row(f"matrix_{cls}_short", (short_val / gross) if gross else 0.0))
        metrics.append(_metric_row(f"matrix_{cls}_net", ((long_val - short_val) / gross) if gross else 0.0))
    return metrics


def _top_sector_labels(positions: List[Dict[str, Any]], max_count: int = 4) -> List[str]:
    agg: Dict[str, float] = {}
    for row in positions:
        sector = str(row.get("sector") or "").strip()
        if not sector:
            continue
        agg[sector] = agg.get(sector, 0.0) + abs(_safe_float(row.get("market_value"), 0.0))
    ranked = sorted(agg.items(), key=lambda kv: kv[1], reverse=True)
    return [name for name, _ in ranked[:max_count]]


def _series_from_sector(sector: str, limit: int = 700) -> pd.Series:
    points = engine.get_sector_series(sector=sector, limit=limit, source="auto", account=None) or []
    if not points:
        return pd.Series(dtype=float, name=sector)
    df = pd.DataFrame(points)
    if df.empty:
        return pd.Series(dtype=float, name=sector)
    df["date"] = df["date"].astype(str)
    df["sector"] = pd.to_numeric(df["sector"], errors="coerce")
    df = df.dropna(subset=["sector"]).sort_values("date").drop_duplicates("date", keep="last")
    if df.empty:
        return pd.Series(dtype=float, name=sector)
    idx = 1.0 + (df["sector"].astype(float) / 100.0)
    ret = idx.pct_change()
    out = pd.Series(ret.to_numpy(dtype=float), index=df["date"].tolist(), name=sector).dropna()
    return out


def _correlation_payload(nav_df: pd.DataFrame, positions: List[Dict[str, Any]]) -> Dict[str, Any]:
    empty = {"labels": [], "matrix": [], "observations": 0}
    if nav_df is None or nav_df.empty:
        return empty
    series_map: Dict[str, pd.Series] = {}
    p = pd.Series(nav_df["portfolio_ret"].to_numpy(dtype=float), index=nav_df["date"].astype(str).tolist(), name="Portfolio").dropna()
    if len(p):
        series_map["Portfolio"] = p
    b = pd.Series(nav_df["bench_ret"].to_numpy(dtype=float), index=nav_df["date"].astype(str).tolist(), name="SPX").dropna()
    if len(b):
        series_map["SPX"] = b

    for sector in _top_sector_labels(positions, max_count=4):
        s = _series_from_sector(sector, limit=700)
        if len(s) >= 20:
            series_map[sector] = s

    if len(series_map) < 2:
        return empty
    aligned = pd.concat(series_map.values(), axis=1, join="inner").dropna(how="any")
    if aligned.empty or len(aligned) < 20:
        return empty
    corr = aligned.corr().fillna(0.0).clip(-1.0, 1.0)
    labels = corr.columns.tolist()
    matrix = [[float(corr.loc[row, col]) for col in labels] for row in labels]
    return {"labels": labels, "matrix": matrix, "observations": int(len(aligned))}


def _rolling_payload(nav_df: pd.DataFrame, max_points: int = 180) -> Dict[str, Any]:
    if nav_df is None or nav_df.empty:
        return {"dates": [], "portfolio_vol_20d": [], "benchmark_vol_20d": [], "tracking_error_20d": [], "drawdown": []}

    frame = nav_df.copy()
    frame = frame.dropna(subset=["portfolio_index"]).sort_values("date")
    if frame.empty:
        return {"dates": [], "portfolio_vol_20d": [], "benchmark_vol_20d": [], "tracking_error_20d": [], "drawdown": []}

    pr = frame["portfolio_ret"].astype(float)
    br = frame["bench_ret"].astype(float)
    pvol = pr.rolling(20).std(ddof=1) * np.sqrt(TRADING_DAYS)
    bvol = br.rolling(20).std(ddof=1) * np.sqrt(TRADING_DAYS)
    te = (pr - br).rolling(20).std(ddof=1) * np.sqrt(TRADING_DAYS)

    eq = frame["portfolio_index"].astype(float)
    peak = eq.cummax()
    drawdown = (eq / peak) - 1.0

    out = pd.DataFrame(
        {
            "date": frame["date"].astype(str),
            "portfolio_vol_20d": pvol,
            "benchmark_vol_20d": bvol,
            "tracking_error_20d": te,
            "drawdown": drawdown,
        }
    )
    out = out.dropna(how="all", subset=["portfolio_vol_20d", "benchmark_vol_20d", "tracking_error_20d", "drawdown"])
    if len(out) > max_points:
        out = out.tail(max_points)
    return {
        "dates": out["date"].astype(str).tolist(),
        "portfolio_vol_20d": [float(v) if np.isfinite(v) else 0.0 for v in out["portfolio_vol_20d"].tolist()],
        "benchmark_vol_20d": [float(v) if np.isfinite(v) else 0.0 for v in out["benchmark_vol_20d"].tolist()],
        "tracking_error_20d": [float(v) if np.isfinite(v) else 0.0 for v in out["tracking_error_20d"].tolist()],
        "drawdown": [float(v) if np.isfinite(v) else 0.0 for v in out["drawdown"].tolist()],
    }


def get_risk_summary() -> Dict[str, Any]:
    snapshot = engine.get_snapshot(account=None)
    nav_df = _build_nav_frame(limit=900)
    metrics = _build_metrics(snapshot, nav_df)
    return {"stamp": _stamp(), "metrics": metrics}


def get_risk_profile() -> Dict[str, Any]:
    snapshot = engine.get_snapshot(account=None)
    positions = snapshot.get("positions") or []
    nav_df = _build_nav_frame(limit=900)
    metrics = _build_metrics(snapshot, nav_df)
    return {
        "stamp": _stamp(),
        "metrics": metrics,
        "correlation": _correlation_payload(nav_df, positions),
        "rolling": _rolling_payload(nav_df),
    }
