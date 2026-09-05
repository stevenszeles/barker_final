import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MetricCard } from "../components/MetricCard";
import { ErrorState, LoadingState } from "../components/QueryState";
import { useRisk } from "../hooks/usePortfolio";
import { labelize, money, number, ratioPercent, shortDate } from "../lib/format";

const currencyMetrics = new Set(["gross_exposure", "net_exposure", "long_exposure", "short_exposure", "var_95", "delta_exposure", "gamma_exposure", "theta_exposure", "vega_exposure", "futures_notional"]);
const percentMetrics = new Set(["annualized_return", "annualized_volatility", "downside_volatility", "max_drawdown", "current_drawdown", "var_95_pct", "cvar_95_pct", "tracking_error", "win_rate", "best_day_return", "worst_day_return", "top1_concentration", "top5_concentration"]);

export default function RiskPage() {
  const risk = useRisk();
  const metrics = useMemo(() => new Map((risk.data?.metrics ?? []).map((metric) => [metric.metric, metric])), [risk.data?.metrics]);
  const rolling = useMemo(() => {
    if (!risk.data) return [];
    return risk.data.rolling.dates.map((date, index) => ({
      date,
      drawdown: (risk.data!.rolling.drawdown[index] ?? 0) * 100,
      volatility: (risk.data!.rolling.portfolio_vol_20d[index] ?? 0) * 100,
    }));
  }, [risk.data]);

  if (risk.isLoading) return <LoadingState label="Calculating portfolio risk" />;
  if (risk.error) return <ErrorState error={risk.error} onRetry={() => risk.refetch()} />;
  if (!risk.data) return null;

  const primary = ["gross_exposure", "net_exposure", "annualized_volatility", "max_drawdown", "var_95", "sharpe", "beta", "top1_concentration"];
  const formatMetric = (name: string, value: number) => currencyMetrics.has(name) ? money(value) : percentMetrics.has(name) ? ratioPercent(value) : number(value);

  return (
    <div className="page-stack">
      {risk.data.return_method === "nav_change_only" && (
        <div className="notice notice--warning">
          <strong>Path-risk estimates use account-value changes.</strong>
          <span>Deposits and withdrawals may distort volatility, drawdown, beta, and VaR until dated external cash flows are available.</span>
        </div>
      )}
      <section className="metric-grid metric-grid--four">
        {primary.map((name) => {
          const metric = metrics.get(name);
          return <MetricCard key={name} label={labelize(name)} value={formatMetric(name, metric?.value ?? 0)} tone={metric?.breached ? "warning" : "neutral"} />;
        })}
      </section>
      <section className="dashboard-grid">
        <article className="panel panel--span-2">
          <div className="panel__header"><div><span className="eyebrow">Path risk</span><h2>Drawdown and rolling volatility</h2></div></div>
          <div className="chart" style={{ height: 380 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rolling}>
                <defs>
                  <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff7f76" stopOpacity={0.28} /><stop offset="100%" stopColor="#ff7f76" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,.1)" vertical={false} />
                <XAxis dataKey="date" minTickGap={60} tickFormatter={(value) => shortDate(String(value)).replace(/, \d{4}/, "")} tick={{ fill: "#7f8b9d", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(value) => `${value.toFixed(0)}%`} tick={{ fill: "#7f8b9d", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value: number) => `${value.toFixed(2)}%`} contentStyle={{ background: "#101722", border: "1px solid #273448", borderRadius: 8 }} />
                <Area type="monotone" dataKey="drawdown" stroke="#ff7f76" fill="url(#riskFill)" strokeWidth={2} />
                <Area type="monotone" dataKey="volatility" stroke="#f6c86e" fill="none" strokeWidth={1.8} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className="panel">
          <div className="panel__header"><div><span className="eyebrow">Correlation</span><h2>{risk.data.correlation.observations} observations</h2></div></div>
          <div className="correlation">
            <div className="correlation__grid" style={{ gridTemplateColumns: `90px repeat(${risk.data.correlation.labels.length}, 1fr)` }}>
              <span />
              {risk.data.correlation.labels.map((label) => <strong key={label}>{label}</strong>)}
              {risk.data.correlation.labels.map((row, rowIndex) => [
                <strong key={`${row}-label`}>{row}</strong>,
                ...risk.data!.correlation.matrix[rowIndex].map((value, columnIndex) => (
                  <span key={`${row}-${columnIndex}`} style={{ background: value >= 0 ? `rgba(92,225,185,${Math.abs(value) * 0.55})` : `rgba(255,127,118,${Math.abs(value) * 0.55})` }}>
                    {value.toFixed(2)}
                  </span>
                )),
              ])}
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
