import { useMemo, useState } from "react";
import { AccountSelect } from "../components/AccountSelect";
import { MetricCard } from "../components/MetricCard";
import { ErrorState, LoadingState } from "../components/QueryState";
import { useAccounts, useTrades } from "../hooks/usePortfolio";
import { accountLabel, money, shortDate } from "../lib/format";

export default function ActivityPage() {
  const [account, setAccount] = useState("ALL");
  const [search, setSearch] = useState("");
  const accounts = useAccounts();
  const trades = useTrades(account, 2000);

  const filtered = useMemo(() => {
    const token = search.trim().toLowerCase();
    return (trades.data?.trades ?? []).filter((trade) =>
      !token || `${trade.symbol} ${trade.account} ${trade.sector} ${trade.trade_type}`.toLowerCase().includes(token),
    );
  }, [search, trades.data?.trades]);

  if (accounts.isLoading || trades.isLoading) return <LoadingState label="Loading portfolio activity" />;
  if (trades.error) return <ErrorState error={trades.error} onRetry={() => trades.refetch()} />;

  const realized = filtered.reduce((sum, trade) => sum + (trade.realized_pl ?? 0), 0);
  const winners = filtered.filter((trade) => (trade.realized_pl ?? 0) > 0).length;
  const losers = filtered.filter((trade) => (trade.realized_pl ?? 0) < 0).length;

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <AccountSelect accounts={accounts.data?.accounts ?? []} value={account} onChange={setAccount} />
        <label className="field field--search"><span>Search activity</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Symbol, sector or account" /></label>
      </div>
      <section className="metric-grid metric-grid--four">
        <MetricCard label="Realized P&L" value={money(realized)} tone={realized >= 0 ? "positive" : "negative"} />
        <MetricCard label="Recorded lots" value={filtered.length.toLocaleString()} />
        <MetricCard label="Profitable lots" value={winners.toLocaleString()} tone="positive" />
        <MetricCard label="Losing lots" value={losers.toLocaleString()} tone={losers ? "negative" : "neutral"} />
      </section>
      <article className="panel">
        <div className="panel__header"><div><span className="eyebrow">Blotter</span><h2>Transactions and realized lots</h2></div></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Date</th><th>Symbol</th><th>Account</th><th>Type</th><th>Side</th><th>Quantity</th><th>Price</th><th>Sector</th><th>Realized P&L</th><th>Source</th></tr></thead>
            <tbody>
              {filtered.map((trade) => (
                <tr key={trade.trade_id}>
                  <td>{shortDate(trade.trade_date ?? trade.ts)}</td>
                  <td><strong className="symbol">{trade.symbol}</strong></td>
                  <td>{trade.account ? accountLabel(trade.account) : "—"}</td>
                  <td><span className="tag">{trade.trade_type}</span></td>
                  <td>{trade.side}</td>
                  <td>{trade.qty.toLocaleString()}</td>
                  <td>{money(trade.price, 2)}</td>
                  <td>{trade.sector || "Unassigned"}</td>
                  <td className={(trade.realized_pl ?? 0) >= 0 ? "positive" : "negative"}>{money(trade.realized_pl)}</td>
                  <td><small>{trade.source}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
