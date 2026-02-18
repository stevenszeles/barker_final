import { create } from "zustand";
import { api } from "../services/api";

export type Position = {
  symbol: string;
  instrument_id?: string | null;
  asset_class?: string | null;
  underlying?: string | null;
  expiry?: string | null;
  strike?: number | null;
  option_type?: string | null;
  multiplier?: number | null;
  qty: number;
  price: number;
  market_value: number;
  owner?: string | null;
  entry_date?: string | null;
  sector?: string | null;
  avg_cost?: number | null;
  day_pnl?: number | null;
  total_pnl?: number | null;
  day_pnl_pct?: number | null;
  total_pnl_pct?: number | null;
  strategy?: string | null;
  strategy_id?: string | null;
  strategy_name?: string | null;
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  vega?: number | null;
};

export type Snapshot = {
  stamp: { asof: string; source: string; method_version: string };
  nlv: number;
  cash: number;
  day_pnl: number;
  total_pnl: number;
  buying_power: number;
  margin_required?: number;
  margin_available?: number;
  net_exposure: number;
  positions: Position[];
  data_quality?: {
    total: number;
    sources: Record<string, number>;
    missing: Record<string, number>;
    all_priced: boolean;
    missing_assets: string[];
  };
};

export type NavPoint = { date: string; nav: number; bench: number; twr?: number | null };

export type RiskMetric = { metric: string; value: number; limit?: number | null; breached: boolean };

export type RiskSummary = { stamp: { asof: string; source: string; method_version: string }; metrics: RiskMetric[] };

export type Trade = { ts: string; trade_date?: string | null; symbol: string; side: string; qty: number; price: number; status: string };

export type TradeBlotter = { stamp: { asof: string; source: string; method_version: string }; trades: Trade[] };
export type StatusComponent = { component: string; asof: string; source: string; ok: boolean };
export type AccountInfo = { account: string; cash: number; asof?: string | null };
export type SchwabStatus = {
  connected: boolean;
  can_trade: boolean;
  can_fetch_data: boolean;
  expires_in_seconds?: number;
  expires_at?: string;
  access_token_expires?: string;
  token_valid?: boolean;
  in_cooldown?: boolean;
  configured?: boolean;
  status?: string;
  message?: string;
  reason?: string;
  auth_url?: string;
};

export type Quote = {
  symbol: string;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  ts: number;
};

export type TradeTick = {
  symbol: string;
  price: number;
  size: number;
  ts: number;
};

type StoreState = {
  snapshot: Snapshot | null;
  nav: NavPoint[];
  risk: RiskSummary | null;
  blotter: TradeBlotter | null;
  status: StatusComponent[];
  accounts: AccountInfo[];
  schwabStatus: SchwabStatus | null;
  account: string;
  setAccount: (account: string) => void;
  fetchAccounts: () => Promise<void>;
  fetchSchwabStatus: () => Promise<void>;
  quotes: Record<string, Quote>;
  trades: Record<string, TradeTick[]>;
  marketConnected: boolean;
  connectMarketStream: (symbols: string[]) => void;
  error: string;
  fetchSnapshot: () => Promise<void>;
  fetchBlotter: () => Promise<void>;
  fetchRisk: () => Promise<void>;
  fetchStatus: () => Promise<void>;
  fetchQuotes: (symbols: string[]) => Promise<void>;
  refreshAll: () => Promise<void>;
  fetchNav: (limit: number) => Promise<void>;
};

let marketSocket: WebSocket | null = null;
let marketSymbols: string[] = [];
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;

export const useAppStore = create<StoreState>((set) => ({
  snapshot: null,
  nav: [],
  risk: null,
  blotter: null,
  status: [],
  accounts: [],
  schwabStatus: null,
  account: "ALL",
  setAccount: (account: string) => set({ account }),
  fetchAccounts: async () => {
    try {
      const resp = await api.get<{ accounts: AccountInfo[] }>("/admin/accounts");
      set({ accounts: resp.data?.accounts ?? [] });
    } catch {
      set({ accounts: [] });
    }
  },
  fetchSchwabStatus: async () => {
    try {
      const resp = await api.get<SchwabStatus>("/status/schwab");
      set({ schwabStatus: resp.data });
    } catch (err: any) {
      if (err?.response?.status === 404) {
        try {
          const legacy = await api.get<{ connected: boolean; expires_at?: number | null }>("/auth/schwab/status");
          const expiresAt = legacy.data?.expires_at ?? null;
          const expiresIn =
            typeof expiresAt === "number" ? Math.floor(expiresAt - Date.now() / 1000) : undefined;
          set({
            schwabStatus: {
              connected: Boolean(legacy.data?.connected),
              can_trade: Boolean(legacy.data?.connected),
              can_fetch_data: Boolean(legacy.data?.connected),
              expires_in_seconds: expiresIn,
              status: legacy.data?.connected ? "active" : "not_authenticated",
              message: legacy.data?.connected ? "Connected to Schwab API" : "Not authenticated. Click Connect to authorize.",
              reason: legacy.data?.connected ? undefined : "Not authenticated. Click Connect to authorize.",
              auth_url: "/api/auth/schwab/start",
            },
          });
          return;
        } catch {
          // fall through to generic error
        }
      }
      set({
        schwabStatus: {
          connected: false,
          can_trade: false,
          can_fetch_data: false,
          status: "error",
          message: "Failed to check status",
          reason: "Failed to check status",
        },
      });
    }
  },
  quotes: {},
  trades: {},
  marketConnected: false,
  error: "",
  connectMarketStream: (symbols: string[]) => {
    const unique = Array.from(new Set(symbols.filter(Boolean)));
    if (!unique.length) return;
    if (marketSocket && marketSymbols.join(",") === unique.join(",")) return;
    marketSymbols = unique;
    if (marketSocket) {
      marketSocket.close();
      marketSocket = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectAttempts = 0;
    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${wsProtocol}://${window.location.host}/api/market/stream?symbols=${unique.join(",")}`;
    const ws = new WebSocket(wsUrl);
    marketSocket = ws;
    ws.onopen = () => set({ marketConnected: true });
    ws.onclose = () => {
      set({ marketConnected: false });
      if (reconnectAttempts < 5) {
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 15000);
        reconnectAttempts += 1;
        reconnectTimer = window.setTimeout(() => {
          if (marketSymbols.length) {
            const next = Array.from(marketSymbols);
            useAppStore.getState().connectMarketStream(next);
          }
        }, delay);
      }
    };
    ws.onerror = () => set({ marketConnected: false });
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === "error") {
          set({ error: payload.message || "Market stream error" });
          return;
        }
        const events = Array.isArray(payload) ? payload : [payload];
        set((state) => {
          const quotes = { ...state.quotes };
          const trades = { ...state.trades };
          for (const item of events) {
            if (item.ev === "Q") {
              quotes[item.sym] = {
                symbol: item.sym,
                bid: item.bp,
                ask: item.ap,
                bidSize: item.bs,
                askSize: item.as,
                ts: item.t,
              };
            }
            if (item.ev === "T") {
              const list = trades[item.sym] ? [...trades[item.sym]] : [];
              list.unshift({ symbol: item.sym, price: item.p, size: item.s, ts: item.t });
              trades[item.sym] = list.slice(0, 50);
            }
          }
          return { quotes, trades };
        });
      } catch (err) {
        set({ error: "Market stream parse error" });
      }
    };
  },
  fetchSnapshot: async () => {
    try {
      const account = useAppStore.getState().account;
      const qs = account && account !== "ALL" ? `?account=${encodeURIComponent(account)}` : "";
      const snapRes = await api.get<Snapshot>(`/portfolio/snapshot${qs}`);
      set({ snapshot: snapRes.data, error: "" });
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 401) {
        set({ error: detail || "Schwab not connected. Click Connect." });
        return;
      }
      set({ error: detail || err?.message || "Portfolio fetch failed" });
    }
  },
  fetchBlotter: async () => {
    try {
      const blotterRes = await api.get<TradeBlotter>("/trade/blotter");
      set({ blotter: blotterRes.data, error: "" });
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 401) {
        set({ error: detail || "Schwab not connected. Click Connect." });
        return;
      }
      set({ error: detail || err?.message || "Blotter fetch failed" });
    }
  },
  fetchRisk: async () => {
    try {
      const riskRes = await api.get<RiskSummary>("/risk/summary");
      set({ risk: riskRes.data, error: "" });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      set({ error: detail || err?.message || "Risk fetch failed" });
    }
  },
  fetchStatus: async () => {
    try {
      const statusRes = await api.get<StatusComponent[]>("/status/components");
      set({ status: statusRes.data, error: "" });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      set({ error: detail || err?.message || "Status fetch failed" });
    }
  },
  fetchQuotes: async (symbols: string[]) => {
    const unique = Array.from(new Set(symbols.filter(Boolean)));
    if (!unique.length) return;
    try {
      const resp = await api.get(`/market/snapshot?symbols=${unique.join(",")}`);
      const tickers = resp.data?.tickers ?? resp.data?.results ?? [];
      if (!Array.isArray(tickers)) return;
      set((state) => {
        const next = { ...state.quotes };
        for (const row of tickers) {
          const symbol = row?.ticker || row?.sym || row?.symbol;
          if (!symbol) continue;
          const quote = row?.lastQuote || row?.last_quote || row?.quote || {};
          const bid = Number(quote?.bid ?? quote?.bp ?? 0);
          const ask = Number(quote?.ask ?? quote?.ap ?? 0);
          const bidSize = Number(quote?.bidSize ?? quote?.bs ?? 0);
          const askSize = Number(quote?.askSize ?? quote?.as ?? 0);
          const ts = Number(quote?.timestamp ?? quote?.t ?? Date.now());
          next[symbol] = { symbol, bid, ask, bidSize, askSize, ts };
        }
        return { quotes: next };
      });
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.data?.error;
      set({ error: detail || err?.message || "Quotes fetch failed" });
    }
  },
  refreshAll: async () => {
    await Promise.allSettled([
      useAppStore.getState().fetchSnapshot(),
      useAppStore.getState().fetchRisk(),
      useAppStore.getState().fetchBlotter(),
      useAppStore.getState().fetchStatus(),
    ]);
  },
  fetchNav: async (limit: number) => {
    try {
      const account = useAppStore.getState().account;
      const accountParam = account && account !== "ALL" ? `&account=${encodeURIComponent(account)}` : "";
      const navRes = await api.get<NavPoint[]>(`/portfolio/nav?limit=${limit}${accountParam}`);
      set({ nav: navRes.data });
    } catch (err: any) {
      set({ error: err?.message ?? "Nav fetch failed" });
    }
  },
}));
