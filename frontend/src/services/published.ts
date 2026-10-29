export const staticMode = import.meta.env.VITE_STATIC_MODE === "1";
export type PublishedPortfolio = {
  as_of: string;
  published_at: string;
  responses: Record<string, unknown>;
};
let pending: Promise<PublishedPortfolio> | undefined;
export function loadPublished(): Promise<PublishedPortfolio> {
  pending ??= fetch(`${import.meta.env.BASE_URL}data/portfolio.json`, { cache: "no-cache" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Portfolio snapshot has not been published yet.");
      const data = await response.json() as PublishedPortfolio;
      if (!data.as_of || !data.responses) throw new Error("Published portfolio is incomplete.");
      return data;
    }).catch((error) => { pending = undefined; throw error; });
  return pending;
}
export async function publishedResponse(path: string, params?: Record<string, unknown>): Promise<unknown> {
  const snapshot = await loadPublished();
  const accountPaths = ["/portfolio/snapshot", "/portfolio/nav", "/positions", "/trade/blotter"];
  const key = accountPaths.includes(path) ? `${path}?account=${String(params?.account ?? "ALL")}` : path;
  if (!(key in snapshot.responses)) throw new Error("This analysis was not included in the published snapshot.");
  const value = snapshot.responses[key];
  const limit = Number(params?.limit);
  if (limit > 0 && Array.isArray(value)) return value.slice(-limit);
  if (limit > 0 && path === "/trade/blotter") {
    const blotter = value as { trades: unknown[] };
    return { ...blotter, trades: blotter.trades.slice(0, limit) };
  }
  return value;
}
