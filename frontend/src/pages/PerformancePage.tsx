import { useMemo, useState } from "react";
import { AccountSelect } from "../components/AccountSelect";
import { MetricCard } from "../components/MetricCard";
import { PerformanceChart } from "../components/PerformanceChart";
import { ErrorState, LoadingState } from "../components/QueryState";
import { useAccounts, useNav } from "../hooks/usePortfolio";
import { percent, shortDate } from "../lib/format";

export default function PerformancePage() {
  const [account, setAccount] = useState("ALL");
  const accounts = useAccounts();
  const nav = useNav(account, 3650);

  const stats = useMemo(() => {
    const points = nav.data ?? [];
    if (points.length < 2) return null;
    const first = points[0];
    const last = points.at(-1)!;
    const portfolio = first.nav ? ((last.nav / first.nav) - 1) * 100 : 0;
    const benchmark = first.bench && last.bench ? ((last.bench / first.bench) - 1) * 100 : null;
    let peak = -Infinity;
    let maxDrawdown = 0;
    for (const point of points) {
      peak = Math.max(peak, point.nav);
      if (peak > 0) maxDrawdown = Math.min(maxDrawdown, ((point.nav / peak) - 1) * 100);
    }
    return {
      first,
      last,
      portfolio,
      benchmark,
      active: benchmark === null ? null : portfolio - benchmark,
      maxDrawdown,
    };
  }, [nav.data]);

  if (accounts.isLoading || nav.isLoading) return <LoadingState label="Building performance history" />;
  if (nav.error) return <ErrorState error={nav.error} onRetry={() => nav.refetch()} />;

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <AccountSelect accounts={accounts.data?.accounts ?? []} value={account} onChange={setAccount} />
        <div className="freshness">
          <span>History</span>
          <strong>{stats ? `${shortDate(stats.first.date)} – ${shortDate(stats.last.date)}` : "Unavailable"}</strong>
        </div>
      </div>

      {stats && (
        <section className="metric-grid metric-grid--five">
          <MetricCard label="Portfolio change" value={percent(stats.portfolio)} tone={stats.portfolio >= 0 ? "positive" : "negative"} />
          <MetricCard label="Benchmark" value={percent(stats.benchmark)} tone={(stats.benchmark ?? 0) >= 0 ? "positive" : "negative"} />
          <MetricCard label="Active return" value={percent(stats.active)} tone={(stats.active ?? 0) >= 0 ? "positive" : "negative"} />
          <MetricCard label="Maximum drawdown" value={percent(stats.maxDrawdown)} tone="negative" />
          <MetricCard label="Observations" value={(nav.data ?? []).length.toLocaleString()} detail={stats.last.return_method.replaceAll("_", " ")} />
        </section>
      )}

      {nav.data?.at(-1)?.return_method === "nav_change_only" && (
        <div className="notice notice--warning">
          <strong>Performance is currently NAV change, not time-weighted return.</strong>
          <span>The balance export does not identify dated external contributions and withdrawals. Treat this as account-value change, not formal manager performance.</span>
        </div>
      )}

      <article className="panel">
        <div className="panel__header"><div><span className="eyebrow">Account history</span><h2>Portfolio and benchmark return</h2></div></div>
        <PerformanceChart points={nav.data ?? []} height={430} />
      </article>
    </div>
  );
}
