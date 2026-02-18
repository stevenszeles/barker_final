from typing import List, Optional, Dict
from pydantic import BaseModel


class DataStamp(BaseModel):
    asof: str
    source: str
    method_version: str


class Position(BaseModel):
    symbol: str
    instrument_id: Optional[str] = None
    asset_class: Optional[str] = None
    underlying: Optional[str] = None
    expiry: Optional[str] = None
    strike: Optional[float] = None
    option_type: Optional[str] = None
    multiplier: Optional[float] = None
    qty: float
    price: float
    market_value: float
    owner: Optional[str] = None
    entry_date: Optional[str] = None
    sector: Optional[str] = None
    avg_cost: Optional[float] = None
    day_pnl: Optional[float] = None
    total_pnl: Optional[float] = None
    day_pnl_pct: Optional[float] = None
    total_pnl_pct: Optional[float] = None
    strategy: Optional[str] = None
    strategy_id: Optional[str] = None
    strategy_name: Optional[str] = None
    delta: Optional[float] = None
    gamma: Optional[float] = None
    theta: Optional[float] = None
    vega: Optional[float] = None


class Snapshot(BaseModel):
    stamp: DataStamp
    nlv: float
    cash: float
    day_pnl: float
    total_pnl: float
    buying_power: float
    net_exposure: float
    positions: List[Position]


class NavPoint(BaseModel):
    date: str
    nav: float
    bench: float
    twr: Optional[float] = None


class RiskMetric(BaseModel):
    metric: str
    value: float
    limit: Optional[float] = None
    breached: bool


class RiskSummary(BaseModel):
    stamp: DataStamp
    metrics: List[RiskMetric]


class Trade(BaseModel):
    trade_id: str
    ts: str
    trade_date: Optional[str] = None
    instrument_id: Optional[str] = None
    symbol: str
    side: str
    qty: float
    price: float
    trade_type: str
    status: str
    source: str
    asset_class: Optional[str] = None
    underlying: Optional[str] = None
    expiry: Optional[str] = None
    strike: Optional[float] = None
    option_type: Optional[str] = None
    multiplier: Optional[float] = None


class TradeBlotter(BaseModel):
    stamp: DataStamp
    trades: List[Trade]


class TradePreview(BaseModel):
    symbol: str
    side: str
    qty: float
    price: float
    trade_type: str
    instrument_id: Optional[str] = None


class TradeImpact(BaseModel):
    cash_impact: float
    net_exposure_impact: float
    notes: str


class AuditEntry(BaseModel):
    ts: str
    actor: str
    action: str
    details: Dict


class DataStatus(BaseModel):
    component: str
    asof: str
    source: str
    ok: bool
