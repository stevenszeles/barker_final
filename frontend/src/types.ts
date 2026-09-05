export type Session = {
  authenticated: boolean;
  auth_enabled: boolean;
  role: "admin" | "viewer" | null;
  subject: string | null;
};

export type Stamp = {
  asof: string;
  source: string;
  method_version: string;
};

export type Position = {
  account?: string;
  symbol: string;
  instrument_id?: string;
  asset_class?: string;
  underlying?: string;
  expiry?: string;
  strike?: number;
  option_type?: string;
  multiplier?: number;
  qty: number;
  price: number;
  market_value: number;
  avg_cost?: number;
  day_pnl?: number;
  total_pnl?: number;
  day_pnl_pct?: number;
  total_pnl_pct?: number;
  sector?: string;
  owner?: string;
};

export type Snapshot = {
  stamp: Stamp;
  nlv: number;
  cash: number;
  day_pnl: number;
  total_pnl: number;
  buying_power: number;
  net_exposure: number;
  positions: Position[];
};

export type NavPoint = {
  date: string;
  nav: number;
  bench: number | null;
  twr?: number | null;
  return_method: string;
  data_quality: string;
};

export type Account = {
  account: string;
  cash?: number;
  asof?: string;
  account_value?: number;
};

export type Trade = {
  trade_id: string;
  ts: string;
  trade_date?: string;
  account?: string;
  symbol: string;
  side: string;
  qty: number;
  price: number;
  trade_type: string;
  status: string;
  source: string;
  sector?: string;
  realized_pl?: number;
  cost_basis?: number;
};

export type RiskMetric = {
  metric: string;
  value: number;
  limit?: number | null;
  breached: boolean;
};

export type RiskProfile = {
  stamp: Stamp;
  return_method: string;
  data_quality: string;
  metrics: RiskMetric[];
  correlation: { labels: string[]; matrix: number[][]; observations: number };
  rolling: {
    dates: string[];
    portfolio_vol_20d: number[];
    benchmark_vol_20d: number[];
    tracking_error_20d: number[];
    drawdown: number[];
  };
};

export type ImportRecord = {
  id: string;
  status: string;
  actor: string;
  source: string;
  started_at: string;
  completed_at?: string;
  file_count: number;
  summary?: Record<string, unknown>;
  error?: string;
};
