from __future__ import annotations

import math
import re
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Tuple


SeriesPoint = Tuple[str, float]
PriceSeriesLoader = Callable[[str, str], List[SeriesPoint]]

SECTOR_OVERRIDE_AUTO = "__AUTO__"

_US_DATE_RE = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$")

FUTURES_ROOT_TO_SECTOR = {
    "/ES": "Equities",
    "/MES": "Equities",
    "/NQ": "Equities",
    "/MNQ": "Equities",
    "/RTY": "Equities",
    "/M2K": "Equities",
    "/YM": "Equities",
    "/MYM": "Equities",
    "/BTC": "Crypto",
    "/MBT": "Crypto",
    "/ETH": "Crypto",
    "/MET": "Crypto",
    "/GC": "Commodities",
    "/MGC": "Commodities",
    "/SI": "Commodities",
    "/SIL": "Commodities",
    "/HG": "Commodities",
    "/MHG": "Commodities",
    "/CL": "Commodities",
    "/MCL": "Commodities",
    "/NG": "Commodities",
    "/MNG": "Commodities",
    "/RB": "Commodities",
    "/HO": "Commodities",
    "/ZC": "Commodities",
    "/ZS": "Commodities",
    "/ZW": "Commodities",
    "/ZM": "Commodities",
    "/ZL": "Commodities",
    "/KE": "Commodities",
    "/HE": "Commodities",
    "/LE": "Commodities",
    "/GF": "Commodities",
    "/CC": "Commodities",
    "/KC": "Commodities",
    "/CT": "Commodities",
    "/SB": "Commodities",
    "/OJ": "Commodities",
    "/PL": "Commodities",
    "/PA": "Commodities",
}


def as_plain_object(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def normalize_account_name(value: Any) -> str:
    raw = str(value or "").replace('"', "").strip()
    if not raw:
        return ""

    llc_match = re.match(r"Limit(?:_| )Liability(?:_| )Company\s+\.{3}(\d+)", raw, re.IGNORECASE)
    if llc_match:
        return f"Limit_Liability_Company ...{llc_match.group(1)}"

    indiv_match = re.match(r"Individual\s+\.{3}(\d+)", raw, re.IGNORECASE)
    if indiv_match:
        return f"Individual ...{indiv_match.group(1)}"

    return re.sub(r"\s+", " ", raw)


def normalize_date_input(value: Any) -> Optional[str]:
    if value is None:
        return None
    trimmed = str(value).replace('"', "").strip()
    if not trimmed:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}$", trimmed):
        return trimmed

    us_match = _US_DATE_RE.match(trimmed)
    if us_match:
        month, day, year = us_match.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"

    candidate = trimmed.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(candidate).date().isoformat()
    except Exception:
        pass

    if len(trimmed) >= 10 and re.match(r"^\d{4}-\d{2}-\d{2}", trimmed[:10]):
        return trimmed[:10]
    return None


def format_override_number(value: Any) -> str:
    try:
        numeric = float(value)
    except Exception:
        return ""
    if not math.isfinite(numeric):
        return ""
    if float(numeric).is_integer():
        return str(int(numeric))
    return f"{numeric:.6f}".rstrip("0").rstrip(".")


def get_legacy_realized_trade_override_key(trade: Dict[str, Any]) -> Optional[str]:
    if not isinstance(trade, dict):
        return None
    closed_date = normalize_date_input(trade.get("closedDate")) or str(trade.get("closedDate") or "")
    opened_date = normalize_date_input(trade.get("openedDate")) or str(trade.get("openedDate") or "")
    return "::".join(
        [
            "REALIZED",
            normalize_account_name(trade.get("account")),
            str(trade.get("symbol") or ""),
            closed_date,
            opened_date,
            str(trade.get("qty") or ""),
            str(trade.get("proceeds") or ""),
            str(trade.get("cost") or ""),
        ]
    )


def get_realized_trade_override_keys(trade: Dict[str, Any]) -> List[str]:
    if not isinstance(trade, dict):
        return []
    account_name = normalize_account_name(trade.get("account"))
    closed_date = normalize_date_input(trade.get("closedDate")) or str(trade.get("closedDate") or "").strip()
    opened_date = normalize_date_input(trade.get("openedDate")) or str(trade.get("openedDate") or "").strip()
    symbol = str(trade.get("symbol") or "").strip()
    base_symbol = str(trade.get("baseSym") or "").strip()
    qty = format_override_number(abs(float(trade.get("qty") or 0.0)))
    term = str(trade.get("term") or "").strip().upper()
    trade_type = "OPT" if bool(trade.get("isOption")) else "EQ"
    stable_keys = [
        "::".join(["REALIZED_V2", account_name, symbol, closed_date, opened_date, qty, term, trade_type]),
    ]
    if base_symbol and base_symbol != symbol:
        stable_keys.append("::".join(["REALIZED_V2", account_name, base_symbol, closed_date, opened_date, qty, term, trade_type]))
    legacy_key = get_legacy_realized_trade_override_key(trade)
    ordered = []
    for key in stable_keys + [legacy_key]:
        if key and key not in ordered:
            ordered.append(key)
    return ordered


def normalize_history_series(value: Any) -> List[SeriesPoint]:
    points: List[SeriesPoint] = []
    if not isinstance(value, list):
        return points
    for item in value:
        if not isinstance(item, (list, tuple)) or len(item) < 2:
            continue
        date_iso = normalize_date_input(item[0])
        try:
            numeric = float(item[1])
        except Exception:
            continue
        if date_iso and math.isfinite(numeric):
            points.append((date_iso, numeric))
    points.sort(key=lambda row: row[0])
    return points


def normalize_date_map(raw_map: Any) -> Dict[str, str]:
    normalized: Dict[str, str] = {}
    for key, value in as_plain_object(raw_map).items():
        date_iso = normalize_date_input(value)
        if key and date_iso:
            normalized[str(key)] = date_iso
    return normalized


def normalize_futures_pnl_snapshots(raw_snapshots: Any) -> Dict[str, Dict[str, float]]:
    normalized: Dict[str, Dict[str, float]] = {}
    for key, snapshot_map in as_plain_object(raw_snapshots).items():
        next_map: Dict[str, float] = {}
        for date_value, pnl_value in as_plain_object(snapshot_map).items():
            date_iso = normalize_date_input(date_value)
            try:
                numeric = float(pnl_value)
            except Exception:
                continue
            if date_iso and math.isfinite(numeric):
                next_map[date_iso] = numeric
        if next_map:
            normalized[str(key)] = next_map
    return normalized


def normalize_shared_dashboard_state(raw_state: Any) -> Dict[str, Any]:
    raw_accounts = as_plain_object(as_plain_object(raw_state).get("accounts"))
    accounts: Dict[str, Dict[str, Any]] = {}
    for account_name, raw_account in raw_accounts.items():
        normalized_name = normalize_account_name(account_name)
        if not normalized_name:
            continue
        account_payload = as_plain_object(raw_account)
        raw_positions = account_payload.get("positions")
        positions: List[Dict[str, Any]] = []
        if isinstance(raw_positions, list):
            for raw_position in raw_positions:
                if not isinstance(raw_position, dict):
                    continue
                position = dict(raw_position)
                held_account = normalize_account_name(
                    position.get("custodyAccount") or position.get("account") or normalized_name
                ) or normalized_name
                position["account"] = normalize_account_name(position.get("account") or normalized_name) or normalized_name
                position["custodyAccount"] = held_account
                positions.append(position)
        account_payload["positions"] = positions
        accounts[normalized_name] = account_payload

    raw_balance_history = as_plain_object(as_plain_object(raw_state).get("balanceHistory"))
    balance_history = {
        normalize_account_name(account_name): normalize_history_series(series)
        for account_name, series in raw_balance_history.items()
        if normalize_account_name(account_name)
    }

    realized_trades: List[Dict[str, Any]] = []
    for raw_trade in as_plain_object(raw_state).get("realizedTrades") or []:
        if not isinstance(raw_trade, dict):
            continue
        trade = dict(raw_trade)
        trade["account"] = normalize_account_name(trade.get("account"))
        if not trade["account"]:
            continue
        realized_trades.append(trade)

    account_names = sorted(
        {
            account_name
            for account_name in list(accounts.keys()) + list(balance_history.keys())
            if account_name and account_name != "ALL"
        }
    )

    return {
        "accounts": accounts,
        "balanceHistory": balance_history,
        "realizedTrades": realized_trades,
        "sectorOverrides": as_plain_object(as_plain_object(raw_state).get("sectorOverrides")),
        "positionAttributionOverrides": as_plain_object(as_plain_object(raw_state).get("positionAttributionOverrides")),
        "realizedTradeAttributionOverrides": as_plain_object(
            as_plain_object(raw_state).get("realizedTradeAttributionOverrides")
        ),
        "positionTransferEffectiveDates": normalize_date_map(as_plain_object(raw_state).get("positionTransferEffectiveDates")),
        "futuresPnlSnapshots": normalize_futures_pnl_snapshots(as_plain_object(raw_state).get("futuresPnlSnapshots")),
        "accountNames": account_names,
    }


def get_last_value_on_or_before(series: List[SeriesPoint], target_date: Optional[str]) -> Optional[SeriesPoint]:
    if not series or not target_date:
        return None
    for point in reversed(series):
        if point[0] <= target_date:
            return point
    return None


def get_first_value_on_or_after(series: List[SeriesPoint], target_date: Optional[str]) -> Optional[SeriesPoint]:
    if not series or not target_date:
        return None
    for point in series:
        if point[0] >= target_date:
            return point
    return None


def get_value_on_or_before(series: List[SeriesPoint], target_date: Optional[str]) -> Optional[float]:
    point = get_last_value_on_or_before(series, target_date)
    return point[1] if point else None


def expand_history_to_dates(series: List[SeriesPoint], dates: List[str]) -> List[SeriesPoint]:
    points = series or []
    index = 0
    last_value = 0.0
    out: List[SeriesPoint] = []
    for date_value in dates:
        while index < len(points) and points[index][0] <= date_value:
            last_value = points[index][1]
            index += 1
        out.append((date_value, last_value if math.isfinite(last_value) else 0.0))
    return out


def compute_daily_flow_from_twr(prev_nav: float, next_nav: float, prev_twr: float, next_twr: float) -> float:
    if not all(math.isfinite(value) for value in [prev_nav, next_nav, prev_twr, next_twr]):
        return 0.0
    if prev_nav == 0 or prev_twr == 0:
        return 0.0
    day_return = (next_twr / prev_twr) - 1.0
    if not math.isfinite(day_return):
        return 0.0
    return next_nav - prev_nav - (prev_nav * day_return)


def build_performance_model_from_nav_points(
    points: List[Dict[str, Any]],
    fallback_series: List[SeriesPoint],
) -> Dict[str, Any]:
    nav_series: List[Dict[str, Any]] = []
    if isinstance(points, list) and points:
        for point in points:
            if not isinstance(point, dict):
                continue
            date_iso = str(point.get("date") or "")
            try:
                nav = float(point.get("nav"))
            except Exception:
                continue
            try:
                twr = float(point.get("twr"))
            except Exception:
                twr = math.nan
            if not date_iso or not math.isfinite(nav):
                continue
            nav_series.append({"date": date_iso, "nav": nav, "twr": twr if math.isfinite(twr) and twr > 0 else None})
    else:
        for date_iso, nav in fallback_series or []:
            if date_iso and math.isfinite(nav):
                nav_series.append({"date": date_iso, "nav": nav, "twr": None})

    if not nav_series:
        return {"navSeries": [], "twrSeries": [], "flowSeries": [], "hasFlowAdjustedReturns": False}

    base_nav = nav_series[0]["nav"]
    has_flow_adjusted_returns = any(point.get("twr") is not None for point in nav_series)
    previous_twr: Optional[float] = None
    twr_series: List[SeriesPoint] = []
    flow_series: List[SeriesPoint] = []

    for index, point in enumerate(nav_series):
        twr_value = point.get("twr")
        if twr_value is None or not math.isfinite(float(twr_value)) or float(twr_value) <= 0:
            twr_value = point["nav"] / base_nav if math.isfinite(base_nav) and base_nav != 0 else 1.0
            has_flow_adjusted_returns = False
        twr_value = float(twr_value)
        twr_series.append((point["date"], twr_value))
        if index == 0:
            flow_series.append((point["date"], 0.0))
            previous_twr = twr_value
            continue
        flow = (
            compute_daily_flow_from_twr(nav_series[index - 1]["nav"], point["nav"], previous_twr or 1.0, twr_value)
            if has_flow_adjusted_returns
            else 0.0
        )
        flow_series.append((point["date"], flow if math.isfinite(flow) else 0.0))
        previous_twr = twr_value

    return {
        "navSeries": [(point["date"], point["nav"]) for point in nav_series],
        "twrSeries": twr_series,
        "flowSeries": flow_series,
        "hasFlowAdjustedReturns": has_flow_adjusted_returns,
    }


def build_aggregate_performance_model(models: Dict[str, Dict[str, Any]], account_names: List[str]) -> Dict[str, Any]:
    selected_models = [models.get(name) for name in account_names or []]
    selected_models = [model for model in selected_models if model and model.get("navSeries")]
    if not selected_models:
        return {"navSeries": [], "twrSeries": [], "flowSeries": [], "hasFlowAdjustedReturns": False}

    dates = sorted({date_value for model in selected_models for date_value, _ in model.get("navSeries", [])})
    nav_maps = [{date_value: nav for date_value, nav in expand_history_to_dates(model.get("navSeries", []), dates)} for model in selected_models]
    flow_maps = [{date_value: flow for date_value, flow in model.get("flowSeries", [])} for model in selected_models]

    nav_series: List[SeriesPoint] = []
    flow_series: List[SeriesPoint] = []
    twr_series: List[SeriesPoint] = []
    previous_nav: Optional[float] = None
    cumulative = 1.0

    for date_value in dates:
        nav = sum(value_map.get(date_value, 0.0) for value_map in nav_maps)
        flow = sum(value_map.get(date_value, 0.0) for value_map in flow_maps)
        nav_series.append((date_value, nav))
        flow_series.append((date_value, flow))
        if previous_nav is None or not math.isfinite(previous_nav) or previous_nav == 0:
            cumulative = 1.0
        else:
            day_return = (nav - previous_nav - flow) / previous_nav
            if math.isfinite(day_return):
                cumulative *= 1.0 + day_return
        twr_series.append((date_value, cumulative))
        previous_nav = nav

    return {
        "navSeries": nav_series,
        "twrSeries": twr_series,
        "flowSeries": flow_series,
        "hasFlowAdjustedReturns": all(bool(model.get("hasFlowAdjustedReturns")) for model in selected_models),
    }


def is_option_position(position: Dict[str, Any]) -> bool:
    return "option" in str(position.get("assetType") or "").lower()


def is_future_position(position: Dict[str, Any]) -> bool:
    return "future" in str(position.get("assetType") or "").lower()


def get_position_held_account(position: Dict[str, Any]) -> str:
    return normalize_account_name(position.get("custodyAccount") or position.get("account"))


def get_position_underlying(position: Dict[str, Any]) -> str:
    return str(
        position.get("baseSymbol")
        or position.get("overrideSymbol")
        or position.get("normalizedSymbol")
        or position.get("symbol")
        or ""
    ).strip().upper()


def get_position_snapshot_key(position: Dict[str, Any]) -> str:
    held_account = get_position_held_account(position)
    symbol = str(position.get("symbol") or position.get("normalizedSymbol") or "").strip().upper()
    asset_type = str(position.get("assetType") or "").strip().upper()
    return f"{held_account}::{symbol}::{asset_type}" if held_account and symbol else ""


def get_position_attribution_key(position: Dict[str, Any]) -> str:
    held_account = get_position_held_account(position)
    underlying = get_position_underlying(position)
    return f"{held_account}::{underlying}" if held_account and underlying else ""


def get_position_attributed_account(position: Dict[str, Any], overrides: Dict[str, str]) -> str:
    held_account = get_position_held_account(position)
    key = get_position_attribution_key(position)
    overridden = overrides.get(key) if key else None
    return normalize_account_name(overridden) or held_account


def get_position_display_account(position: Dict[str, Any]) -> str:
    return normalize_account_name(position.get("attributedAccount")) or get_position_held_account(position)


def get_realized_trade_attributed_account(trade: Dict[str, Any], overrides: Dict[str, str]) -> str:
    held_account = normalize_account_name(trade.get("account"))
    for key in get_realized_trade_override_keys(trade):
        overridden = overrides.get(key)
        if overridden:
            return normalize_account_name(overridden) or held_account
    return held_account


def get_realized_trade_display_account(trade: Dict[str, Any]) -> str:
    return normalize_account_name(trade.get("attributedAccount")) or normalize_account_name(trade.get("account"))


def get_futures_snapshot_series(position: Dict[str, Any], futures_pnl_snapshots: Dict[str, Dict[str, float]]) -> List[SeriesPoint]:
    snapshot_key = get_position_snapshot_key(position)
    snapshot_map = futures_pnl_snapshots.get(snapshot_key, {}) if snapshot_key else {}
    series = []
    for date_value, pnl in snapshot_map.items():
        date_iso = normalize_date_input(date_value)
        try:
            numeric = float(pnl)
        except Exception:
            continue
        if date_iso and math.isfinite(numeric):
            series.append((date_iso, numeric))
    series.sort(key=lambda row: row[0])
    return series


def get_position_transfer_effective_date(
    position: Dict[str, Any],
    position_transfer_effective_dates: Dict[str, str],
    futures_pnl_snapshots: Dict[str, Dict[str, float]],
) -> Optional[str]:
    key = get_position_attribution_key(position)
    explicit_date = normalize_date_input(position_transfer_effective_dates.get(key)) if key else None
    if explicit_date:
        return explicit_date
    if not is_future_position(position) and str(position.get("source") or "") != "futures_statement":
        return None
    snapshot_series = get_futures_snapshot_series(position, futures_pnl_snapshots)
    return snapshot_series[0][0] if snapshot_series else None


def get_future_root_symbol(symbol: Any) -> str:
    text = str(symbol or "").strip().upper()
    if not text:
        return ""
    match = re.match(r"^(/[A-Z]+)", text)
    return match.group(1) if match else ""


def get_position_pnl_value(position: Dict[str, Any]) -> float:
    try:
        market_value = float(position.get("mktVal"))
    except Exception:
        return math.nan
    try:
        cost_basis = float(position.get("costBasis"))
    except Exception:
        cost_basis = math.nan
    if is_future_position(position) and not is_option_position(position):
        return market_value
    return market_value - (cost_basis if math.isfinite(cost_basis) else 0.0)


def get_position_effective_multiplier(position: Dict[str, Any]) -> float:
    try:
        explicit = abs(float(position.get("multiplier")))
    except Exception:
        explicit = math.nan
    if math.isfinite(explicit) and explicit > 0:
        return explicit
    try:
        qty = float(position.get("qty"))
        price = float(position.get("price"))
        market_value = float(position.get("mktVal"))
    except Exception:
        return 1.0
    if not math.isfinite(qty) or qty == 0 or not math.isfinite(price) or price == 0 or not math.isfinite(market_value) or market_value == 0:
        return 1.0
    inferred = abs(market_value / (qty * price))
    return inferred if math.isfinite(inferred) and inferred > 0 else 1.0


def clamp_attributed_carry_value(value: float, final_value: float) -> float:
    if not math.isfinite(value) or not math.isfinite(final_value):
        return math.nan
    if abs(final_value) < 0.0001:
        return 0.0
    if final_value > 0:
        return min(final_value, max(0.0, value))
    return max(final_value, min(0.0, value))


def build_carry_weights_from_source_history(dates: List[str], source_history: List[SeriesPoint]) -> List[float]:
    if len(dates) < 2 or not source_history:
        return []
    weights: List[float] = []
    for index, date_value in enumerate(dates[1:]):
        current_value = get_value_on_or_before(source_history, date_value)
        previous_value = get_value_on_or_before(source_history, dates[index])
        delta = (current_value if math.isfinite(current_value or math.nan) else 0.0) - (
            previous_value if math.isfinite(previous_value or math.nan) else 0.0
        )
        weights.append(abs(delta))
    return weights


def build_monotonic_carry_series(
    dates: List[str],
    final_value: float,
    start_value: float = 0.0,
    weights: Optional[List[float]] = None,
    last_step_delta: Optional[float] = None,
) -> List[SeriesPoint]:
    if not dates or not math.isfinite(final_value):
        return []
    if len(dates) == 1:
        return [(dates[0], final_value)]

    series: List[SeriesPoint] = []
    penultimate_target = final_value - last_step_delta if last_step_delta is not None and math.isfinite(last_step_delta) else final_value
    clamped_start = clamp_attributed_carry_value(start_value, final_value)
    head_dates = dates[:-1]

    if len(head_dates) == 1:
        series.append((head_dates[0], clamped_start))
    else:
        normalized_weights = []
        for index in range(1, len(head_dates)):
            candidate = weights[index - 1] if weights and index - 1 < len(weights) else math.nan
            normalized_weights.append(candidate if math.isfinite(candidate) and candidate > 0 else 1.0)
        total_weight = sum(normalized_weights) or float(len(normalized_weights) or 1)
        cumulative_weight = 0.0
        for index, date_value in enumerate(head_dates):
            if index == 0:
                series.append((date_value, clamped_start))
                continue
            cumulative_weight += normalized_weights[index - 1]
            progress = cumulative_weight / total_weight if total_weight else index / max(1, len(head_dates) - 1)
            interpolated = clamped_start + ((penultimate_target - clamped_start) * progress)
            series.append((date_value, clamp_attributed_carry_value(interpolated, final_value)))

    series.append((dates[-1], final_value))
    return series


def build_transfer_delta_series(
    raw_series: List[SeriesPoint],
    dates: List[str],
    effective_date: Optional[str],
    final_value: Optional[float] = None,
) -> List[SeriesPoint]:
    points = [(date_value, value) for date_value, value in raw_series if date_value and math.isfinite(value)]
    if not dates:
        return []
    if not effective_date:
        return points

    baseline = get_value_on_or_before(points, effective_date)
    if baseline is None:
        future_point = get_first_value_on_or_after(points, effective_date)
        baseline = future_point[1] if future_point else 0.0
    target_final = final_value - baseline if final_value is not None and math.isfinite(final_value) else (points[-1][1] - baseline if points else 0.0)

    out: List[SeriesPoint] = []
    for date_value in dates:
        if date_value <= effective_date:
            out.append((date_value, 0.0))
            continue
        value = get_value_on_or_before(points, date_value)
        out.append((date_value, (value - baseline) if value is not None and math.isfinite(value) else 0.0))
    if out:
        out[-1] = (out[-1][0], target_final)
    return out


def normalize_price_backed_carry_series(series: List[SeriesPoint], final_value: float) -> List[SeriesPoint]:
    points = [(date_value, value) for date_value, value in series if date_value and math.isfinite(value)]
    if not points or not math.isfinite(final_value):
        return []

    signal_index = -1
    for index, (_, value) in enumerate(points):
        if (final_value > 0 and value > 0.0001) or (final_value < 0 and value < -0.0001):
            signal_index = index
            break
    first_signal_index = signal_index if signal_index >= 0 else max(0, len(points) - 1)

    normalized: List[SeriesPoint] = []
    for index, (date_value, value) in enumerate(points):
        next_value = 0.0 if index < first_signal_index else clamp_attributed_carry_value(value, final_value)
        normalized.append((date_value, next_value))
    if normalized:
        normalized[-1] = (normalized[-1][0], final_value)
    return normalized


def estimate_attributed_position_pnl_series(
    position: Dict[str, Any],
    dates: List[str],
    source_history: List[SeriesPoint],
    price_series: List[SeriesPoint],
    effective_date: Optional[str] = None,
    futures_snapshot_series: Optional[List[SeriesPoint]] = None,
) -> Tuple[List[SeriesPoint], str]:
    current_pnl = get_position_pnl_value(position)
    if not dates or not math.isfinite(current_pnl) or abs(current_pnl) < 0.0001:
        return [], "none"

    snapshot_series = futures_snapshot_series or []
    if snapshot_series:
        raw_series = expand_history_to_dates(snapshot_series, dates)
        series = build_transfer_delta_series(raw_series, dates, effective_date, current_pnl)
        if series:
            return series, "snapshot"

    latest_price = price_series[-1][1] if price_series else math.nan
    try:
        reference_price = float(position.get("price"))
    except Exception:
        reference_price = math.nan
    scale_price = reference_price if math.isfinite(reference_price) and reference_price != 0 else latest_price
    try:
        qty = float(position.get("qty"))
    except Exception:
        qty = math.nan
    multiplier = get_position_effective_multiplier(position)

    if (
        price_series
        and math.isfinite(scale_price)
        and scale_price != 0
        and math.isfinite(qty)
        and qty != 0
        and math.isfinite(multiplier)
        and multiplier != 0
    ):
        signed_exposure = qty * multiplier
        try:
            explicit_cost_basis = float(position.get("costBasis"))
        except Exception:
            explicit_cost_basis = math.nan
        entry_price = (
            explicit_cost_basis / signed_exposure
            if math.isfinite(explicit_cost_basis) and signed_exposure != 0
            else scale_price - (current_pnl / signed_exposure)
        )
        if math.isfinite(entry_price):
            raw_series = []
            for date_value in dates:
                price = get_value_on_or_before(price_series, date_value)
                if price is None or not math.isfinite(price):
                    continue
                raw_series.append((date_value, signed_exposure * (price - entry_price)))
            normalized_series = normalize_price_backed_carry_series(raw_series, current_pnl)
            series = build_transfer_delta_series(normalized_series, dates, effective_date, current_pnl)
            if series:
                return series, "price"

    if source_history:
        raw_series = build_monotonic_carry_series(
            dates,
            current_pnl,
            weights=build_carry_weights_from_source_history(dates, source_history),
            last_step_delta=float(position.get("pnlDay")) if position.get("pnlDay") is not None else None,
        )
        series = build_transfer_delta_series(raw_series, dates, effective_date, current_pnl)
        if series:
            return series, "account"

    return (
        build_transfer_delta_series(build_monotonic_carry_series(dates, current_pnl), dates, effective_date, current_pnl),
        "linear",
    )


def estimate_attributed_realized_trade_carry_series(
    trade: Dict[str, Any],
    dates: List[str],
    source_history: List[SeriesPoint],
    price_series: List[SeriesPoint],
) -> Tuple[List[SeriesPoint], str]:
    if not trade or not dates:
        return [], "none"

    opened_date = normalize_date_input(trade.get("openedDate")) or normalize_date_input(trade.get("closedDate")) or dates[0]
    closed_date = normalize_date_input(trade.get("closedDate")) or opened_date
    future_like = bool(FUTURES_ROOT_TO_SECTOR.get(get_future_root_symbol(trade.get("baseSym") or trade.get("symbol"))))
    try:
        final_pnl = float(trade.get("gain"))
    except Exception:
        return [], "none"
    if not math.isfinite(final_pnl) or abs(final_pnl) < 0.0001:
        return [], "none"

    def build_series(resolve_value: Callable[[str], float]) -> List[SeriesPoint]:
        series: List[SeriesPoint] = []
        for date_value in dates:
            if date_value < opened_date:
                series.append((date_value, 0.0))
                continue
            if date_value >= closed_date:
                series.append((date_value, final_pnl))
                continue
            value = resolve_value(date_value)
            if not math.isfinite(value):
                return []
            series.append((date_value, value))
        return series

    source_first = source_history[0][1] if source_history else None
    source_close = get_value_on_or_before(source_history, closed_date) if source_history else None
    if source_close is None and source_history:
        source_close = source_history[-1][1]
    if (
        not future_like
        and source_history
        and source_first is not None
        and source_close is not None
        and math.isfinite(source_first)
        and math.isfinite(source_close)
        and source_close != source_first
    ):
        series = build_series(
            lambda date_value: final_pnl
            * (((get_value_on_or_before(source_history, date_value) or source_first) - source_first) / (source_close - source_first))
        )
        if series:
            return series, "account"

    try:
        qty = float(trade.get("qty"))
    except Exception:
        qty = math.nan
    try:
        proceeds = float(trade.get("proceeds"))
    except Exception:
        proceeds = math.nan
    close_price = abs(proceeds / qty) if math.isfinite(proceeds) and math.isfinite(qty) and qty != 0 else (
        get_value_on_or_before(price_series, closed_date) if price_series else None
    )
    if price_series and close_price is not None and math.isfinite(close_price) and close_price != 0 and math.isfinite(qty) and qty != 0:
        entry_price = close_price - (final_pnl / qty)
        if math.isfinite(entry_price):
            series = build_series(
                lambda date_value: qty * ((get_value_on_or_before(price_series, date_value) or close_price) - entry_price)
            )
            if series:
                return series, "price"

    opened_time = datetime.fromisoformat(f"{opened_date}T00:00:00+00:00").timestamp()
    closed_time = datetime.fromisoformat(f"{closed_date}T00:00:00+00:00").timestamp()
    span = max(closed_time - opened_time, 86400.0)
    return (
        build_series(
            lambda date_value: final_pnl
            * min(
                1.0,
                max(
                    0.0,
                    (datetime.fromisoformat(f"{date_value}T00:00:00+00:00").timestamp() - opened_time) / span,
                ),
            )
        ),
        "linear",
    )


def _build_bench_map(points: List[Dict[str, Any]]) -> Dict[str, float]:
    bench_map: Dict[str, float] = {}
    for point in points or []:
        if not isinstance(point, dict):
            continue
        date_value = normalize_date_input(point.get("date"))
        try:
            bench = float(point.get("bench"))
        except Exception:
            continue
        if date_value and math.isfinite(bench) and bench > 0:
            bench_map[date_value] = bench
    return bench_map


def _model_to_nav_points(
    model: Dict[str, Any],
    legal_points: List[Dict[str, Any]],
    limit: int,
) -> List[Dict[str, Any]]:
    nav_series = model.get("navSeries", []) if isinstance(model, dict) else []
    twr_series = model.get("twrSeries", []) if isinstance(model, dict) else []
    if not nav_series:
        return []
    twr_map = {date_value: twr for date_value, twr in twr_series}
    bench_map = _build_bench_map(legal_points)
    first_bench = next((value for _, value in sorted(bench_map.items()) if math.isfinite(value) and value > 0), None)
    last_bench = first_bench
    points: List[Dict[str, Any]] = []
    for date_value, nav in nav_series:
        if date_value in bench_map and math.isfinite(bench_map[date_value]) and bench_map[date_value] > 0:
            last_bench = bench_map[date_value]
        bench = last_bench if last_bench is not None and math.isfinite(last_bench) and last_bench > 0 else nav
        points.append(
            {
                "date": date_value,
                "nav": float(nav),
                "bench": float(bench if math.isfinite(bench) else nav),
                "twr": float(twr_map.get(date_value)) if date_value in twr_map and math.isfinite(twr_map[date_value]) else None,
            }
        )
    return points[-int(limit):]


def build_desk_performance_bundle(
    legal_nav_by_account: Dict[str, List[Dict[str, Any]]],
    shared_state: Dict[str, Any],
    load_price_series: Optional[PriceSeriesLoader] = None,
) -> Dict[str, Any]:
    normalized = normalize_shared_dashboard_state(shared_state)
    account_list = list(normalized.get("accountNames", []))
    legal_account_names = sorted(
        {
            normalize_account_name(account_name)
            for account_name in legal_nav_by_account.keys()
            if normalize_account_name(account_name) and normalize_account_name(account_name) != "ALL"
        }
    )
    model_account_names = sorted(set(account_list).union(legal_account_names))

    legal_models_by_account = {
        account_name: build_performance_model_from_nav_points(
            legal_nav_by_account.get(account_name, []),
            normalized["balanceHistory"].get(account_name, []),
        )
        for account_name in model_account_names
    }

    aggregate_accounts = sorted(set(model_account_names))
    legal_aggregate_model = build_aggregate_performance_model(legal_models_by_account, aggregate_accounts)

    all_positions = [position for account in normalized["accounts"].values() for position in account.get("positions", [])]
    transferred_positions = []
    for position in all_positions:
        held_account = get_position_held_account(position)
        attributed_account = get_position_attributed_account(position, normalized["positionAttributionOverrides"])
        enriched = dict(position)
        enriched["custodyAccount"] = held_account
        enriched["attributedAccount"] = attributed_account
        try:
            market_value = float(enriched.get("mktVal"))
        except Exception:
            market_value = math.nan
        if held_account and attributed_account and held_account != attributed_account and math.isfinite(market_value):
            transferred_positions.append(enriched)

    transferred_realized_trades = []
    for trade in normalized["realizedTrades"]:
        held_account = normalize_account_name(trade.get("account"))
        attributed_account = get_realized_trade_attributed_account(trade, normalized["realizedTradeAttributionOverrides"])
        enriched = dict(trade)
        enriched["account"] = held_account
        enriched["custodyAccount"] = held_account
        enriched["attributedAccount"] = attributed_account
        if held_account and attributed_account and held_account != attributed_account:
            transferred_realized_trades.append(enriched)

    global_dates = sorted(
        {
            date_value
            for model in legal_models_by_account.values()
            for date_value, _ in model.get("navSeries", [])
        }
    )
    if not global_dates or (not transferred_positions and not transferred_realized_trades):
        return {
            "accountModels": legal_models_by_account,
            "aggregateModel": legal_aggregate_model,
            "transferCount": len(transferred_positions) + len(transferred_realized_trades),
            "openTransferCount": len(transferred_positions),
            "closedTransferCount": len(transferred_realized_trades),
            "snapshotBackedCount": 0,
            "priceBackedCount": 0,
            "accountBackedCount": 0,
            "linearCount": 0,
            "flatCount": 0,
        }

    history_accounts = sorted(
        {
            account_name
            for account_name in (
                aggregate_accounts
                + list(legal_models_by_account.keys())
                + [get_position_held_account(position) for position in transferred_positions]
                + [get_position_display_account(position) for position in transferred_positions]
                + [normalize_account_name(trade.get("account")) for trade in transferred_realized_trades]
                + [get_realized_trade_display_account(trade) for trade in transferred_realized_trades]
            )
            if account_name
        }
    )

    expanded_base_by_account = {
        account_name: expand_history_to_dates(legal_models_by_account.get(account_name, {}).get("navSeries", []), global_dates)
        for account_name in history_accounts
    }
    value_maps = {
        account_name: {date_value: value for date_value, value in expanded_base_by_account.get(account_name, [])}
        for account_name in history_accounts
    }
    flow_maps = {
        account_name: {date_value: flow for date_value, flow in legal_models_by_account.get(account_name, {}).get("flowSeries", [])}
        for account_name in history_accounts
    }

    price_series_cache: Dict[Tuple[str, str], List[SeriesPoint]] = {}

    def _load_cached_price_series(symbol: Any, start_date: str) -> List[SeriesPoint]:
        normalized_symbol = str(symbol or "").strip().upper()
        if not normalized_symbol or load_price_series is None:
            return []
        cache_key = (normalized_symbol, start_date)
        if cache_key not in price_series_cache:
            raw_series = load_price_series(normalized_symbol, start_date) or []
            price_series_cache[cache_key] = normalize_history_series(raw_series)
        return price_series_cache[cache_key]

    snapshot_backed_count = 0
    price_backed_count = 0
    account_backed_count = 0
    linear_count = 0
    flat_count = 0

    for position in transferred_positions:
        held_account = get_position_held_account(position)
        target_account = get_position_display_account(position)
        if not held_account or not target_account or held_account == target_account:
            continue

        source_history = expanded_base_by_account.get(held_account, [])
        effective_date = get_position_transfer_effective_date(
            position,
            normalized["positionTransferEffectiveDates"],
            normalized["futuresPnlSnapshots"],
        )
        price_symbol = position.get("historySymbol") or position.get("symbol")
        price_series = _load_cached_price_series(price_symbol, global_dates[0])
        series, method = estimate_attributed_position_pnl_series(
            position,
            global_dates,
            source_history,
            price_series,
            effective_date=effective_date,
            futures_snapshot_series=get_futures_snapshot_series(position, normalized["futuresPnlSnapshots"]),
        )
        if not series:
            continue
        if method == "snapshot":
            snapshot_backed_count += 1
        elif method == "price":
            price_backed_count += 1
        elif method == "account":
            account_backed_count += 1
        elif method == "linear":
            linear_count += 1
        else:
            flat_count += 1

        value_maps.setdefault(held_account, {date_value: 0.0 for date_value in global_dates})
        value_maps.setdefault(target_account, {date_value: 0.0 for date_value in global_dates})
        for date_value, value in series:
            value_maps[held_account][date_value] = value_maps[held_account].get(date_value, 0.0) - value
            value_maps[target_account][date_value] = value_maps[target_account].get(date_value, 0.0) + value

    for trade in transferred_realized_trades:
        held_account = normalize_account_name(trade.get("account"))
        target_account = get_realized_trade_display_account(trade)
        if not held_account or not target_account or held_account == target_account:
            continue

        source_history = expanded_base_by_account.get(held_account, [])
        price_symbol = trade.get("baseSym") or trade.get("symbol")
        price_series = _load_cached_price_series(price_symbol, global_dates[0])
        series, method = estimate_attributed_realized_trade_carry_series(
            trade,
            global_dates,
            source_history,
            price_series,
        )
        if not series:
            continue
        if method == "price":
            price_backed_count += 1
        elif method == "account":
            account_backed_count += 1
        elif method == "linear":
            linear_count += 1
        else:
            flat_count += 1

        value_maps.setdefault(held_account, {date_value: 0.0 for date_value in global_dates})
        value_maps.setdefault(target_account, {date_value: 0.0 for date_value in global_dates})
        for date_value, value in series:
            value_maps[held_account][date_value] = value_maps[held_account].get(date_value, 0.0) - value
            value_maps[target_account][date_value] = value_maps[target_account].get(date_value, 0.0) + value

    account_models: Dict[str, Dict[str, Any]] = {}
    has_flow_adjusted_returns = all(
        legal_models_by_account.get(account_name, {}).get("hasFlowAdjustedReturns", True) is not False
        for account_name in history_accounts
    )
    for account_name in history_accounts:
        nav_series = [(date_value, round(value_maps.get(account_name, {}).get(date_value, 0.0), 4)) for date_value in global_dates]
        flow_series = [(date_value, round(flow_maps.get(account_name, {}).get(date_value, 0.0), 4)) for date_value in global_dates]
        twr_series: List[SeriesPoint] = []
        previous_nav: Optional[float] = None
        cumulative = 1.0
        for index, date_value in enumerate(global_dates):
            nav = nav_series[index][1]
            flow = flow_series[index][1]
            if previous_nav is not None and math.isfinite(previous_nav) and previous_nav != 0:
                day_return = (nav - previous_nav - flow) / previous_nav
                if math.isfinite(day_return):
                    cumulative *= 1.0 + day_return
            else:
                cumulative = 1.0
            twr_series.append((date_value, cumulative))
            previous_nav = nav
        account_models[account_name] = {
            "navSeries": nav_series,
            "flowSeries": flow_series,
            "twrSeries": twr_series,
            "hasFlowAdjustedReturns": has_flow_adjusted_returns,
        }

    aggregate_model = build_aggregate_performance_model(account_models, sorted(set(aggregate_accounts).union(history_accounts)))
    return {
        "accountModels": account_models,
        "aggregateModel": aggregate_model,
        "transferCount": len(transferred_positions) + len(transferred_realized_trades),
        "openTransferCount": len(transferred_positions),
        "closedTransferCount": len(transferred_realized_trades),
        "snapshotBackedCount": snapshot_backed_count,
        "priceBackedCount": price_backed_count,
        "accountBackedCount": account_backed_count,
        "linearCount": linear_count,
        "flatCount": flat_count,
    }


def build_desk_nav_points(
    legal_nav_by_account: Dict[str, List[Dict[str, Any]]],
    shared_state: Dict[str, Any],
    account: Optional[str],
    limit: int,
    load_price_series: Optional[PriceSeriesLoader] = None,
) -> List[Dict[str, Any]]:
    bundle = build_desk_performance_bundle(
        legal_nav_by_account=legal_nav_by_account,
        shared_state=shared_state,
        load_price_series=load_price_series,
    )
    account_label = normalize_account_name(account or "ALL") or "ALL"
    if account_label == "ALL":
        model = bundle.get("aggregateModel", {})
        legal_points = legal_nav_by_account.get("ALL", [])
    else:
        model = bundle.get("accountModels", {}).get(account_label, {})
        legal_points = legal_nav_by_account.get(account_label, [])
    return _model_to_nav_points(model, legal_points, limit)
