import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AccountSelect } from "../components/AccountSelect";
import { ErrorState, LoadingState } from "../components/QueryState";
import { useSession } from "../auth";
import { useAccounts, usePositions } from "../hooks/usePortfolio";
import { accountLabel, money, percent } from "../lib/format";
import { api } from "../services/api";
import type { Position } from "../types";

const sectors = [
  "Unassigned",
  "Communication Services",
  "Consumer Discretionary",
  "Consumer Staples",
  "Energy",
  "Financials",
  "Health Care",
  "Industrials",
  "Information Technology",
  "Materials",
  "Real Estate",
  "Utilities",
];

export default function HoldingsPage() {
  const [account, setAccount] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const { session } = useSession();
  const accounts = useAccounts();
  const positions = usePositions(account);
  const queryClient = useQueryClient();
  const pageSize = 30;

  const updateSector = useMutation({
    mutationFn: ({ position, sector }: { position: Position; sector: string }) =>
      api.patch(`/positions/${encodeURIComponent(position.instrument_id ?? "")}/sector`, { sector }, { params: { account: position.account } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["positions"] }),
  });

  const filtered = useMemo(() => {
    const token = search.trim().toLowerCase();
    return [...(positions.data ?? [])]
      .filter((position) => !token || `${position.symbol} ${position.account} ${position.sector} ${position.asset_class}`.toLowerCase().includes(token))
      .sort((left, right) => Math.abs(right.market_value) - Math.abs(left.market_value));
  }, [positions.data, search]);

  if (accounts.isLoading || positions.isLoading) return <LoadingState label="Loading current positions" />;
  if (positions.error) return <ErrorState error={positions.error} onRetry={() => positions.refetch()} />;

  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalMarketValue = filtered.reduce((sum, position) => sum + position.market_value, 0);
  const totalPnl = filtered.reduce((sum, position) => sum + (position.total_pnl ?? 0), 0);

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <AccountSelect accounts={accounts.data?.accounts ?? []} value={account} onChange={(value) => { setAccount(value); setPage(0); }} />
        <label className="field field--search">
          <span>Search</span>
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Symbol, sector or account" />
        </label>
        <div className="toolbar-summary">
          <div><span>Market value</span><strong>{money(totalMarketValue)}</strong></div>
          <div><span>Unrealized P&L</span><strong className={totalPnl >= 0 ? "positive" : "negative"}>{money(totalPnl)}</strong></div>
        </div>
      </div>

      <article className="panel">
        <div className="panel__header">
          <div><span className="eyebrow">Current book</span><h2>{filtered.length} positions</h2></div>
          {updateSector.error && <span className="inline-error">{updateSector.error.message}</span>}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Symbol</th><th>Account</th><th>Type</th><th>Sector</th><th>Quantity</th><th>Price</th><th>Market value</th><th>Avg cost</th><th>Day</th><th>Total</th></tr>
            </thead>
            <tbody>
              {visible.map((position) => (
                <tr key={`${position.account}:${position.instrument_id}`}>
                  <td>
                    <strong className="symbol">{position.symbol}</strong>
                    {position.expiry && <small>{position.expiry} · {position.option_type} {position.strike}</small>}
                  </td>
                  <td>{position.account ? accountLabel(position.account) : "—"}</td>
                  <td><span className="tag">{position.asset_class ?? "equity"}</span></td>
                  <td>
                    {session.role === "admin" ? (
                      <select
                        className="table-select"
                        value={position.sector || "Unassigned"}
                        disabled={updateSector.isPending}
                        onChange={(event) => updateSector.mutate({ position, sector: event.target.value })}
                      >
                        {sectors.map((sector) => <option key={sector}>{sector}</option>)}
                      </select>
                    ) : position.sector || "Unassigned"}
                  </td>
                  <td>{position.qty.toLocaleString()}</td>
                  <td>{money(position.price, 2)}</td>
                  <td>{money(position.market_value)}</td>
                  <td>{money(position.avg_cost, 2)}</td>
                  <td className={(position.day_pnl ?? 0) >= 0 ? "positive" : "negative"}>
                    {money(position.day_pnl)}<small>{percent(position.day_pnl_pct)}</small>
                  </td>
                  <td className={(position.total_pnl ?? 0) >= 0 ? "positive" : "negative"}>
                    {money(position.total_pnl)}<small>{percent(position.total_pnl_pct)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span>{filtered.length ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, filtered.length)} of ${filtered.length}` : "No matching positions"}</span>
          <div>
            <button className="button button--secondary" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <button className="button button--secondary" disabled={(page + 1) * pageSize >= filtered.length} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        </div>
      </article>
    </div>
  );
}
