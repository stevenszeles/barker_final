import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AccountSelect } from "../components/AccountSelect";
import { MetricCard } from "../components/MetricCard";
import { PerformanceChart } from "../components/PerformanceChart";
import { EmptyState, ErrorState, LoadingState } from "../components/QueryState";
import { useAccounts, useNav, useSnapshot } from "../hooks/usePortfolio";
import { accountLabel, money, percent, ratioPercent, shortDate } from "../lib/format";

const colors = ["#5ce1b9", "#7298ff", "#f6c86e", "#bd8cff", "#ff8f70", "#79c4d5", "#a4cf74"];

export default function OverviewPage() {
  const [account, setAccount] = useState("ALL");
  const accounts = useAccounts();
  const snapshot = useSnapshot(account);
  const nav = useNav(account, 1200);

  const allocation = useMemo(() => {
    const totals = new Map<string, number>();
    for (const position of snapshot.data?.positions ?? []) {
      const key = position.sector && position.sector !== "Unassigned" ? position.sector : "Unassigned";
      totals.set(key, (totals.get(key) ?? 0) + Math.abs(position.market_value));
    }
    return [...totals.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((left, right) => right.value - left.value);
  }, [snapshot.data?.positions]);

  if (accounts.isLoading || snapshot.isLoading || nav.isLoading) return <LoadingState />;
  if (snapshot.error) return <ErrorState error={snapshot.error} onRetry={() => snapshot.refetch()} />;
  if (!snapshot.data || (!snapshot.data.positions.length && !nav.data?.length)) {
    return <EmptyState title="No portfolio has been imported">Open Import & Admin and upload the three brokerage exports for an account.</EmptyState>;
  }

  const first = nav.data?.[0];
  const last = nav.data?.at(-1);
  const returnValue = first && last && first.nav ? ((last.nav / first.nav) - 1) * 100 : 0;
  const dayTone = snapshot.data.day_pnl > 0 ? "positive" : snapshot.data.day_pnl < 0 ? "negative" : "neutral";
  const totalTone = snapshot.data.total_pnl > 0 ? "positive" : snapshot.data.total_pnl < 0 ? "negative" : "neutral";

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <AccountSelect accounts={accounts.data?.accounts ?? []} value={account} onChange={setAccount} />
        <div className="freshness">
          <span>As of</span>
          <strong>{shortDate(snapshot.data.stamp.asof)}</strong>
          <span className="quality-badge">{last?.data_quality ?? "current"}</span>
        </div>
      </div>

      <section className="metric-grid">
        <MetricCard label="Net liquidation value" value={money(snapshot.data.nlv)} detail={account === "ALL" ? "Combined portfolio" : accountLabel(account)} />
        <MetricCard label="Cash" value={money(snapshot.data.cash)} detail={`${snapshot.data.nlv ? ((snapshot.data.cash / snapshot.data.nlv) * 100).toFixed(1) : "0.0"}% liquidity`} />
        <MetricCard label="Day P&L" value={money(snapshot.data.day_pnl)} tone={dayTone} />
        <MetricCard label="Unrealized P&L" value={money(snapshot.data.total_pnl)} tone={totalTone} />
        <MetricCard label="Period NAV change" value={percent(returnValue)} tone={returnValue >= 0 ? "positive" : "negative"} detail={first ? `Since ${shortDate(first.date)}` : undefined} />
        <MetricCard label="Net / gross exposure" value={ratioPercent(snapshot.data.net_exposure, 1)} detail={`${snapshot.data.positions.length} open positions`} />
      </section>

      <section className="dashboard-grid dashboard-grid--wide">
        <article className="panel panel--span-2">
          <div className="panel__header">
            <div><span className="eyebrow">Performance</span><h2>Portfolio vs benchmark</h2></div>
            <span className="method-badge">{last?.return_method === "nav_change_only" ? "NAV change · cash flows unavailable" : "Cash-flow adjusted"}</span>
          </div>
          <PerformanceChart points={nav.data ?? []} />
        </article>
        <article className="panel">
          <div className="panel__header"><div><span className="eyebrow">Exposure</span><h2>Sector allocation</h2></div></div>
          <div className="donut">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={allocation} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2}>
                  {allocation.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
                </Pie>
                <Tooltip formatter={(value: number) => money(value)} contentStyle={{ background: "#101722", border: "1px solid #273448", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="legend-list">
              {allocation.slice(0, 6).map((item, index) => (
                <div key={item.name}><span style={{ background: colors[index % colors.length] }} /><strong>{item.name}</strong><em>{money(item.value)}</em></div>
              ))}
            </div>
          </div>
        </article>
      </section>

      <article className="panel">
        <div className="panel__header"><div><span className="eyebrow">Book</span><h2>Largest positions</h2></div></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Symbol</th><th>Account</th><th>Type</th><th>Quantity</th><th>Price</th><th>Market value</th><th>Day P&L</th><th>Total P&L</th></tr></thead>
            <tbody>
              {[...snapshot.data.positions]
                .sort((left, right) => Math.abs(right.market_value) - Math.abs(left.market_value))
                .slice(0, 10)
                .map((position) => (
                  <tr key={`${position.account}:${position.instrument_id}`}>
                    <td><strong className="symbol">{position.symbol}</strong></td>
                    <td>{position.account ? accountLabel(position.account) : "—"}</td>
                    <td><span className="tag">{position.asset_class ?? "equity"}</span></td>
                    <td>{position.qty.toLocaleString()}</td>
                    <td>{money(position.price, 2)}</td>
                    <td>{money(position.market_value)}</td>
                    <td className={(position.day_pnl ?? 0) >= 0 ? "positive" : "negative"}>{money(position.day_pnl)}</td>
                    <td className={(position.total_pnl ?? 0) >= 0 ? "positive" : "negative"}>{money(position.total_pnl)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
