import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "./store";
import type { Position } from "./store";
import { api } from "./services/api";
import PortfolioChart from "./components/PortfolioChart";
import ErrorBoundary from "./components/ErrorBoundary";

const strategyGroups = ["US L/S", "Vol Overlay", "Macro Hedges"];

const sectorOptions = [
  "Information Technology",
  "Financials",
  "Communication Services",
  "Consumer Discretionary",
  "Health Care",
  "Industrials",
  "Consumer Staples",
  "Utilities",
  "Real Estate",
  "Energy",
  "Materials",
];

const NAV_LIMITS: Record<string, number> = {
  "1D": 30,
  "5D": 60,
  "1M": 120,
  "3M": 180,
  "MAX": 3650,
};

function safeNumber(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number.isFinite(value) ? value : 0;
}

function formatMoney(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatSignedMoney(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatMoney(value, digits)}`;
}

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function formatSignedNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, digits)}`;
}

function formatSignedPct(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function parseOsiSymbol(symbol: string) {
  const s = symbol.trim().toUpperCase();
  const match = s.match(/^([A-Z0-9]{1,6})(\d{6})([CP])(\d{8})$/);
  if (!match) return null;
  const underlying = match[1];
  const y = `20${match[2].slice(0, 2)}`;
  const m = match[2].slice(2, 4);
  const d = match[2].slice(4, 6);
  const expiry = `${y}-${m}-${d}`;
  const option_type = match[3] === "C" ? "CALL" : "PUT";
  const strike = Number(match[4]) / 1000;
  return { underlying, expiry, option_type, strike };
}

function buildOsiSymbol(underlying: string, expiry: string, right: string, strike: number) {
  const u = (underlying || "").trim().toUpperCase();
  const exp = (expiry || "").trim();
  if (!u || !exp || !right || !Number.isFinite(strike)) return "";
  const ymd = exp.replaceAll("-", "").slice(2);
  if (ymd.length !== 6) return "";
  const strikeInt = Math.round(strike * 1000)
    .toString()
    .padStart(8, "0");
  const r = right.toUpperCase() === "P" ? "P" : "C";
  return `${u}${ymd}${r}${strikeInt}`;
}

function normalizeExpiryInput(value: string) {
  const raw = (value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dash = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dash) return `${dash[3]}-${dash[1]}-${dash[2]}`;
  const dashShort = raw.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (dashShort) return `20${dashShort[3]}-${dashShort[1]}-${dashShort[2]}`;
  const slash = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1]}-${slash[2]}`;
  const slashShort = raw.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (slashShort) return `20${slashShort[3]}-${slashShort[1]}-${slashShort[2]}`;
  return raw;
}

function isFutureSymbol(value: string) {
  const s = (value || "").trim().toUpperCase();
  if (!s) return false;
  return /^[A-Z0-9]{1,4}[FGHJKMNQUVXZ][0-9]{2}$/.test(s);
}

export default function App() {
  const [tab, setTab] = useState("Monitor");
  const [showLeft, setShowLeft] = useState(true);
  const [showChart, setShowChart] = useState(true);
  const [currentSymbol, setCurrentSymbol] = useState("AAPL");
  const [timeframe, setTimeframe] = useState("MAX");
  const [previewText, setPreviewText] = useState("Preview not run.");
  const [tradeSide, setTradeSide] = useState("BUY");
  const [tradeSymbol, setTradeSymbol] = useState("AAPL");
  const [tradeDate, setTradeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tradeSymbolTouched, setTradeSymbolTouched] = useState(false);
  const [tradeQty, setTradeQty] = useState("100");
  const tradeType = "LIMIT";
  const [tradeLimit, setTradeLimit] = useState("");
  const [tradeAssetClass, setTradeAssetClass] = useState("EQUITY");
  const [tradeExpiry, setTradeExpiry] = useState("");
  const [tradeStrike, setTradeStrike] = useState("");
  const [tradeOptionType, setTradeOptionType] = useState("CALL");
  const [tradeSector, setTradeSector] = useState(sectorOptions[0]);
  const [tradeLegs, setTradeLegs] = useState<
    {
      id: string;
      symbol: string;
      underlying: string;
      expiry: string;
      right: string;
      strike: string;
      side: string;
      qty: string;
      price: string;
    }[]
  >([]);
  const [toast, setToast] = useState("");
  const [clock, setClock] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapsedStrategies, setCollapsedStrategies] = useState<Record<string, boolean>>({});
  const [focus, setFocus] = useState<{ left?: string; center?: string }>({});
  const [activeTable, setActiveTable] = useState<"watchlist" | "positions" | null>(null);
  const [selectedWatchIndex, setSelectedWatchIndex] = useState(0);
  const [selectedPosIndex, setSelectedPosIndex] = useState(0);
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem("ws_watchlist");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const watchlistInitRef = useRef(false);
  const [watchlistInput, setWatchlistInput] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    symbol: string;
    selectSymbol?: string;
    mode: "watchlist" | "positions";
    instrumentId?: string | null;
    isStrategySummary?: boolean;
  } | null>(null);
  const [schwabConnected, setSchwabConnected] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [authDiag, setAuthDiag] = useState<any | null>(null);
  const [authDiagError, setAuthDiagError] = useState("");
  const [authError, setAuthError] = useState("");
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [positionForm, setPositionForm] = useState({
    instrument_id: "",
    symbol: "",
    qty: "",
    price: "",
    avg_cost: "",
    entry_date: "",
    asset_class: "EQUITY",
    underlying: "",
    expiry: "",
    strike: "",
    option_type: "CALL",
    multiplier: "",
    sector: "",
    strategy: "",
  });
  const [cashInput, setCashInput] = useState("");
  const [csvError, setCsvError] = useState("");
  const [benchStart, setBenchStart] = useState("");
  const [resetCash, setResetCash] = useState("");
  const [navRebuildRunning, setNavRebuildRunning] = useState(false);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [sectorView, setSectorView] = useState(sectorOptions[0]);
  const [sectorSeries, setSectorSeries] = useState<any[]>([]);
  const [sectorSeriesMap, setSectorSeriesMap] = useState<Record<string, any[]>>({});
  const [sectorError, setSectorError] = useState("");
  const [accountSeries, setAccountSeries] = useState<Array<{ name: string; data: any[] }>>([]);
  const [navPasteText, setNavPasteText] = useState("");
  const [navPasteError, setNavPasteError] = useState("");
  const [benchPasteText, setBenchPasteText] = useState("");
  const [benchPasteError, setBenchPasteError] = useState("");
  const [accountView, setAccountView] = useState("");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [accountTouched, setAccountTouched] = useState(false);
  const [chartFull, setChartFull] = useState(false);
  const [chartMode, setChartMode] = useState<"PORTFOLIO" | "SECTOR">("PORTFOLIO");
  const [chartShowBench, setChartShowBench] = useState(true);
  const [dismissedError, setDismissedError] = useState("");
  const [dismissedWarning, setDismissedWarning] = useState("");
  const [sectorSource, setSectorSource] = useState<"auto" | "etf" | "sleeve">("sleeve");
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [sectorTouched, setSectorTouched] = useState(false);
  const [strategyFilter, setStrategyFilter] = useState("");
  const [optionPreview, setOptionPreview] = useState<{ net: number; legs: number } | null>(null);

  const {
    snapshot,
    nav,
    risk,
    blotter,
    status,
    accounts,
    schwabStatus,
    account: accountId,
    setAccount,
    fetchAccounts,
    fetchSchwabStatus,
    quotes,
    marketConnected,
    connectMarketStream,
    fetchQuotes,
    fetchSnapshot,
    fetchStatus,
    fetchRisk,
    fetchBlotter,
    error,
    refreshAll,
    fetchNav,
  } = useAppStore();

  const staticMode = import.meta.env.VITE_STATIC_MODE !== "0";

  const positions = useMemo(() => snapshot?.positions ?? [], [snapshot]);
  const priceMap = useMemo(() => {
    const map = new Map<string, number>();
    positions.forEach((row) => map.set(row.symbol, row.price));
    return map;
  }, [positions]);
  const ownerOptions = useMemo(() => {
    const seen = new Set<string>();
    positions.forEach((row) => {
      const owner = (row.owner || "").trim();
      if (owner) seen.add(owner);
    });
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [positions]);
  const currentPosition = useMemo(
    () => positions.find((pos) => pos.symbol === currentSymbol),
    [positions, currentSymbol]
  );
  const tradePosition = useMemo(
    () => positions.find((pos) => pos.symbol === tradeSymbol),
    [positions, tradeSymbol]
  );
  const currentQuote = quotes[currentSymbol];
  const currentPrice = useMemo(() => {
    if (currentQuote) return (currentQuote.bid + currentQuote.ask) / 2;
    return priceMap.get(currentSymbol) ?? 0;
  }, [priceMap, currentSymbol, currentQuote]);

  const tradeQuote = quotes[tradeSymbol];
  const tradePrice = useMemo(() => {
    if (tradeQuote) return (tradeQuote.bid + tradeQuote.ask) / 2;
    return priceMap.get(tradeSymbol) ?? 0;
  }, [priceMap, tradeSymbol, tradeQuote]);
  const navLimit = useMemo(() => {
    const base = NAV_LIMITS[timeframe] ?? 120;
    if (!benchStart) return base;
    const startTs = Date.parse(benchStart);
    if (!Number.isFinite(startTs)) return base;
    const days = Math.ceil((Date.now() - startTs) / 86400000) + 5;
    return Math.max(base, days);
  }, [timeframe, benchStart]);

  const statusLine = useMemo(() => {
    if (!status?.length) return "Loading";
    const portfolioStatus = status.find((item) => item.component === "portfolio");
    const market = status.find((item) => item.component === "market");
    if (staticMode) {
      return portfolioStatus ? `STATIC · ${portfolioStatus.asof}` : "STATIC";
    }
    const flags: string[] = [];
    if (!schwabConnected) flags.push("SCHWAB OFF");
    if (portfolioStatus && !portfolioStatus.ok) flags.push("PORTFOLIO STALE");
    if (market && !market.ok) flags.push("MARKET STALE");
    if (flags.length) return flags.join(" · ");
    if (!portfolioStatus) return "OK";
    return `OK · ${portfolioStatus.asof}`;
  }, [status, schwabConnected, staticMode]);

  const positionsEmptyBanner = useMemo(() => {
    if (positions.length) return "";
    if (nav.length) return "No positions loaded. NAV history reflects prior data. Add positions or rebuild NAV.";
    return "No positions loaded.";
  }, [positions.length, nav.length]);

  const getPanelStatus = (component: string) => {
    const entry = status.find((item) => item.component === component);
    if (!entry) return { label: "STALE · —", ok: false, source: "unknown" };
    const label = `${entry.ok ? "LIVE" : "STALE"} · ${entry.asof} · ${entry.source}`;
    return { label, ok: entry.ok, source: entry.source };
  };

  const portfolioStatus = getPanelStatus("portfolio");
  const riskStatus = getPanelStatus("risk");
  const marketStatus = getPanelStatus("market");
  const brokerLabel =
    portfolioStatus.source === "demo"
      ? "Demo"
      : schwabConnected
        ? "Schwab ✓"
        : portfolioStatus.source === "local"
          ? "Local"
          : "Connect";

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const allowedByTab: Record<string, string[]> = {
      Monitor: ["positions", "chart"],
      Trade: ["trade", "preview"],
      Risk: ["risk"],
      Activity: ["blotter"],
      Analyze: ["risk-summary"],
      Admin: [],
    };
    const allowed = allowedByTab[tab] || [];
    if (focus.center && !allowed.includes(focus.center)) {
      setFocus((prev) => ({ ...prev, center: undefined }));
    }
  }, [tab, focus.center]);

  useEffect(() => {
    if (tab !== "Monitor") {
      if (chartFull) setChartFull(false);
      return;
    }
    if (!showChart && chartFull) {
      setChartFull(false);
    }
    if (!showChart && focus.center === "chart") {
      setFocus((prev) => ({ ...prev, center: undefined }));
    }
    if (!showChart && collapsed.positions) {
      setCollapsed((prev) => ({ ...prev, positions: false }));
    }
  }, [tab, showChart, chartFull, focus.center, collapsed.positions]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (staticMode) return;
    fetchSchwabStatus();
    const timer = setInterval(fetchSchwabStatus, 30000);
    return () => clearInterval(timer);
  }, [fetchSchwabStatus, staticMode]);

  useEffect(() => {
    if (schwabStatus) {
      setSchwabConnected(Boolean(schwabStatus.connected));
    }
  }, [schwabStatus]);

  useEffect(() => {
    const run = () => {
      fetchSnapshot();
      fetchStatus();
    };
    run();
    const timer = setInterval(run, 20000);
    return () => clearInterval(timer);
  }, [fetchSnapshot, fetchStatus, accountId]);

  useEffect(() => {
    if (tab !== "Risk" && tab !== "Analyze") return;
    const run = () => fetchRisk();
    run();
    const timer = setInterval(run, 30000);
    return () => clearInterval(timer);
  }, [tab, fetchRisk, accountId]);

  useEffect(() => {
    if (tab !== "Activity") return;
    const run = () => fetchBlotter();
    run();
    const timer = setInterval(run, 30000);
    return () => clearInterval(timer);
  }, [tab, fetchBlotter, accountId]);

  useEffect(() => {
    const run = () => fetchNav(navLimit);
    run();
    const timer = setInterval(run, 60000);
    return () => clearInterval(timer);
  }, [fetchNav, navLimit, accountId]);


  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const fetchAuthDiagnostics = async () => {
    try {
      const resp = await api.get("/auth/schwab/diagnostics");
      setAuthDiag(resp.data);
      setAuthDiagError("");
    } catch (err: any) {
      setAuthDiag(null);
      setAuthDiagError(err?.response?.data?.detail ?? "Diagnostics unavailable");
    }
  };

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => {
      window.removeEventListener("click", close);
    };
  }, []);

  useEffect(() => {
    if (chartMode !== "SECTOR") return;
    if (!sectorTouched && selectedSectors.length === 0 && sectorView) {
      setSelectedSectors([sectorView]);
    }
  }, [chartMode, sectorView, selectedSectors.length, sectorTouched]);

  useEffect(() => {
    let active = true;
    const loadSectors = async () => {
      if (chartMode !== "SECTOR") {
        setSectorSeries([]);
        setSectorSeriesMap({});
        setSectorError("");
        return;
      }
      const targets = selectedSectors.length
        ? selectedSectors
        : !sectorTouched && sectorView
          ? [sectorView]
          : [];
      if (!targets.length) {
        setSectorSeries([]);
        setSectorSeriesMap({});
        setSectorError("");
        return;
      }
      try {
        const accountParam = accountId && accountId !== "ALL" ? `&account=${encodeURIComponent(accountId)}` : "";
        const responses = await Promise.all(
          targets.map((sector) =>
            api.get(
              `/portfolio/sector?sector=${encodeURIComponent(sector)}&limit=${navLimit}&source=${sectorSource}${accountParam}`
            )
          )
        );
        if (!active) return;
        const nextMap: Record<string, any[]> = {};
        responses.forEach((resp, idx) => {
          nextMap[targets[idx]] = resp.data ?? [];
        });
        setSectorSeriesMap(nextMap);
        setSectorSeries(nextMap[targets[0]] ?? []);
        setSectorError("");
      } catch (err: any) {
        if (!active) return;
        setSectorSeries([]);
        setSectorSeriesMap({});
        setSectorError(err?.response?.data?.detail ?? "Sector series unavailable");
      }
    };
    loadSectors();
    return () => {
      active = false;
    };
  }, [selectedSectors, sectorView, navLimit, chartMode, sectorSource, accountId]);

  const dataQuality = snapshot?.data_quality;
  const pricingBanner = useMemo(() => {
    if (!dataQuality) return null;
    const sources = Object.entries(dataQuality.sources || {})
      .map(([key, value]) => `${key}:${value}`)
      .join(" · ");
    const missingAssets = (dataQuality.missing_assets || []).map((a) => a.toUpperCase()).join(", ");
    if (dataQuality.all_priced) {
      return {
        ok: true,
        text: `Pricing sources: ${sources || "—"} · All asset classes priced`,
      };
    }
    return {
      ok: false,
      text: `Pricing sources: ${sources || "—"} · Missing: ${missingAssets || "UNKNOWN"}`,
    };
  }, [dataQuality]);
  const positionsDisplay = useMemo(() => {
    if (!positions.length) return [];
    const filtered = strategyFilter
      ? positions.filter((row) => {
          const value = (row.strategy_name || row.strategy || "").toString();
          return value.toLowerCase().includes(strategyFilter.toLowerCase());
        })
      : positions;
    if (!filtered.length) return [];
    const grouped = new Map<string, typeof positions>();
    const order: Array<{ type: "row"; row: (typeof positions)[number] } | { type: "group"; id: string }> = [];
    for (const row of filtered) {
      const asset = String(row.asset_class || "").toLowerCase();
      const strategyId = row.strategy_id || (row.strategy ? String(row.strategy) : "");
      if (asset === "option" && strategyId) {
        if (!grouped.has(strategyId)) {
          grouped.set(strategyId, []);
          order.push({ type: "group", id: strategyId });
        }
        grouped.get(strategyId)?.push(row);
      } else {
        order.push({ type: "row", row });
      }
    }
    const out: any[] = [];
    for (const entry of order) {
      if (entry.type === "row") {
        out.push(entry.row);
        continue;
      }
      const strategyId = entry.id;
      const legs = grouped.get(strategyId) ?? [];
      if (legs.length < 2) {
        out.push(...legs);
        continue;
      }
      const units =
        Math.min(...legs.map((l) => Math.abs(Number(l.qty || 0))).filter((v) => v > 0)) ||
        Math.abs(Number(legs[0]?.qty || 0)) ||
        1;
      const baseMultiplier = Number(legs[0]?.multiplier || 100) || 100;
      let netValue = 0;
      let netAvgValue = 0;
      let netMv = 0;
      let netPnl = 0;
      let netDay = 0;
      for (const leg of legs) {
        const qty = Number(leg.qty || 0);
        const rawPrice = Number(leg.price || 0);
        const avg = Number(leg.avg_cost ?? leg.price ?? 0);
        const price = rawPrice > 0 ? rawPrice : avg > 0 ? avg : 0;
        const multiplier = Number(leg.multiplier || baseMultiplier) || baseMultiplier;
        netValue += qty * price * multiplier;
        netAvgValue += qty * avg * multiplier;
        netMv += Number(leg.market_value || 0);
        netPnl += Number(leg.total_pnl || 0);
        netDay += Number(leg.day_pnl || 0);
      }
      const netPrice = units ? netValue / (units * baseMultiplier) : 0;
      const netAvgCost = units ? netAvgValue / (units * baseMultiplier) : 0;
      const pctDenom = Math.abs(netAvgCost) > 0 ? Math.abs(netAvgCost) * units * baseMultiplier : 0;
      const totalPnlPct = pctDenom ? (netPnl / pctDenom) * 100 : 0;
      const dayPnlPct = pctDenom ? (netDay / pctDenom) * 100 : 0;
      const summarySide = netValue < 0 ? "SHORT" : "LONG";
      const strategyName =
        legs[0]?.strategy_name || legs[0]?.strategy || `Strategy ${strategyId.slice(0, 6)}`;
      const summary = {
        ...legs[0],
        symbol: strategyName,
        asset_class: "strategy",
        qty: units,
        price: netPrice,
        avg_cost: netAvgCost,
        market_value: netMv,
        total_pnl: netPnl,
        day_pnl: netDay,
        total_pnl_pct: totalPnlPct,
        day_pnl_pct: dayPnlPct,
        position_side: summarySide,
        expiry: null,
        strike: null,
        option_type: null,
        strategy: strategyName,
        strategy_id: strategyId,
        strategy_name: strategyName,
        isStrategySummary: true,
        legCount: legs.length,
      };
      out.push(summary);
      if (!collapsedStrategies[strategyId]) {
        out.push(
          ...legs.map((leg) => ({
            ...leg,
            isStrategyLeg: true,
            strategy_id: strategyId,
            strategy_name: strategyName,
          }))
        );
      }
    }
    return out;
  }, [positions, collapsedStrategies, strategyFilter]);

  useEffect(() => {
    if (watchlistInitRef.current) return;
    if (watchlistSymbols.length) {
      watchlistInitRef.current = true;
      return;
    }
    if (positions.length) {
      const symbols = Array.from(new Set(positions.map((row) => row.symbol).filter(Boolean)));
      setWatchlistSymbols(symbols);
      watchlistInitRef.current = true;
    }
  }, [positions, watchlistSymbols]);

  useEffect(() => {
    try {
      window.localStorage.setItem("ws_watchlist", JSON.stringify(watchlistSymbols));
    } catch {
      // ignore
    }
  }, [watchlistSymbols]);

  useEffect(() => {
    const loadBench = async () => {
      try {
        const resp = await api.get("/admin/benchmark");
        const value = resp.data?.bench_start;
        if (value) setBenchStart(value);
      } catch {
        // ignore
      }
    };
    loadBench();
  }, []);

  const navFiltered = useMemo(() => {
    if (!benchStart) return nav;
    const filtered = nav.filter((point) => point.date >= benchStart);
    return filtered.length ? filtered : nav;
  }, [nav, benchStart]);

  const chartData = useMemo(() => navFiltered, [navFiltered]);

  const sectorSeriesList = useMemo(() => {
    if (chartMode !== "SECTOR") return [];
    const names = selectedSectors.length
      ? selectedSectors
      : !sectorTouched && sectorView
        ? [sectorView]
        : [];
    const base = benchStart ? chartData.filter((point) => point.date >= benchStart) : chartData;
    return names.map((name) => {
      const series = sectorSeriesMap[name] ?? [];
      const filtered = benchStart ? series.filter((point: any) => point.date >= benchStart) : series;
      const data = filtered.length
        ? filtered
        : base.map((point: any) => ({ ...point, sector: 0 }));
      return { name, data };
    });
  }, [chartMode, sectorSeriesMap, benchStart, sectorView, selectedSectors, sectorTouched, chartData]);

  const sectorEmpty = useMemo(() => {
    if (chartMode !== "SECTOR") return false;
    if (!sectorSeriesList.length) return true;
    return sectorSeriesList.every((series) => !series.data?.length);
  }, [chartMode, sectorSeriesList]);

  const addSectorSelection = () => {
    if (!sectorView) return;
    setSectorTouched(true);
    setSelectedSectors((prev) => (prev.includes(sectorView) ? prev : [...prev, sectorView]));
  };

  const removeSectorSelection = (sector: string) => {
    setSectorTouched(true);
    setSelectedSectors((prev) => prev.filter((s) => s !== sector));
  };

  const clearSectorSelection = () => {
    setSectorTouched(true);
    setSelectedSectors([]);
  };

  const addAccountSelection = () => {
    if (!accountView) return;
    setAccountTouched(true);
    setSelectedAccounts((prev) => (prev.includes(accountView) ? prev : [...prev, accountView]));
  };

  const removeAccountSelection = (name: string) => {
    setAccountTouched(true);
    setSelectedAccounts((prev) => prev.filter((acct) => acct !== name));
  };

  const clearAccountSelection = () => {
    setAccountTouched(true);
    setSelectedAccounts([]);
  };

  const connectionBanner = useMemo(() => {
    const warnings: string[] = [];
    if (!schwabConnected) warnings.push("Schwab not connected");
    if (!marketStatus.ok) warnings.push("Market data stale");
    if (!portfolioStatus.ok) warnings.push("Portfolio stale");
    return warnings.join(" · ");
  }, [schwabConnected, marketStatus.ok, portfolioStatus.ok]);

  useEffect(() => {
    if (error && error !== dismissedError) {
      setDismissedError("");
    }
  }, [error]);

  useEffect(() => {
    if (connectionBanner && connectionBanner !== dismissedWarning) {
      setDismissedWarning("");
    }
  }, [connectionBanner]);

  const showErrorBanner = Boolean(error) && error !== dismissedError;
  const showWarningBanner = Boolean(connectionBanner) && connectionBanner !== dismissedWarning;

  const accountSummary = useMemo(() => {
    if (!snapshot) return null;
    const marginRequired = snapshot.margin_required ?? 0;
    const marginAvailable =
      snapshot.margin_available != null ? snapshot.margin_available : snapshot.cash - marginRequired;
    const cashTotal = snapshot.cash ?? 0;
    const cashAvailable = cashTotal - marginRequired;
    const label = accountId && accountId !== "ALL" ? accountId : "All Accounts";
    return {
      name: label,
      nlv: formatMoney(snapshot.nlv),
      dayPnl: formatSignedMoney(snapshot.day_pnl),
      totalPnl: formatSignedMoney(snapshot.total_pnl),
      cash: formatMoney(cashAvailable),
      cashTotal: formatMoney(cashTotal),
      buyingPower: formatMoney(snapshot.buying_power),
      margin: formatMoney(marginRequired),
      marginAvailable: formatMoney(marginAvailable),
    };
  }, [snapshot, accountId]);

  const accountOptions = useMemo(() => {
    const names = accounts
      .map((row) => row.account)
      .filter(Boolean)
      .filter((name) => name.toUpperCase() !== "ALL");
    const unique = Array.from(new Set(names));
    return ["ALL", ...unique];
  }, [accounts]);

  const accountChartOptions = useMemo(() => {
    return accounts
      .map((row) => row.account)
      .filter(Boolean)
      .filter((name) => name.toUpperCase() !== "ALL");
  }, [accounts]);

  useEffect(() => {
    if (!accountChartOptions.length) {
      setAccountView("");
      setSelectedAccounts([]);
      setAccountTouched(false);
      return;
    }
    if (!accountView || !accountChartOptions.includes(accountView)) {
      setAccountView(accountChartOptions[0]);
    }
    setSelectedAccounts((prev) => prev.filter((name) => accountChartOptions.includes(name)));
  }, [accountChartOptions, accountView]);

  useEffect(() => {
    let cancelled = false;
    if (accountId !== "ALL") {
      setAccountSeries([]);
      setSelectedAccounts([]);
      setAccountTouched(false);
      return () => {
        cancelled = true;
      };
    }
    const accountNames = accountChartOptions;
    if (!accountNames.length || selectedAccounts.length === 0) {
      setAccountSeries([]);
      return () => {
        cancelled = true;
      };
    }
    const fetchSeries = async () => {
      try {
        const targets = selectedAccounts.filter((name) => accountNames.includes(name));
        if (!targets.length) {
          if (!cancelled) setAccountSeries([]);
          return;
        }
        const series = await Promise.all(
          targets.map(async (name) => {
            const resp = await api.get<NavPoint[]>(
              `/portfolio/nav?limit=${navLimit}&account=${encodeURIComponent(name)}`
            );
            return { name, data: resp.data ?? [] };
          })
        );
        if (!cancelled) {
          setAccountSeries(series.filter((row) => row.data && row.data.length));
        }
      } catch {
        if (!cancelled) setAccountSeries([]);
      }
    };
    fetchSeries();
    return () => {
      cancelled = true;
    };
  }, [accountId, accountChartOptions, navLimit, selectedAccounts]);

  const riskMetricMap = useMemo(() => {
    const map = new Map<string, { metric: string; value: number; limit?: number | null; breached?: boolean }>();
    (risk?.metrics ?? []).forEach((row) => {
      map.set(row.metric, row);
    });
    return map;
  }, [risk]);

  const formatRiskValue = (metric: string, value: number) => {
    if (!Number.isFinite(value)) return "—";
    if (metric.includes("concentration") || metric.includes("drawdown") || metric.startsWith("matrix_")) {
      return formatSignedPct(value * 100, 2);
    }
    if (metric === "beta" || metric === "delta" || metric === "sharpe") {
      return formatSignedNumber(value, 2);
    }
    if (metric.includes("exposure") || metric.includes("notional") || metric.includes("var")) {
      return formatSignedMoney(value, 0);
    }
    return formatSignedNumber(value, 2);
  };

  const riskRows = useMemo(() => {
    const order = [
      "gross_exposure",
      "net_exposure",
      "long_exposure",
      "short_exposure",
      "beta",
      "sharpe",
      "max_drawdown",
      "var_95",
      "delta",
      "delta_exposure",
      "gamma_exposure",
      "theta_exposure",
      "vega_exposure",
      "top1_concentration",
      "top5_concentration",
      "futures_notional",
    ];
    return order
      .map((key) => riskMetricMap.get(key))
      .filter(Boolean)
      .map((row) => row!);
  }, [riskMetricMap]);

  const riskLabels: Record<string, string> = {
    gross_exposure: "Gross Exposure",
    net_exposure: "Net Exposure",
    long_exposure: "Long Exposure",
    short_exposure: "Short Exposure",
    beta: "Beta vs SPX",
    sharpe: "Sharpe Ratio",
    max_drawdown: "Max Drawdown",
    var_95: "VaR (95%)",
    delta: "Delta (−1..1)",
    delta_exposure: "Delta Exposure",
    gamma_exposure: "Gamma Exposure",
    theta_exposure: "Theta Exposure",
    vega_exposure: "Vega Exposure",
    top1_concentration: "Top 1 Position % NAV",
    top5_concentration: "Top 5 Positions % NAV",
    futures_notional: "Futures Notional",
  };

  const riskMatrix = useMemo(() => {
    const classes = ["equity", "option", "future"];
    return classes.map((cls) => {
      const long = riskMetricMap.get(`matrix_${cls}_long`)?.value ?? 0;
      const short = riskMetricMap.get(`matrix_${cls}_short`)?.value ?? 0;
      const net = riskMetricMap.get(`matrix_${cls}_net`)?.value ?? 0;
      return { cls, long, short, net };
    });
  }, [riskMetricMap]);


  const notify = (message: string) => setToast(message);
  const requireAccount = (action: string, setError?: (message: string) => void) => {
    if (!accountId || accountId === "ALL") {
      const msg = `Select a specific account (not ALL) to ${action}.`;
      if (setError) setError(msg);
      notify(msg);
      return null;
    }
    return accountId;
  };

  const addWatchSymbol = () => {
    const symbol = watchlistInput.trim().toUpperCase();
    if (!symbol) return;
    setWatchlistSymbols((prev) => (prev.includes(symbol) ? prev : [...prev, symbol]));
    setWatchlistInput("");
  };

  const removeWatchSymbol = (symbol: string) => {
    setWatchlistSymbols((prev) => prev.filter((s) => s !== symbol));
  };

  const addLeg = () => {
    setTradeAssetClass("OPTION");
    setTradeLegs((prev) => {
      const last = prev[prev.length - 1];
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          symbol: "",
          underlying: last?.underlying || tradeSymbol || "",
          expiry: last?.expiry || tradeExpiry || "",
          right: last?.right || (tradeOptionType.startsWith("P") ? "P" : "C"),
          strike: last?.strike || tradeStrike || "",
          side: last?.side || tradeSide || "BUY",
          qty: last?.qty || tradeQty || "",
          price: "",
        },
      ];
    });
  };

  const updateLeg = (
    id: string,
    field: "symbol" | "underlying" | "expiry" | "right" | "strike" | "side" | "qty" | "price",
    value: string
  ) => {
    setTradeLegs((prev) =>
      prev.map((leg) => {
        if (leg.id !== id) return leg;
        const next = { ...leg, [field]: value };
        if (field === "symbol") {
          const parsed = parseOsiSymbol(value);
          if (parsed) {
            next.underlying = parsed.underlying;
            next.expiry = parsed.expiry;
            next.right = parsed.option_type === "PUT" ? "P" : "C";
            next.strike = String(parsed.strike);
          }
        }
        if (["underlying", "expiry", "right", "strike"].includes(field) || !next.symbol.trim()) {
          const underlying = next.underlying.trim().toUpperCase();
          const expiry = normalizeExpiryInput(next.expiry.trim());
          const rightRaw = next.right.trim().toUpperCase();
          const right = rightRaw.startsWith("P") ? "P" : rightRaw.startsWith("C") ? "C" : rightRaw;
          const strike = Number(next.strike);
          if (underlying && expiry && right && Number.isFinite(strike) && strike > 0) {
            const built = buildOsiSymbol(underlying, expiry, right, strike);
            if (built) next.symbol = built;
          }
        }
        return next;
      })
    );
  };

  const removeLeg = (id: string) => {
    setTradeLegs((prev) => prev.filter((leg) => leg.id !== id));
  };

  const toggleCollapsed = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleStrategy = (strategyId: string) => {
    if (!strategyId) return;
    setCollapsedStrategies((prev) => ({ ...prev, [strategyId]: !prev[strategyId] }));
  };

  const toggleFocus = (column: "left" | "center", key: string) => {
    setFocus((prev) => ({ ...prev, [column]: prev[column] === key ? undefined : key }));
  };

  const showPanel = (column: "left" | "center", key: string) => !focus[column] || focus[column] === key;

  const resetLayout = () => {
    setCollapsed({});
    setCollapsedStrategies({});
    setFocus({});
    setShowLeft(true);
    setShowChart(true);
    setChartFull(false);
    setTab("Monitor");
    notify("Layout reset.");
  };

  const openTrade = () => {
    if (staticMode) {
      notify("Trading is disabled in static mode.");
      return;
    }
    setTab("Trade");
    setTimeout(() => document.getElementById("trade-symbol")?.focus(), 0);
  };

  const ensureTradeQty = (fallback = "1") => {
    if (!tradeQty || !Number.isFinite(Number(tradeQty)) || Number(tradeQty) === 0) {
      setTradeQty(fallback);
      return fallback;
    }
    return tradeQty;
  };

  const prefillOrderTrade = (side: string, limit: string) => {
    const symbol = currentSymbol.trim().toUpperCase();
    const isFuture = isFutureSymbol(symbol);
    setTradeAssetClass(isFuture ? "FUTURE" : "EQUITY");
    setTradeSymbolTouched(true);
    setTradeSymbol(symbol);
    setTradeSide(side);
    setTradeLimit(limit);
    ensureTradeQty();
    setTradeLegs([]);
    openTrade();
  };

  const openPositionModal = (position?: Position) => {
    if (position) {
      setPositionForm({
        instrument_id: position.instrument_id ?? "",
        symbol: position.symbol ?? "",
        qty: String(position.qty ?? ""),
        price: String(position.price ?? ""),
        avg_cost: position.avg_cost != null ? String(position.avg_cost) : "",
        entry_date: position.entry_date ?? "",
        asset_class: (position.asset_class ?? "EQUITY").toUpperCase(),
        underlying: position.underlying ?? "",
        expiry: position.expiry ?? "",
        strike: position.strike != null ? String(position.strike) : "",
        option_type: (position.option_type ?? "CALL").toUpperCase(),
        multiplier: position.multiplier != null ? String(position.multiplier) : "",
        sector: position.sector ?? "",
        strategy: position.strategy ?? "",
      });
    } else {
      setPositionForm({
        instrument_id: "",
        symbol: "",
        qty: "",
        price: "",
        avg_cost: "",
        entry_date: "",
        asset_class: "EQUITY",
        underlying: "",
        expiry: "",
        strike: "",
        option_type: "CALL",
        multiplier: "",
        sector: "",
        strategy: "",
      });
    }
    setPositionModalOpen(true);
  };

  const savePosition = async () => {
    const account = requireAccount("save positions");
    if (!account) return;
    const payload = {
      account,
      instrument_id: positionForm.instrument_id || undefined,
      symbol: positionForm.symbol.trim().toUpperCase(),
      qty: Number(positionForm.qty),
      price: Number(positionForm.price),
      avg_cost: positionForm.avg_cost ? Number(positionForm.avg_cost) : undefined,
      entry_date: positionForm.entry_date || undefined,
      asset_class: positionForm.asset_class,
      underlying: positionForm.underlying ? positionForm.underlying.toUpperCase() : undefined,
      expiry: positionForm.expiry || undefined,
      strike: positionForm.strike ? Number(positionForm.strike) : undefined,
      option_type: positionForm.option_type,
      multiplier: positionForm.asset_class === "OPTION" ? 100 : undefined,
      sector: positionForm.sector || undefined,
      strategy: positionForm.strategy || undefined,
    };
    if (!payload.symbol || !Number.isFinite(payload.qty) || !Number.isFinite(payload.price)) {
      notify("Symbol, qty, and price are required.");
      return;
    }
    try {
      await api.post("/positions", payload);
      setPositionModalOpen(false);
      refreshAll();
      notify("Position saved.");
    } catch (err: any) {
      notify(err?.response?.data?.detail ?? "Failed to save position");
    }
  };

  const removePosition = async (instrumentId?: string | null) => {
    if (!instrumentId) {
      notify("Missing instrument id.");
      return;
    }
    const account = requireAccount("remove positions");
    if (!account) return;
    try {
      await api.delete(`/positions/${encodeURIComponent(instrumentId)}?account=${encodeURIComponent(account)}`);
      refreshAll();
      notify("Position removed.");
    } catch (err: any) {
      notify(err?.response?.data?.detail ?? "Failed to remove position");
    }
  };

  const updatePositionSector = async (row: any, sector: string) => {
    if (!row?.instrument_id) {
      notify("Missing instrument id.");
      return;
    }
    const account = requireAccount("update positions");
    if (!account) return;
    try {
      await api.post("/positions", {
        account,
        instrument_id: row.instrument_id,
        symbol: row.symbol,
        qty: Number(row.qty),
        price: Number(row.price),
        avg_cost: row.avg_cost != null ? Number(row.avg_cost) : undefined,
        asset_class: row.asset_class,
        underlying: row.underlying || undefined,
        expiry: row.expiry || undefined,
        strike: row.strike != null ? Number(row.strike) : undefined,
        option_type: row.option_type || undefined,
        multiplier: row.multiplier != null ? Number(row.multiplier) : undefined,
        owner: row.owner || undefined,
        entry_date: row.entry_date || undefined,
        sector: sector || undefined,
        strategy: row.strategy_name || row.strategy || undefined,
      });
      refreshAll();
      notify(`Sector updated: ${sector || "Unassigned"}`);
    } catch (err: any) {
      notify(err?.response?.data?.detail ?? "Failed to update sector");
    }
  };

  const updatePositionOwner = async (row: any, owner: string) => {
    if (!row?.instrument_id) {
      notify("Missing instrument id.");
      return;
    }
    const account = requireAccount("update positions");
    if (!account) return;
    const trimmed = owner.trim();
    const current = (row.owner || "").trim();
    if (trimmed === current) {
      return;
    }
    try {
      await api.post("/positions", {
        account,
        instrument_id: row.instrument_id,
        symbol: row.symbol,
        qty: Number(row.qty),
        price: Number(row.price),
        avg_cost: row.avg_cost != null ? Number(row.avg_cost) : undefined,
        asset_class: row.asset_class,
        underlying: row.underlying || undefined,
        expiry: row.expiry || undefined,
        strike: row.strike != null ? Number(row.strike) : undefined,
        option_type: row.option_type || undefined,
        multiplier: row.multiplier != null ? Number(row.multiplier) : undefined,
        owner: trimmed || null,
        entry_date: row.entry_date || undefined,
        sector: row.sector || undefined,
        strategy: row.strategy_name || row.strategy || undefined,
      });
      refreshAll();
      notify(`Owner updated: ${trimmed || "Unassigned"}`);
    } catch (err: any) {
      notify(err?.response?.data?.detail ?? "Failed to update owner");
    }
  };

  const updatePositionEntryDate = async (row: any, value: string) => {
    if (!row?.instrument_id) {
      notify("Missing instrument id.");
      return;
    }
    const account = requireAccount("update positions");
    if (!account) return;
    const trimmed = value.trim();
    const current = (row.entry_date || "").trim();
    if (trimmed === current) return;
    if (trimmed && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      notify("Entry date must be YYYY-MM-DD.");
      return;
    }
    try {
      await api.post("/positions", {
        account,
        instrument_id: row.instrument_id,
        symbol: row.symbol,
        qty: Number(row.qty),
        price: Number(row.price),
        avg_cost: row.avg_cost != null ? Number(row.avg_cost) : undefined,
        asset_class: row.asset_class,
        underlying: row.underlying || undefined,
        expiry: row.expiry || undefined,
        strike: row.strike != null ? Number(row.strike) : undefined,
        option_type: row.option_type || undefined,
        multiplier: row.multiplier != null ? Number(row.multiplier) : undefined,
        owner: row.owner || undefined,
        entry_date: trimmed || null,
        sector: row.sector || undefined,
        strategy: row.strategy_name || row.strategy || undefined,
      });
      refreshAll();
      notify(`Entry date updated: ${trimmed || "cleared"}`);
    } catch (err: any) {
      notify(err?.response?.data?.detail ?? "Failed to update entry date");
    }
  };

  const updateCash = async () => {
    if (cashInput.trim() === "") {
      notify("Enter a cash value.");
      return;
    }
    const value = Number(cashInput);
    if (!Number.isFinite(value)) {
      notify("Enter a valid cash value.");
      return;
    }
    const account = requireAccount("update cash balances");
    if (!account) return;
    try {
      await api.post("/positions/cash", { cash: value, account });
      refreshAll();
      notify("Cash updated.");
    } catch (err: any) {
      notify(err?.response?.data?.detail ?? "Failed to update cash");
    }
  };

  const resetPortfolio = async () => {
    if (resetCash.trim() === "") {
      notify("Enter a reset cash value.");
      return;
    }
    const cleaned = resetCash.replace(/[$,\\s]/g, "");
    const value = Number(cleaned);
    if (!Number.isFinite(value) || value <= 0) {
      notify("Reset cash must be > 0.");
      return;
    }
    try {
      await api.post("/admin/reset", { start_cash: value });
      refreshAll();
      fetchNav();
      notify("Portfolio reset complete");
    } catch (err: any) {
      notify(err?.response?.data?.detail ?? "Reset failed");
    }
  };

  const rebuildNavHistory = async () => {
    if (navRebuildRunning) return;
    setNavRebuildRunning(true);
    try {
      const accountParam = accountId && accountId !== "ALL" ? `?account=${encodeURIComponent(accountId)}` : "";
      const resp = await api.post(`/admin/rebuild-nav${accountParam}`);
      const count = resp.data?.count ?? 0;
      const start = resp.data?.start ?? "";
      const end = resp.data?.end ?? "";
      setToast(`NAV history rebuilt (${count} points${start && end ? ` · ${start} → ${end}` : ""}).`);
      await fetchNav(navLimit);
      await refreshAll();
    } catch (err: any) {
      setToast(err?.response?.data?.detail ?? err?.message ?? "Failed to rebuild NAV history.");
    } finally {
      setNavRebuildRunning(false);
    }
  };

  const clearNavHistory = async () => {
    if (navRebuildRunning) return;
    setNavRebuildRunning(true);
    try {
      const accountParam = accountId && accountId !== "ALL" ? `?account=${encodeURIComponent(accountId)}` : "";
      const resp = await api.post(`/admin/clear-nav${accountParam}`);
      const removed = resp.data?.removed ?? 0;
      setToast(`NAV history cleared (${removed} rows).`);
      await fetchNav(navLimit);
      await refreshAll();
    } catch (err: any) {
      setToast(err?.response?.data?.detail ?? err?.message ?? "Failed to clear NAV history.");
    } finally {
      setNavRebuildRunning(false);
    }
  };

  const setBenchmarkStart = async () => {
    if (!benchStart) {
      notify("Benchmark start is required.");
      return;
    }
    try {
      await api.post("/admin/benchmark", { bench_start: benchStart });
      refreshAll();
      notify("Benchmark start updated.");
    } catch (err: any) {
      notify(err?.response?.data?.detail ?? "Benchmark update failed");
    }
  };

  const parseCsvRows = (text: string) => {
    const rows: string[][] = [];
    let current = "";
    let row: string[] = [];
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === "\"") {
          if (text[i + 1] === "\"") {
            current += "\"";
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else if (ch === "\"") {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(current);
        current = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i += 1;
        row.push(current);
        if (row.some((cell) => cell.trim() !== "")) rows.push(row);
        row = [];
        current = "";
      } else {
        current += ch;
      }
    }
    if (current.length || row.length) {
      row.push(current);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
    }
    return rows;
  };

  const parseCsv = (text: string) => {
    const rows = parseCsvRows(text);
    if (!rows.length) return [];
    const header = rows[0].map((cell) => cell.trim());
    const dataRows = rows.slice(1);
    return dataRows.map((cols) => {
      const data: Record<string, string> = {};
      header.forEach((key, idx) => {
        data[key] = cols[idx] ?? "";
      });
      return data;
    });
  };

  const stripBom = (value: string) => value.replace(/^\ufeff/, "");

  const normalizeHeader = (key: string) =>
    stripBom(key ?? "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const parseNumber = (raw: string) => {
    if (!raw) return NaN;
    const trimmed = raw.toString().trim();
    if (!trimmed) return NaN;
    const negative = /^\(.*\)$/.test(trimmed);
    const cleaned = trimmed.replace(/[,$%]/g, "").replace(/[()]/g, "");
    const value = Number(cleaned);
    if (!Number.isFinite(value)) return NaN;
    return negative ? -value : value;
  };

  const parseOptionDescription = (raw: string, fallbackUnderlying?: string) => {
    const text = (raw || "").trim().toUpperCase();
    if (!text) return null;
    const cleaned = text.replace(/\s+/g, " ");
    const numericMatch = cleaned.match(
      /^(?:\d+\s+)?([A-Z0-9]{1,6})\s+(?:\d+\s+)?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s+(\d+(?:\.\d+)?)\s*(CALL|PUT|[CP])\b/
    );
    const monthMatch = cleaned.match(
      /^(?:\d+\s+)?([A-Z0-9]{1,6})\s+(?:\d+\s+)?(\d{1,2})\s+([A-Z]{3})\s+(\d{2,4})\s+(\d+(?:\.\d+)?)\s*(CALL|PUT|[CP])\b/
    );
    const numericNoUnderlying = cleaned.match(
      /^(?:\d+\s+)?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s+(\d+(?:\.\d+)?)\s*(CALL|PUT|[CP])\b/
    );
    const monthNoUnderlying = cleaned.match(
      /^(?:\d+\s+)?(\d{1,2})\s+([A-Z]{3})\s+(\d{2,4})\s+(\d+(?:\.\d+)?)\s*(CALL|PUT|[CP])\b/
    );
    let underlying = "";
    let expiry = "";
    let strike = 0;
    let right = "";
    if (numericMatch) {
      underlying = numericMatch[1];
      expiry = normalizeExpiryInput(numericMatch[2]);
      strike = Number(numericMatch[3]);
      right = numericMatch[4].startsWith("P") ? "P" : "C";
    } else if (monthMatch) {
      underlying = monthMatch[1];
      const day = monthMatch[2].padStart(2, "0");
      const monthKey = monthMatch[3];
      const yearRaw = monthMatch[4];
      const strikeRaw = monthMatch[5];
      const rightRaw = monthMatch[6];
      const monthMap: Record<string, string> = {
        JAN: "01",
        FEB: "02",
        MAR: "03",
        APR: "04",
        MAY: "05",
        JUN: "06",
        JUL: "07",
        AUG: "08",
        SEP: "09",
        OCT: "10",
        NOV: "11",
        DEC: "12",
      };
      const month = monthMap[monthKey];
      const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
      if (month) expiry = `${year}-${month}-${day}`;
      strike = Number(strikeRaw);
      right = rightRaw.startsWith("P") ? "P" : "C";
    } else if (numericNoUnderlying && fallbackUnderlying) {
      underlying = fallbackUnderlying.toUpperCase();
      expiry = normalizeExpiryInput(numericNoUnderlying[1]);
      strike = Number(numericNoUnderlying[2]);
      right = numericNoUnderlying[3].startsWith("P") ? "P" : "C";
    } else if (monthNoUnderlying && fallbackUnderlying) {
      underlying = fallbackUnderlying.toUpperCase();
      const day = monthNoUnderlying[1].padStart(2, "0");
      const monthKey = monthNoUnderlying[2];
      const yearRaw = monthNoUnderlying[3];
      const strikeRaw = monthNoUnderlying[4];
      const rightRaw = monthNoUnderlying[5];
      const monthMap: Record<string, string> = {
        JAN: "01",
        FEB: "02",
        MAR: "03",
        APR: "04",
        MAY: "05",
        JUN: "06",
        JUL: "07",
        AUG: "08",
        SEP: "09",
        OCT: "10",
        NOV: "11",
        DEC: "12",
      };
      const month = monthMap[monthKey];
      const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
      if (month) expiry = `${year}-${month}-${day}`;
      strike = Number(strikeRaw);
      right = rightRaw.startsWith("P") ? "P" : "C";
    } else {
      return null;
    }
    const symbol = buildOsiSymbol(underlying, expiry, right, strike);
    if (!symbol) return null;
    return {
      symbol,
      underlying,
      expiry,
      strike,
      option_type: right === "P" ? "PUT" : "CALL",
    };
  };

  const parseAccountStatementPositions = (rows: string[][]) => {
    if (!rows.length) return [];
    const positions: Array<Record<string, any>> = [];
    const isSectionHeader = (row: string[]) =>
      row.length === 1 || (row[0].trim() && !row.slice(1).some((cell) => cell.trim()));
    for (let i = 0; i < rows.length - 1; i += 1) {
      const sectionName = (rows[i][0] || "").trim();
      const headerRow = rows[i + 1];
      if (!headerRow) continue;
      const header = headerRow.map((cell) => normalizeHeader(cell));
      if (!header.includes("symbol") || !header.includes("qty")) continue;
      if (!header.includes("mark") && !header.includes("last") && !header.includes("trade_price") && !header.includes("price")) {
        continue;
      }

      const symbolIdx = header.indexOf("symbol");
      const descIdx = header.indexOf("description");
      const qtyIdx = header.indexOf("qty");
      const tradeIdx = header.indexOf("trade_price");
      const markIdx = header.indexOf("mark");
      const lastIdx = header.indexOf("last");
      const priceIdx = header.indexOf("price");
      const underlyingIdx = header.indexOf("underlying") >= 0 ? header.indexOf("underlying") : header.indexOf("root");
      const expiryIdx = header.indexOf("expiry") >= 0 ? header.indexOf("expiry") : header.indexOf("expiration_date");
      const strikeIdx = header.indexOf("strike") >= 0 ? header.indexOf("strike") : header.indexOf("strike_price");
      const rightIdx = header.indexOf("option_type") >= 0 ? header.indexOf("option_type") : header.indexOf("put_call");
      let assetClass = "EQUITY";
      const sectionUpper = sectionName.toUpperCase();
      const isPositionSection = ["EQUITIES", "OPTIONS", "FUTURES", "FOREX", "CRYPTO", "POSITIONS"].some((label) =>
        sectionUpper.includes(label)
      );
      if (!isPositionSection) continue;
      if (sectionUpper.includes("OPTION")) assetClass = "OPTION";
      if (sectionUpper.includes("FUTURE")) assetClass = "FUTURE";
      if (sectionUpper.includes("FOREX")) assetClass = "FOREX";

      for (let j = i + 2; j < rows.length; j += 1) {
        const row = rows[j];
        if (!row || row.every((cell) => cell.trim() === "")) break;
        if (isSectionHeader(row)) break;
        const second = (row[1] || "").trim();
        if (/total/i.test(second)) break;

        const rawSymbol = (row[symbolIdx] || "").trim();
        if (!rawSymbol) continue;
        const desc = descIdx >= 0 ? (row[descIdx] || "").trim() : "";
        const qty = parseNumber(row[qtyIdx] || "");
        if (!Number.isFinite(qty) || qty === 0) continue;
        const tradePrice = tradeIdx >= 0 ? parseNumber(row[tradeIdx] || "") : NaN;
        const mark = markIdx >= 0 ? parseNumber(row[markIdx] || "") : NaN;
        const last = lastIdx >= 0 ? parseNumber(row[lastIdx] || "") : NaN;
        const directPrice = priceIdx >= 0 ? parseNumber(row[priceIdx] || "") : NaN;
        const candidates = [mark, last, directPrice, tradePrice].filter((v) => Number.isFinite(v) && v > 0);
        const price = candidates.length ? candidates[0] : 0;
        const avgCost = Number.isFinite(tradePrice) && tradePrice > 0 ? tradePrice : price > 0 ? price : undefined;

        let symbol = rawSymbol.replace(/\s+/g, "").toUpperCase();
        let underlying = "";
        let expiry = "";
        let strike: number | null = null;
        let optionType = "";
        const parsedSymbol = parseOsiSymbol(symbol);
        if (parsedSymbol) {
          underlying = parsedSymbol.underlying;
          expiry = parsedSymbol.expiry;
          strike = parsedSymbol.strike;
          optionType = parsedSymbol.option_type;
          assetClass = "OPTION";
        } else {
          const rawUnderlying = underlyingIdx >= 0 ? (row[underlyingIdx] || "").trim() : "";
          const rawExpiry = expiryIdx >= 0 ? (row[expiryIdx] || "").trim() : "";
          const rawStrike = strikeIdx >= 0 ? (row[strikeIdx] || "").trim() : "";
          const rawRight = rightIdx >= 0 ? (row[rightIdx] || "").trim() : "";
          if (rawUnderlying && rawExpiry && rawStrike && rawRight) {
            const normalizedExpiry = normalizeExpiryInput(rawExpiry);
            const parsedStrike = parseNumber(rawStrike);
            const right = rawRight.toUpperCase().startsWith("P") ? "P" : "C";
            if (normalizedExpiry && Number.isFinite(parsedStrike)) {
              const built = buildOsiSymbol(rawUnderlying, normalizedExpiry, right, Number(parsedStrike));
              if (built) {
                symbol = built;
                underlying = rawUnderlying.toUpperCase();
                expiry = normalizedExpiry;
                strike = Number(parsedStrike);
                optionType = right === "P" ? "PUT" : "CALL";
                assetClass = "OPTION";
              }
            }
          }
          const rowText = row.filter((cell) => (cell || "").trim()).join(" ");
          let parsedDesc = parseOptionDescription(desc, rawUnderlying || symbol || rawSymbol);
          if (!parsedDesc && rawSymbol) {
            parsedDesc = parseOptionDescription(rawSymbol, rawUnderlying || symbol || rawSymbol);
          }
          if (!parsedDesc && rowText) {
            parsedDesc = parseOptionDescription(rowText, rawUnderlying || symbol || rawSymbol);
          }
          if (parsedDesc) {
            symbol = parsedDesc.symbol;
            underlying = parsedDesc.underlying;
            expiry = parsedDesc.expiry;
            strike = parsedDesc.strike;
            optionType = parsedDesc.option_type;
            assetClass = "OPTION";
          }
        }

        positions.push({
          symbol,
          qty,
          price,
          avg_cost: avgCost,
          asset_class: assetClass,
          underlying: underlying || undefined,
          expiry: expiry || undefined,
          strike: strike ?? undefined,
          option_type: optionType || undefined,
        });
      }
    }
    return positions;
  };

  const importCsvFile = async (file: File) => {
    setCsvError("");
    const text = await file.text();
    const rawRows = parseCsvRows(text);
    if (!rawRows.length) {
      setCsvError("CSV file is empty.");
      return;
    }
    const headerRow = rawRows[0].map((cell) => stripBom(cell || "").toLowerCase().trim());
    const isTransactionsCsv =
      headerRow.includes("action") &&
      headerRow.includes("amount") &&
      headerRow.includes("quantity") &&
      headerRow.some((cell) => cell.includes("fees"));
    const firstRows = rawRows.slice(0, 20).map((row) => {
      // Join all cells in the row to search anywhere
      return row.map(cell => stripBom(cell || "").toLowerCase()).join(" ");
    });
    const isBalancesReport =
      firstRows.some((rowText) => rowText.includes("balances for all-accounts") || rowText.includes("balances for all accounts")) ||
      firstRows.some((rowText) => rowText.includes("total accounts value") && rowText.includes("cash & cash investments total"));
    const isAccountStatement = firstRows.some((rowText) => rowText.includes("account statement"));
    const isPositionsReport = firstRows.some(
      (rowText) => rowText.includes("positions for") || rowText.includes("custaccs")
    );
    if (isBalancesReport) {
      try {
        setToast("Importing balances CSV...");
        const form = new FormData();
        form.append("file", file);
        const resp = await api.post("/admin/import-balances", form, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120000,
        });
        const updated = resp.data?.accounts_updated ?? 0;
        fetchAccounts();
        refreshAll();
        notify(`Imported balances for ${updated} accounts.`);
        return;
      } catch (err: any) {
        const detail = err?.response?.data?.detail ?? err?.message ?? "CSV import failed";
        setCsvError(detail);
        setToast(detail);
        return;
      }
    }
    if (isPositionsReport) {
      const account = requireAccount("import positions CSV", setCsvError);
      if (!account) return;
      try {
        setToast("Importing positions CSV...");
        const form = new FormData();
        form.append("file", file);
        const resp = await api.post(`/admin/import-positions?account=${encodeURIComponent(account)}`, form, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120000,
        });
        const count = resp.data?.positions_count ?? resp.data?.count ?? 0;
        fetchAccounts();
        refreshAll();
        fetchNav(navLimit);
        notify(`Imported positions from Schwab CSV (${count} rows).`);
        return;
      } catch (err: any) {
        const detail = err?.response?.data?.detail ?? err?.message ?? "CSV import failed";
        setCsvError(detail);
        setToast(detail);
        return;
      }
    }
    if (isTransactionsCsv) {
      const account = requireAccount("import transactions CSV", setCsvError);
      if (!account) return;
      try {
        setToast("Importing transactions CSV...");
        const form = new FormData();
        form.append("file", file);
        const resp = await api.post(`/admin/import-transactions?account=${encodeURIComponent(account)}`, form, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120000,
        });
        const count = resp.data?.trades_created ?? 0;
        fetchAccounts();
        refreshAll();
        fetchNav(navLimit);
        try {
          const benchResp = await api.get("/admin/benchmark");
          const value = benchResp.data?.bench_start;
          if (value) setBenchStart(value);
        } catch {
          // ignore
        }
        notify(`Imported transactions (${count} trades).`);
        return;
      } catch (err: any) {
        const detail = err?.response?.data?.detail ?? err?.message ?? "CSV import failed";
        setCsvError(detail);
        setToast(detail);
        return;
      }
    }
    if (isAccountStatement) {
      const account = requireAccount("import positions from account statement", setCsvError);
      if (!account) return;
      const statementPositions = parseAccountStatementPositions(rawRows);
      const filtered = statementPositions.filter(
        (row) => row.symbol && Number.isFinite(row.qty) && row.qty !== 0
      );
      if (!filtered.length) {
        setCsvError("Account statement positions not found.");
        return;
      }
      try {
        await api.post("/positions/bulk", { positions: filtered, account });
        fetchAccounts();
        refreshAll();
        notify(`Imported ${filtered.length} positions.`);
        return;
      } catch (err: any) {
        setCsvError(err?.response?.data?.detail ?? "CSV import failed");
        return;
      }
    }
    const rows = parseCsv(text);
    if (!rows.length) {
      setCsvError("CSV file is empty.");
      return;
    }
    const aliasMap: Record<string, string[]> = {
      instrument_id: ["instrument_id", "instrumentid", "id"],
      symbol: ["symbol", "sym", "ticker", "instrument", "instrument_symbol", "option_symbol", "security", "description"],
      qty: ["qty", "quantity", "position", "pos", "position_qty", "net_qty", "net_quantity", "units", "size"],
      price: ["price", "mark", "last", "last_price", "mark_price", "market_price", "current_price"],
      avg_cost: ["avg_cost", "avg", "average_price", "avg_price", "trade_price", "entry_price", "cost", "cost_basis", "basis"],
      entry_date: ["entry_date", "entrydate", "open_date", "opendate", "opened", "date_opened", "opened_on"],
      asset_class: ["asset_class", "asset", "type", "instrument_type", "security_type", "product_type"],
      underlying: ["underlying", "underlier", "root", "root_symbol", "underlying_symbol"],
      expiry: ["expiry", "exp", "expiration", "expiration_date", "exp_date"],
      strike: ["strike", "strike_price"],
      option_type: ["option_type", "right", "put_call", "call_put", "cp", "p_c"],
      multiplier: ["multiplier", "contract_multiplier", "mult"],
      sector: ["sector", "industry"],
      strategy: ["strategy", "strategy_name", "book", "portfolio"],
      side: ["side", "direction", "long_short", "longshort"],
    };

    const normalizedRows = rows.map((raw) => {
      const normalized: Record<string, string> = {};
      Object.keys(raw).forEach((key) => {
        normalized[normalizeHeader(key)] = raw[key];
      });
      const pick = (key: keyof typeof aliasMap) => {
        for (const alias of aliasMap[key]) {
          const val = normalized[normalizeHeader(alias)];
          if (val != null && val !== "") return val;
        }
        return "";
      };
      return { raw, normalized, pick };
    });

    const positionsPayload = normalizedRows.map(({ pick }) => {
      const rawSymbol = pick("symbol");
      const parsedDesc = parseOptionDescription(rawSymbol, pick("underlying"));
      const cleanedSymbol = rawSymbol.replace(/\s+/g, "").toUpperCase();
      const parsedSymbol = parseOsiSymbol(cleanedSymbol);
      const underlying = (pick("underlying") || parsedDesc?.underlying || parsedSymbol?.underlying || "").toUpperCase();
      const expiry = pick("expiry") || parsedDesc?.expiry || parsedSymbol?.expiry || "";
      const strikeRaw = pick("strike");
      const strike =
        Number.isFinite(parseNumber(strikeRaw)) && strikeRaw !== ""
          ? Number(parseNumber(strikeRaw))
          : parsedDesc?.strike ?? parsedSymbol?.strike ?? null;
      const rightRaw = (pick("option_type") || parsedDesc?.option_type || parsedSymbol?.option_type || "").toUpperCase();
      const right =
        rightRaw.startsWith("P") ? "PUT" : rightRaw.startsWith("C") ? "CALL" : rightRaw;
      const sideRaw = (pick("side") || "").toUpperCase();

      let symbol = cleanedSymbol;
      if (!parsedSymbol && parsedDesc?.symbol) {
        symbol = parsedDesc.symbol;
      } else if (!parsedSymbol && underlying && expiry && strike && right) {
        const built = buildOsiSymbol(underlying, normalizeExpiryInput(expiry), right.startsWith("P") ? "P" : "C", strike);
        if (built) symbol = built;
      }
      const assetClassRaw = (pick("asset_class") || "").toUpperCase();
      const isOption =
        !!parseOsiSymbol(symbol) ||
        right.startsWith("P") ||
        right.startsWith("C") ||
        assetClassRaw.includes("OPT") ||
        assetClassRaw.includes("CALL") ||
        assetClassRaw.includes("PUT");
      const isFuture =
        assetClassRaw.includes("FUT") ||
        assetClassRaw.includes("FUTURE") ||
        isFutureSymbol(symbol);

      const qtyRaw = parseNumber(pick("qty"));
      let qty = Number.isFinite(qtyRaw) ? qtyRaw : 0;
      if (qty !== 0 && sideRaw) {
        if (sideRaw.includes("SHORT") || sideRaw.includes("SELL")) qty = -Math.abs(qty);
        if (sideRaw.includes("LONG") || sideRaw.includes("BUY")) qty = Math.abs(qty);
      }

      const priceRaw = parseNumber(pick("price"));
      const avgRaw = parseNumber(pick("avg_cost"));
      const price =
        Number.isFinite(priceRaw) ? priceRaw : Number.isFinite(avgRaw) ? avgRaw : 0;
      const avg_cost = Number.isFinite(avgRaw) ? avgRaw : Number.isFinite(priceRaw) ? priceRaw : undefined;
      const entryDateRaw = normalizeExpiryInput(pick("entry_date"));
      const entry_date = /^\d{4}-\d{2}-\d{2}$/.test(entryDateRaw) ? entryDateRaw : undefined;

      return {
        instrument_id: pick("instrument_id") || undefined,
        symbol: symbol.toUpperCase(),
        qty,
        price,
        avg_cost,
        asset_class: (pick("asset_class") || (isOption ? "OPTION" : isFuture ? "FUTURE" : "EQUITY")).toUpperCase(),
        underlying: underlying ? underlying.toUpperCase() : undefined,
        expiry: expiry || undefined,
        strike: strike ?? undefined,
        option_type: right ? right.toUpperCase() : undefined,
        multiplier: pick("multiplier") ? Number(parseNumber(pick("multiplier"))) : undefined,
        entry_date,
        sector: pick("sector") || undefined,
        strategy: pick("strategy") || undefined,
      };
    });

    const filtered = positionsPayload.filter((row) => row.symbol && Number.isFinite(row.qty) && row.qty !== 0);
    if (!filtered.length) {
      setCsvError("CSV requires symbol and qty.");
      return;
    }
    try {
      const account = requireAccount("import positions CSV", setCsvError);
      if (!account) return;
      await api.post("/positions/bulk", { positions: filtered, account });
      refreshAll();
      notify(`Imported ${filtered.length} positions.`);
    } catch (err: any) {
      setCsvError(err?.response?.data?.detail ?? "CSV import failed");
    }
  };

  const importNavText = async () => {
    setNavPasteError("");
    const account = requireAccount("import NAV history", setNavPasteError);
    if (!account) return;
    if (!navPasteText.trim()) {
      const msg = "Paste NAV lines first.";
      setNavPasteError(msg);
      notify(msg);
      return;
    }
    try {
      setToast("Importing NAV history...");
      const resp = await api.post("/admin/import-nav-text", {
        account,
        text: navPasteText,
        append: false,
      });
      fetchAccounts();
      refreshAll();
      fetchNav(navLimit);
      const count = resp.data?.count ?? 0;
      notify(`Imported NAV history (${count} rows).`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.message ?? "NAV import failed";
      setNavPasteError(detail);
      setToast(detail);
    }
  };

  const importBenchText = async () => {
    setBenchPasteError("");
    if (!benchPasteText.trim()) {
      const msg = "Paste benchmark lines first.";
      setBenchPasteError(msg);
      notify(msg);
      return;
    }
    try {
      setToast("Importing benchmark history...");
      const resp = await api.post("/admin/import-benchmark-text", {
        text: benchPasteText,
        append: false,
      });
      refreshAll();
      fetchNav(navLimit);
      const count = resp.data?.count ?? 0;
      notify(`Imported benchmark history (${count} rows).`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.message ?? "Benchmark import failed";
      setBenchPasteError(detail);
      setToast(detail);
    }
  };

  useEffect(() => {
    if (!tradePosition) {
      setTradeAssetClass("EQUITY");
      setTradeExpiry("");
      setTradeStrike("");
      setTradeOptionType("CALL");
      setTradeSector(sectorOptions[0]);
      return;
    }
    setTradeAssetClass((tradePosition.asset_class ?? "equity").toUpperCase());
    setTradeExpiry(tradePosition.expiry ?? "");
    setTradeStrike(tradePosition.strike ? String(tradePosition.strike) : "");
    setTradeOptionType((tradePosition.option_type ?? "CALL").toUpperCase());
    if (tradePosition.sector) {
      setTradeSector(tradePosition.sector);
    }
  }, [tradePosition]);

  useEffect(() => {
    if (!tradeSymbolTouched) {
      setTradeSymbol(currentSymbol);
    }
  }, [currentSymbol, tradeSymbolTouched]);

  useEffect(() => {
    if (tradeLegs.length) {
      setTradeAssetClass("OPTION");
    }
  }, [tradeLegs.length]);

  useEffect(() => {
    if (tradeAssetClass !== "OPTION") {
      if (tradeLegs.length) setTradeLegs([]);
      return;
    }
    if (!tradeLegs.length) {
      setTradeLegs([
        {
          id: "leg-1",
          symbol: "",
          underlying: tradeSymbol || "",
          expiry: tradeExpiry || "",
          right: tradeOptionType.startsWith("P") ? "P" : "C",
          strike: tradeStrike || "",
          side: tradeSide || "BUY",
          qty: tradeQty || "",
          price: "",
        },
      ]);
    }
  }, [tradeAssetClass, tradeLegs.length, tradeSymbol, tradeExpiry, tradeOptionType, tradeStrike, tradeSide, tradeQty]);

  const watchlistSymbolsEffective = useMemo(() => {
    if (watchlistSymbols.length) return watchlistSymbols;
    if (positions.length)
      return positions
        .map((row) => {
          const asset = String(row.asset_class || "").toLowerCase();
          if (asset === "option" && row.underlying) return String(row.underlying).toUpperCase();
          return row.symbol;
        })
        .filter(Boolean);
    return [];
  }, [watchlistSymbols, positions]);

  const watchlistRows = useMemo(() => {
    if (!watchlistSymbolsEffective.length) return [];
    const posMap = new Map(positions.map((row) => [row.symbol, row]));
    return watchlistSymbolsEffective.map((symbol) => {
      const quote = quotes[symbol];
      const pos = posMap.get(symbol);
      const last = quote ? (quote.bid + quote.ask) / 2 : safeNumber(pos?.price);
      const dayPct = safeNumber(pos?.day_pnl_pct);
      const change = last * (dayPct / 100);
      return {
        symbol,
        last: formatNumber(last),
        chg: formatSignedNumber(change),
        pct: formatSignedPct(dayPct),
        rawPct: dayPct,
      };
    });
  }, [positions, quotes, watchlistSymbolsEffective]);

  const streamSymbols = useMemo(() => {
    const symbols = new Set<string>();
    positions.forEach((row) => {
      const asset = String(row.asset_class || "").toLowerCase();
      const isOption = asset === "option" || (row.symbol && parseOsiSymbol(String(row.symbol)));
      if (isOption) {
        if (row.underlying) symbols.add(String(row.underlying).toUpperCase());
      } else if (row.symbol) {
        symbols.add(String(row.symbol).toUpperCase());
      }
    });
    watchlistSymbolsEffective.forEach((sym) => {
      const upper = sym.toUpperCase();
      if (!parseOsiSymbol(upper)) symbols.add(upper);
    });
    if (currentSymbol && !parseOsiSymbol(currentSymbol)) symbols.add(currentSymbol.toUpperCase());
    if (tradeSymbol && !parseOsiSymbol(tradeSymbol)) symbols.add(tradeSymbol.toUpperCase());
    return Array.from(symbols);
  }, [positions, watchlistSymbolsEffective, currentSymbol, tradeSymbol]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === "arrowup" || key === "arrowdown") {
        if (tab === "Monitor") {
          event.preventDefault();
          if (activeTable === "watchlist") {
            setSelectedWatchIndex((prev) => {
              const max = watchlistRows.length - 1;
              const next = key === "arrowdown" ? Math.min(prev + 1, max) : Math.max(prev - 1, 0);
              const symbol = watchlistRows[next]?.symbol;
              if (symbol) setCurrentSymbol(symbol);
              return next;
            });
          } else if (activeTable === "positions") {
            setSelectedPosIndex((prev) => {
              const max = positionsDisplay.length - 1;
              const next = key === "arrowdown" ? Math.min(prev + 1, max) : Math.max(prev - 1, 0);
              const row: any = positionsDisplay[next];
              const asset = String(row?.asset_class || "").toLowerCase();
              const symbol =
                row?.isStrategySummary && row?.underlying
                  ? row.underlying
                  : asset === "option" && row?.underlying
                    ? row.underlying
                    : row?.symbol;
              if (symbol) setCurrentSymbol(symbol);
              return next;
            });
          }
        }
      }
      if (key === "/") {
        event.preventDefault();
        document.getElementById("symbol-input")?.focus();
      }
      if (key === "m") setTab("Monitor");
      if (key === "t" && !staticMode) setTab("Trade");
      if (key === "a") setTab("Analyze");
      if (key === "r") setTab("Risk");
      if (key === "y") setTab("Activity");
      if (key === "d") setTab("Admin");
      if (key === "f") {
        if (tab === "Monitor" && showChart) {
          event.preventDefault();
          setChartFull((prev) => !prev);
        }
      }
      if (key === "escape") {
        if (chartFull) {
          event.preventDefault();
          setChartFull(false);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tab, activeTable, watchlistRows, positionsDisplay]);

  useEffect(() => {
    if (staticMode) return;
    if (marketStatus.source !== "polygon" || !marketStatus.ok) return;
    connectMarketStream(streamSymbols);
  }, [connectMarketStream, streamSymbols.join("|"), marketStatus.source, marketStatus.ok, staticMode]);

  useEffect(() => {
    if (staticMode) return;
    if (marketStatus.source === "demo" || !marketStatus.ok) return;
    if (marketConnected) return;
    let timer: number | null = null;
    const poll = () => fetchQuotes(streamSymbols);
    poll();
    timer = window.setInterval(poll, 15000);
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [marketConnected, streamSymbols.join("|"), marketStatus.source, marketStatus.ok, fetchQuotes, staticMode]);

  useEffect(() => {
    if (selectedWatchIndex >= watchlistRows.length) {
      setSelectedWatchIndex(0);
    }
    const symbol = watchlistRows[selectedWatchIndex]?.symbol;
    if (symbol) setCurrentSymbol(symbol);
  }, [watchlistRows, selectedWatchIndex]);

  useEffect(() => {
    if (selectedPosIndex >= positionsDisplay.length) {
      setSelectedPosIndex(0);
    }
  }, [positionsDisplay, selectedPosIndex]);

  const qtyNum = Number(tradeQty);
  const limitNum = Number(tradeLimit);
  const priceForTrade = Number.isFinite(limitNum) ? limitNum : 0;

  const hasLegInput = (leg: typeof tradeLegs[number]) => {
    const anyField =
      leg.symbol.trim() ||
      leg.underlying.trim() ||
      leg.expiry.trim() ||
      leg.right.trim() ||
      leg.strike.trim() ||
      leg.qty.trim();
    return Boolean(anyField);
  };

  const filledLegs = tradeLegs.filter((leg) => hasLegInput(leg));
  const legsHaveData = filledLegs.length > 0;

  const buildOptionLegsForSubmit = () => {
    if (tradeAssetClass !== "OPTION") return [];
    return filledLegs;
  };

  const normalizeLeg = (leg: typeof tradeLegs[number], allowMissingPrice = false) => {
    const qty = Number(leg.qty);
    const price = Number(leg.price);
    const side = (leg.side || "").toUpperCase();
    if (!["BUY", "SELL"].includes(side)) throw new Error("Each leg needs BUY or SELL.");
    if (!qty || qty <= 0) throw new Error("Each leg needs a qty > 0.");
    if ((!price || price <= 0) && !allowMissingPrice) {
      throw new Error("Each leg needs a limit price > 0 (or Fetch Marks).");
    }
    const rawSymbol = leg.symbol.trim().toUpperCase();
    if (rawSymbol) {
      const parsed = parseOsiSymbol(rawSymbol);
      if (!parsed) throw new Error(`Invalid OSI symbol: ${rawSymbol}`);
      return {
        id: leg.id,
        symbol: rawSymbol,
        side,
        qty,
        price: price || 0,
        underlying: parsed.underlying,
        expiry: parsed.expiry,
        option_type: parsed.option_type,
        strike: parsed.strike,
      };
    }
    const underlying = leg.underlying.trim().toUpperCase();
    const expiry = normalizeExpiryInput(leg.expiry.trim());
    const rightRaw = leg.right.trim().toUpperCase();
    const right = rightRaw.startsWith("P") ? "P" : rightRaw.startsWith("C") ? "C" : rightRaw;
    const strike = Number(leg.strike);
    if (!underlying || !expiry || !right || !strike) {
      throw new Error("Each leg needs underlying, expiry, right, and strike (or an OSI symbol).");
    }
    const symbol = buildOsiSymbol(underlying, expiry, right, strike);
    if (!symbol) {
      throw new Error("Could not build OSI symbol for a leg. Check expiry/right/strike.");
    }
    return {
      id: leg.id,
      symbol,
      side,
      qty,
      price: price || 0,
      underlying,
      expiry,
      option_type: right === "P" ? "PUT" : "CALL",
      strike,
    };
  };

  const calcNetFromLegs = (legs: { qty: number; price: number; side: string }[]) => {
    let cash = 0;
    legs.forEach((leg) => {
      const side = leg.side.toUpperCase() === "SELL" ? 1 : -1;
      cash += leg.qty * leg.price * 100 * side;
    });
    const units = Math.min(...legs.map((l) => Math.abs(l.qty)).filter((v) => v > 0)) || 1;
    const net = units ? cash / (units * 100) : 0;
    return { net, units, cash };
  };

  const fetchMarksMap = async (symbols: string[]) => {
    if (!symbols.length) return {};
    const resp = await api.get(`/market/option-marks?symbols=${encodeURIComponent(symbols.join(","))}`);
    return resp.data || {};
  };

  const resolveLegPrices = async (
    legs: ReturnType<typeof normalizeLeg>[],
    netLimit: number | null,
    applyNetLimit: boolean
  ) => {
    const missing = legs.filter((leg) => !leg.price || leg.price <= 0).map((leg) => leg.symbol);
    let marks: Record<string, number> = {};
    if (missing.length) {
      try {
        marks = await fetchMarksMap(missing);
      } catch {
        marks = {};
      }
    }
    const filled = legs.map((leg) => ({
      ...leg,
      price: leg.price > 0 ? leg.price : Number(marks[leg.symbol]) || 0,
    }));
    if (!applyNetLimit || netLimit == null || !Number.isFinite(netLimit) || netLimit === 0) {
      return filled;
    }
    const target = Math.abs(netLimit);
    const { net } = calcNetFromLegs(filled);
    if (Math.abs(net) > 1e-9) {
      const scale = target / Math.abs(net);
      return filled.map((leg) => ({ ...leg, price: Math.abs(leg.price) * scale }));
    }
    const perLeg = target / filled.length;
    const seeded = filled.map((leg) => ({ ...leg, price: perLeg }));
    const { net: seededNet } = calcNetFromLegs(seeded);
    if (Math.abs(seededNet) > 1e-9) {
      const scale = target / Math.abs(seededNet);
      return seeded.map((leg) => ({ ...leg, price: leg.price * scale }));
    }
    return seeded;
  };

  const validateLegInputs = (legs: typeof tradeLegs) => {
    if (!legs.length) return { ok: false, message: "Add at least one leg." };
    for (const leg of legs) {
      const side = (leg.side || "").toUpperCase();
      if (!["BUY", "SELL"].includes(side)) return { ok: false, message: "Each leg needs BUY or SELL." };
      const qty = Number(leg.qty);
      if (!Number.isFinite(qty) || qty <= 0) return { ok: false, message: "Each leg needs a qty > 0." };
      const rawSymbol = leg.symbol.trim().toUpperCase();
      if (rawSymbol) {
        const parsed = parseOsiSymbol(rawSymbol);
        if (!parsed) return { ok: false, message: `Invalid OSI symbol: ${rawSymbol}` };
        continue;
      }
      const underlying = leg.underlying.trim().toUpperCase();
      const expiry = normalizeExpiryInput(leg.expiry.trim());
      const rightRaw = leg.right.trim().toUpperCase();
      const right = rightRaw.startsWith("P") ? "P" : rightRaw.startsWith("C") ? "C" : rightRaw;
      const strike = Number(leg.strike);
      if (!underlying || !expiry || !right || !Number.isFinite(strike) || strike <= 0) {
        return { ok: false, message: "Each leg needs underlying, expiry, right, and strike." };
      }
    }
    return { ok: true, message: "" };
  };

  const optionLegsRaw = buildOptionLegsForSubmit();
  const optionLegCheck = validateLegInputs(optionLegsRaw);
  const optionLegsKey = useMemo(
    () =>
      optionLegsRaw
        .map(
          (leg) =>
            `${leg.symbol}|${leg.underlying}|${leg.expiry}|${leg.right}|${leg.strike}|${leg.side}|${leg.qty}`
        )
        .join("|"),
    [optionLegsRaw]
  );

  const canSubmit =
    tradeAssetClass === "OPTION"
      ? optionLegsRaw.length > 0 && optionLegCheck.ok && Number.isFinite(Number(tradeLimit)) && Number(tradeLimit) !== 0
      : qtyNum > 0 && Number.isFinite(priceForTrade) && priceForTrade > 0 && !!tradeSymbol;

  const runPreview = async () => {
    if (tradeAssetClass === "OPTION") {
      try {
        if (!optionLegsRaw.length) {
          setPreviewText("Leg preview failed: add at least one leg.");
          return;
        }
        if (!optionLegCheck.ok) {
          setPreviewText(`Leg preview failed: ${optionLegCheck.message}`);
          return;
        }
        const legs = optionLegsRaw.map((leg) => normalizeLeg(leg, true));
        const netLimit = Number.isFinite(Number(tradeLimit)) ? Number(tradeLimit) : null;
        const priced = await resolveLegPrices(legs, netLimit, false);
        const { net } = calcNetFromLegs(priced);
        const displayNet = netLimit != null && netLimit !== 0 ? netLimit : net;
        setOptionPreview({ net: displayNet, legs: legs.length });
        setPreviewText(`Legs preview · ${legs.length} legs · Net ${formatSignedMoney(displayNet)}`);
        return;
      } catch (err: any) {
        setPreviewText(`Leg preview failed: ${err?.message ?? "error"}`);
        return;
      }
    }
    setOptionPreview(null);
    if (!canSubmit) {
      setPreviewText("Preview failed: invalid quantity or price.");
      return;
    }
    try {
      const account = requireAccount("preview trades");
      if (!account) return;
      const resp = await api.post("/trade/preview", {
        account,
        symbol: tradeSymbol,
        instrument_id: tradePosition?.instrument_id ?? null,
        side: tradeSide,
        qty: qtyNum,
        price: priceForTrade,
        trade_date: tradeDate,
        sector: tradeSector,
        trade_type: "LIMIT",
        order_type: "LIMIT",
        asset_class: tradeAssetClass,
        expiry: tradeExpiry || tradePosition?.expiry || null,
        strike: tradeStrike ? Number(tradeStrike) : tradePosition?.strike ?? null,
        option_type: tradeOptionType || tradePosition?.option_type || null,
        multiplier: tradeAssetClass === "OPTION" ? 100 : 1,
      });
      const cashImpact = resp.data.cash_impact ?? 0;
      const netImpact = resp.data.net_exposure_impact ?? 0;
      setPreviewText(
        `Preview: ${tradeSide} ${qtyNum} ${tradeSymbol} @ ${tradeType} | Cash ${formatSignedMoney(
          cashImpact
        )} | Net ${formatSignedMoney(netImpact)}`
      );
    } catch (err: any) {
      setPreviewText(`Preview failed: ${err?.message ?? "error"}`);
    }
  };

  const runLegsPreview = () => {
    runPreview();
  };

  const submitTrade = async () => {
    if (tradeAssetClass === "OPTION") {
      await submitLegs();
      return;
    }
    if (!canSubmit) {
      setPreviewText("Submit blocked: invalid quantity or price.");
      return;
    }
    try {
      const account = requireAccount("submit trades");
      if (!account) return;
      await api.post("/trade/submit", {
        account,
        symbol: tradeSymbol,
        instrument_id: tradePosition?.instrument_id ?? null,
        side: tradeSide,
        qty: qtyNum,
        price: priceForTrade,
        trade_date: tradeDate,
        sector: tradeSector,
        trade_type: "LIMIT",
        order_type: "LIMIT",
        asset_class: tradeAssetClass,
        expiry: tradeExpiry || tradePosition?.expiry || null,
        strike: tradeStrike ? Number(tradeStrike) : tradePosition?.strike ?? null,
        option_type: tradeOptionType || tradePosition?.option_type || null,
        multiplier: tradeAssetClass === "OPTION" ? 100 : 1,
      });
      setPreviewText("Trade recorded.");
      refreshAll();
    } catch (err: any) {
      setPreviewText(`Submit failed: ${err?.message ?? "error"}`);
    }
  };

  const submitLegs = async () => {
    const rows = optionLegsRaw;
    if (!rows.length) {
      setPreviewText("Submit blocked: add at least one leg.");
      return;
    }
    if (!optionLegCheck.ok) {
      setPreviewText(optionLegCheck.message);
      return;
    }
    try {
      const account = requireAccount("submit option trades");
      if (!account) return;
      const netLimit = Number.isFinite(Number(tradeLimit)) ? Number(tradeLimit) : null;
      if (netLimit == null || netLimit === 0) {
        setPreviewText("Submit blocked: enter a net limit price.");
        return;
      }
      const legs = await resolveLegPrices(rows.map((leg) => normalizeLeg(leg, true)), netLimit, true);
      const netBySymbol = new Map<string, number>();
      legs.forEach((leg) => {
        const delta = leg.side.toUpperCase() === "SELL" ? -leg.qty : leg.qty;
        netBySymbol.set(leg.symbol, (netBySymbol.get(leg.symbol) || 0) + delta);
      });
      const uniqueSymbols = Array.from(netBySymbol.keys());
      const allZero = uniqueSymbols.length > 0 && uniqueSymbols.every((sym) => Math.abs(netBySymbol.get(sym) || 0) < 1e-6);
      if (allZero) {
        setPreviewText("Submit blocked: legs net to zero. Check strikes/sides; no position would remain.");
        return;
      }
      const strategyId = `STRAT-${Date.now().toString(36).toUpperCase()}`;
      const baseSymbol = legs[0]?.underlying || tradeSymbol;
      const strategyName = baseSymbol ? `${baseSymbol} Multi-Leg` : "Multi-Leg Strategy";
      await api.post("/trade/submit-multi", {
        strategy_id: strategyId,
        strategy_name: strategyName,
        legs: legs.map((leg) => ({
          account,
          symbol: leg.symbol,
          side: leg.side,
          qty: leg.qty,
          price: leg.price,
          trade_date: tradeDate,
          sector: tradeSector,
          trade_type: "LIMIT",
          order_type: "LIMIT",
          asset_class: "OPTION",
          underlying: leg.underlying,
          expiry: leg.expiry,
          strike: leg.strike,
          option_type: leg.option_type,
          multiplier: 100,
          instrument_id: `${leg.symbol}:OPTION`,
        })),
      });
      setPreviewText(`Option legs recorded (${legs.length}).`);
      if (optionLegsRaw.length) setTradeLegs([]);
      setOptionPreview(null);
      refreshAll();
    } catch (err: any) {
      setPreviewText(`Leg submit failed: ${err?.message ?? "error"}`);
    }
  };

  const fetchLegMarks = async () => {
    const legs = optionLegsRaw.map((leg) => {
      const rawSymbol = leg.symbol.trim().toUpperCase();
      if (rawSymbol && parseOsiSymbol(rawSymbol)) return { ...leg, symbol: rawSymbol };
      const expiry = normalizeExpiryInput(leg.expiry.trim());
      const strikeNum = Number(leg.strike);
      const right = leg.right.trim().toUpperCase().startsWith("P") ? "P" : "C";
      const symbol = buildOsiSymbol(leg.underlying, expiry, right, strikeNum);
      return symbol ? { ...leg, symbol } : leg;
    });
    const symbols = legs.map((leg) => leg.symbol.trim().toUpperCase()).filter(Boolean);
    if (!symbols.length) {
      notify("Add leg details before fetching marks.");
      return;
    }
    try {
      const resp = await api.get(`/market/option-marks?symbols=${encodeURIComponent(symbols.join(","))}`);
      const marks = resp.data || {};
      setTradeLegs((prev) =>
        prev.map((leg) => {
          const strikeNum = Number(leg.strike);
          const expiry = normalizeExpiryInput(leg.expiry.trim());
          const right = leg.right.trim().toUpperCase().startsWith("P") ? "P" : "C";
          const symbol = leg.symbol.trim().toUpperCase() || buildOsiSymbol(leg.underlying, expiry, right, strikeNum);
          const mark = marks[symbol];
          if (mark) {
            return { ...leg, symbol, price: String(mark) };
          }
          return symbol ? { ...leg, symbol } : leg;
        })
      );
      notify("Option marks loaded.");
    } catch (err: any) {
      notify(err?.response?.data?.detail ?? "Option marks unavailable");
    }
  };

  useEffect(() => {
    if (tradeAssetClass !== "OPTION") return;
    if (!optionLegsRaw.length || !optionLegCheck.ok) return;
    const timer = window.setTimeout(() => {
      fetchLegMarks();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [tradeAssetClass, optionLegsKey, optionLegCheck.ok]);

  const startSchwabAuth = async () => {
    try {
      const resp = await api.get("/auth/schwab/start");
      const url = resp.data.auth_url;
      if (url) window.open(url, "_blank", "width=540,height=720");
    } catch (err: any) {
      notify(err?.response?.data?.detail ?? "Schwab auth failed");
    }
  };

  const openAuthModal = () => {
    setAuthModalOpen(true);
    fetchAuthDiagnostics();
  };

  const exchangeAuthCode = async () => {
    if (!authCode.trim()) {
      notify("Paste the Schwab auth code first.");
      return;
    }
    try {
      await api.post("/auth/schwab/exchange", { code: authCode.trim() });
      setAuthCode("");
      setAuthModalOpen(false);
      setSchwabConnected(true);
      refreshAll();
      notify("Schwab connected.");
      setAuthError("");
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? "Code exchange failed";
      setAuthError(detail);
      notify(detail);
    }
  };

  const SchwabStatusIndicator = () => {
    if (!schwabStatus) {
      return null;
    }
    const connected = Boolean(schwabStatus.connected);
    const canFetch = Boolean(schwabStatus.can_fetch_data);
    const minutes = Math.max(0, Math.floor((schwabStatus.expires_in_seconds || 0) / 60));
    let label = connected ? "Schwab Connected" : "Schwab Offline";
    if (connected && !canFetch) {
      label = schwabStatus.status === "cooldown" ? "Schwab Cooldown" : "Schwab Limited";
    } else if (connected && minutes) {
      label = `${label} (${minutes}m)`;
    }
    const statusMessage = schwabStatus.message || schwabStatus.reason;
    return (
      <div
        className="status-bar-schwab"
        onClick={() => {
          if (!connected) {
            startSchwabAuth();
          }
        }}
        title={statusMessage || label}
      >
        <span className={connected ? "status-connected" : "status-disconnected"}>{connected ? "✓" : "✗"} {label}</span>
      </div>
    );
  };

  const tabs = useMemo(
    () => (staticMode ? ["Monitor", "Analyze", "Activity", "Admin"] : ["Monitor", "Trade", "Analyze", "Risk", "Activity", "Admin"]),
    [staticMode]
  );

  return (
    <div className={`ws ${chartFull ? "chart-full" : ""}`}>
      {!staticMode && <SchwabStatusIndicator />}
      <div className="topbar">
        <div className="top-tabs">
          {tabs.map((label) => (
            <button key={label} className={`tab ${tab === label ? "active" : ""}`} onClick={() => setTab(label)}>
              {label}
            </button>
          ))}
        </div>
        <div className="top-meta">
          <div className="topcell">
            <span className="label">Status</span>
            <div className="status">{statusLine}</div>
          </div>
          <div className="topcell">
            <span className="label">Broker</span>
            {staticMode ? (
              <div className="status">Static</div>
            ) : (
              <button className="tool" type="button" onClick={openAuthModal} disabled={portfolioStatus.source === "demo"}>
                {brokerLabel}
              </button>
            )}
          </div>
          <div className="topcell clock">{clock || "—"}</div>
        </div>
      </div>

      <div className="toolbar">
        {!staticMode && (
          <button className="tool" type="button" onClick={openTrade}>
            New Order
          </button>
        )}
        <button className={`tool ${showLeft ? "active" : ""}`} type="button" onClick={() => setShowLeft((v) => !v)}>
          Left Panel
        </button>
        <button
          className={`tool ${showChart ? "active" : ""}`}
          type="button"
          onClick={() =>
            setShowChart((prev) => {
              const next = !prev;
              if (!next) {
                setChartFull(false);
                setFocus((state) => ({ ...state, center: state.center === "chart" ? undefined : state.center }));
              }
              return next;
            })
          }
        >
          Chart
        </button>
        <button className="tool" type="button" onClick={() => setHotkeysOpen(true)}>
          Hotkeys
        </button>
        <button className="tool" type="button" onClick={() => setAlertsOpen(true)}>
          Alerts
        </button>
        <button className="tool" type="button" onClick={resetLayout}>
          Reset Layout
        </button>
      </div>

      <div className={`error-banner ${showErrorBanner ? "" : "hidden"}`}>
        {showErrorBanner ? (
          <div className="banner-row">
            <span>{`ERROR · ${error}`}</span>
            <button type="button" className="banner-close" onClick={() => setDismissedError(error || "")}>
              ×
            </button>
          </div>
        ) : null}
      </div>
      <div className={`warning-banner ${showWarningBanner ? "" : "hidden"}`}>
        {showWarningBanner ? (
          <div className="banner-row">
            <span>{`STATUS · ${connectionBanner}`}</span>
            <button type="button" className="banner-close" onClick={() => setDismissedWarning(connectionBanner || "")}>
              ×
            </button>
          </div>
        ) : null}
      </div>

      {!staticMode && authModalOpen && (
        <div className="modal">
          <div className="modal-card">
            <div className="modal-header">
              <span>Schwab Connection</span>
              <button type="button" onClick={() => setAuthModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="modal-section">
                <div className="modal-label">Status</div>
                <div className="modal-value">{schwabConnected ? "Connected" : "Not connected"}</div>
              </div>
              <div className="modal-section">
                <div className="modal-label">Redirect URI</div>
                <div className="modal-value mono">{authDiag?.redirect_uri || "—"}</div>
              </div>
              {authDiag?.scope && (
                <div className="modal-section">
                  <div className="modal-label">Token Scope</div>
                  <div className="modal-value mono">{authDiag.scope}</div>
                </div>
              )}
              {authError && <div className="modal-error">{authError}</div>}
              {authDiagError && schwabConnected && <div className="modal-error">{authDiagError}</div>}
              {!schwabConnected && (
                <div className="modal-text muted">Diagnostics available after connecting Schwab.</div>
              )}
              <div className="modal-section">
                <div className="modal-label">Step 1</div>
                <div className="modal-text">
                  Open Schwab login and approve access. The redirect URI above must exactly match the Schwab app setting.
                </div>
                <button className="tool" type="button" onClick={startSchwabAuth}>Open Schwab Login</button>
              </div>
              <div className="modal-section">
                <div className="modal-label">Step 2 (manual fallback)</div>
                <div className="modal-text">
                  If the redirect page fails, paste the full redirect URL or just the <span className="mono">code</span> value below.
                  Do not paste the log output.
                </div>
                <input
                  className="input mono"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  placeholder="Paste auth code or full redirect URL"
                  />
                  <button className="tool" type="button" onClick={exchangeAuthCode}>Exchange Code</button>
                </div>
            </div>
          </div>
        </div>
      )}

      {positionModalOpen && (
        <div className="modal">
          <div className="modal-card">
            <div className="modal-header">
              <span>Manual Portfolio Entry</span>
              <button type="button" onClick={() => setPositionModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="modal-section">
                <div className="modal-label">Cash</div>
                <div className="modal-text">Set portfolio cash (for NAV).</div>
                <input
                  className="input mono"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                  placeholder="Cash balance"
                />
                <button className="tool" type="button" onClick={updateCash}>Update Cash</button>
              </div>
              <div className="modal-section">
                <div className="modal-label">Position</div>
                <div className="grid form-grid">
                  <label className="field">
                    <span>Symbol</span>
                    <input
                      className="input mono"
                      value={positionForm.symbol}
                      onChange={(e) => setPositionForm((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                    />
                  </label>
                  <label className="field">
                    <span>Asset</span>
                    <select
                      className="input"
                      value={positionForm.asset_class}
                      onChange={(e) => setPositionForm((prev) => ({ ...prev, asset_class: e.target.value }))}
                    >
                      <option value="EQUITY">EQUITY</option>
                      <option value="OPTION">OPTION</option>
                      <option value="FUTURE">FUTURE</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Qty</span>
                    <input
                      className="input mono"
                      value={positionForm.qty}
                      onChange={(e) => setPositionForm((prev) => ({ ...prev, qty: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Price</span>
                    <input
                      className="input mono"
                      value={positionForm.price}
                      onChange={(e) => setPositionForm((prev) => ({ ...prev, price: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Avg Cost</span>
                    <input
                      className="input mono"
                      value={positionForm.avg_cost}
                      onChange={(e) => setPositionForm((prev) => ({ ...prev, avg_cost: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Entry Date</span>
                    <input
                      className="input mono"
                      type="date"
                      value={positionForm.entry_date}
                      onChange={(e) => setPositionForm((prev) => ({ ...prev, entry_date: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Underlying</span>
                    <input
                      className="input mono"
                      value={positionForm.underlying}
                      onChange={(e) => setPositionForm((prev) => ({ ...prev, underlying: e.target.value.toUpperCase() }))}
                    />
                  </label>
                  <label className="field">
                    <span>Expiry</span>
                    <input
                      className="input mono"
                      value={positionForm.expiry}
                      onChange={(e) => setPositionForm((prev) => ({ ...prev, expiry: e.target.value }))}
                      placeholder="YYYY-MM-DD"
                    />
                  </label>
                  <label className="field">
                    <span>Strike</span>
                    <input
                      className="input mono"
                      value={positionForm.strike}
                      onChange={(e) => setPositionForm((prev) => ({ ...prev, strike: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Option Type</span>
                    <select
                      className="input"
                      value={positionForm.option_type}
                      onChange={(e) => setPositionForm((prev) => ({ ...prev, option_type: e.target.value }))}
                    >
                      <option value="CALL">CALL</option>
                      <option value="PUT">PUT</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Sector</span>
                    <input
                      className="input"
                      value={positionForm.sector}
                      onChange={(e) => setPositionForm((prev) => ({ ...prev, sector: e.target.value }))}
                      list="sector-options"
                    />
                  </label>
                  <label className="field">
                    <span>Strategy</span>
                    <input
                      className="input"
                      value={positionForm.strategy}
                      onChange={(e) => setPositionForm((prev) => ({ ...prev, strategy: e.target.value }))}
                    />
                  </label>
                </div>
                <datalist id="sector-options">
                  {sectorOptions.map((sector) => (
                    <option key={sector} value={sector} />
                  ))}
                </datalist>
                <button className="tool" type="button" onClick={savePosition}>Save Position</button>
              </div>
              <div className="modal-section">
                <div className="modal-label">CSV Import</div>
                <div className="modal-text">
                  Supports Schwab Positions/Transactions exports, or custom flexible headers:
                  <span className="mono"> symbol/sym/ticker, qty/quantity, price/mark/last, avg_cost/avg_price, entry_date/open_date, asset_class/type, underlying, expiry/exp, strike, option_type/right, sector, strategy, side</span>
                </div>
                <input
                  className="input"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) importCsvFile(file);
                  }}
                />
                {csvError && <div className="modal-error">{csvError}</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {hotkeysOpen && (
        <div className="modal">
          <div className="modal-card">
            <div className="modal-header">
              <span>Hotkeys</span>
              <button type="button" onClick={() => setHotkeysOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="modal-section">
                <div className="modal-text mono">/ — Focus Symbol Search</div>
                <div className="modal-text mono">M — Monitor</div>
                {!staticMode && <div className="modal-text mono">T — Trade</div>}
                <div className="modal-text mono">A — Analyze</div>
                <div className="modal-text mono">R — Risk</div>
                <div className="modal-text mono">Y — Activity</div>
                <div className="modal-text mono">D — Admin</div>
                <div className="modal-text mono">F — Toggle Chart Fullscreen (Monitor)</div>
                <div className="modal-text mono">Esc — Exit Chart Fullscreen</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {alertsOpen && (
        <div className="modal">
          <div className="modal-card">
            <div className="modal-header">
              <span>Alerts</span>
              <button type="button" onClick={() => setAlertsOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="modal-section">
                <div className="modal-text">No active alerts.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`layout ${showLeft ? "" : "no-left"} ${chartFull ? "full" : ""}`}>
        <aside className={`left ${showLeft ? "" : "hidden"}`}>
          {showPanel("left", "account") && (
            <>
              <div className="panel-header">
                <span>Account</span>
                <div className="panel-controls">
                  <button type="button" onClick={() => toggleCollapsed("account")}>{collapsed.account ? "+" : "−"}</button>
                  <button type="button" onClick={() => toggleFocus("left", "account")}>□</button>
                  <button type="button" onClick={() => notify("Detach not available.")}>↗</button>
                  <button type="button" onClick={() => notify("Account settings opened.")}>⚙</button>
                </div>
              </div>
              {!collapsed.account && (
                <div className="panel-body account-panel">
                  <div className="table account-summary">
                    <div className="row head account">
                      <div>Metric</div>
                      <div className="num">Value</div>
                    </div>
                    {accountSummary ? (
                      [
                        ["Account", accountSummary.name],
                        ["NLV", accountSummary.nlv],
                        ["Day PnL", accountSummary.dayPnl],
                        ["Total PnL", accountSummary.totalPnl],
                        ["Cash", accountSummary.cashTotal],
                        ["Cash (Avail)", accountSummary.cash],
                        ["Buying Power", accountSummary.buyingPower],
                      ].map(([k, v], idx) => (
                        <div className={`row account ${idx % 2 ? "alt" : ""}`} key={k as string}>
                          <div>{k}</div>
                          <div className={`num mono ${(k as string).includes("PnL") && String(v).startsWith("-") ? "neg" : ""}`}>
                            {v}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="row account">
                        <div>Loading</div>
                        <div className="num">—</div>
                      </div>
                    )}
                  </div>
                  <div className="account-select">
                    <div className="label">Account</div>
                    <select
                      className="input"
                      value={accountId}
                      onChange={(event) => setAccount(event.target.value)}
                    >
                      {accountOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}

          {showPanel("left", "watchlist") && (
            <>
              <div className="panel-header">
                <span>Watchlists</span>
                <div className="panel-controls">
                  <button type="button" onClick={() => toggleCollapsed("watchlist")}>{collapsed.watchlist ? "+" : "−"}</button>
                  <button type="button" onClick={() => toggleFocus("left", "watchlist")}>□</button>
                  <button type="button" onClick={() => notify("Detach not available.")}>↗</button>
                  <button type="button" onClick={() => notify("Watchlist settings opened.")}>⚙</button>
                </div>
              </div>
              {!collapsed.watchlist && (
                <div className="table zebra">
                  <div className="watchlist-controls">
                    <input
                      className="input input-mini"
                      placeholder="Add symbol"
                      value={watchlistInput}
                      onChange={(e) => setWatchlistInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addWatchSymbol();
                      }}
                    />
                    <button className="btn ghost" type="button" onClick={addWatchSymbol}>
                      Add
                    </button>
                  </div>
                  <div className="row head watchlist">
                    <div>Symbol</div>
                    <div className="num">Last</div>
                    <div className="num">Change</div>
                    <div className="num">%</div>
                  </div>
                  {watchlistRows.length === 0 ? (
                    <div className="row watchlist">
                      <div>No symbols</div>
                      <div />
                      <div />
                      <div />
                    </div>
                  ) : (
                    watchlistRows.map((row, idx) => (
                      <div
                        className={`row watchlist ${idx % 2 ? "alt" : ""} ${currentSymbol === row.symbol ? "selected" : ""} ${selectedWatchIndex === idx ? "selected" : ""}`}
                        key={row.symbol}
                        onClick={() => {
                          setActiveTable("watchlist");
                          setSelectedWatchIndex(idx);
                          setCurrentSymbol(row.symbol);
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setActiveTable("watchlist");
                          setSelectedWatchIndex(idx);
                          setCurrentSymbol(row.symbol);
                          setContextMenu({ x: event.clientX, y: event.clientY, symbol: row.symbol, mode: "watchlist" });
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="mono">
                          {row.symbol}
                          <button
                            className="watchlist-remove"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeWatchSymbol(row.symbol);
                            }}
                          >
                            ×
                          </button>
                        </div>
                        <div className="num mono">{row.last}</div>
                        <div className={`num mono ${String(row.rawPct).startsWith("-") ? "neg" : "pos"}`}>{row.chg}</div>
                        <div className={`num mono ${String(row.rawPct).startsWith("-") ? "neg" : "pos"}`}>{row.pct}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}

          {showPanel("left", "strategy") && (
            <>
              <div className="panel-header">
                <span>Strategy Groups</span>
                <div className="panel-controls">
                  <button type="button" onClick={() => toggleCollapsed("strategy")}>{collapsed.strategy ? "+" : "−"}</button>
                  <button type="button" onClick={() => toggleFocus("left", "strategy")}>□</button>
                  <button type="button" onClick={() => notify("Detach not available.")}>↗</button>
                  <button type="button" onClick={() => notify("Strategy settings opened.")}>⚙</button>
                </div>
              </div>
              {!collapsed.strategy && (
                <div className="list">
                  <div
                    className={`list-row ${!strategyFilter ? "active" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setStrategyFilter("")}
                  >
                    All Strategies
                  </div>
                  {strategyGroups.map((group) => (
                    <div
                      key={group}
                      className={`list-row ${strategyFilter === group ? "active" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setStrategyFilter(strategyFilter === group ? "" : group)}
                    >
                      {group}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>

        <main className="center">
          {tab === "Monitor" && (
            <div className={`tab-body monitor-layout ${chartFull ? "full" : ""}`}>
              {!chartFull && showPanel("center", "positions") && (
                <div className="monitor-positions">
                  <div className={`panel-header ${portfolioStatus.ok ? "" : "stale"}`}>
                    <span>Positions · {portfolioStatus.label}</span>
                    <div className="panel-controls">
                      <button type="button" onClick={() => openPositionModal()}>＋</button>
                      <button type="button" onClick={() => toggleCollapsed("positions")}>{collapsed.positions ? "+" : "−"}</button>
                      <button type="button" onClick={() => toggleFocus("center", "positions")}>□</button>
                      <button type="button" onClick={() => notify("Detach not available.")}>↗</button>
                      <button type="button" onClick={() => notify("Positions settings opened.")}>⚙</button>
                    </div>
                  </div>
                  {pricingBanner && (
                    <div className={`data-banner ${pricingBanner.ok ? "" : "warn"}`}>{pricingBanner.text}</div>
                  )}
                  {positionsDisplay.length === 0 && (
                    <div className="warning-banner">{positionsEmptyBanner}</div>
                  )}
                  {!collapsed.positions && (
                    <div className="table scroll">
                      <datalist id="owner-options">
                        {ownerOptions.map((owner) => (
                          <option key={owner} value={owner} />
                        ))}
                      </datalist>
                      <div className="row head positions">
                        <div>Symbol</div>
                        <div>Type</div>
                        <div className="num">Qty</div>
                        <div className="num">Avg</div>
                        <div className="num">Last</div>
                        <div className="num">Day PnL</div>
                        <div className="num">Total PnL</div>
                        <div className="num">% NAV</div>
                        <div className="centered">Expiry</div>
                        <div className="centered cell-strike">Strike</div>
                        <div className="centered">Entry</div>
                        <div>Owner</div>
                        <div>Sector</div>
                      </div>
                      {positionsDisplay.length === 0 ? (
                        <div className="row positions">
                          <div>No positions</div>
                          <div />
                          <div />
                          <div />
                          <div />
                          <div />
                          <div />
                          <div />
                          <div />
                          <div />
                          <div />
                          <div />
                          <div />
                        </div>
                      ) : (
                        positionsDisplay.map((row: any, idx: number) => {
                          const navPct = snapshot ? (row.market_value / Math.max(snapshot.nlv, 1)) * 100 : 0;
                          const dayPnl = safeNumber(row.day_pnl);
                          const totalPnl = safeNumber(row.total_pnl);
                          const asset = String(row.asset_class || "").toLowerCase();
                          const isOptionSymbol = asset === "option" || (row.symbol && parseOsiSymbol(row.symbol));
                          const displaySymbol =
                            isOptionSymbol && row.symbol && !parseOsiSymbol(row.symbol)
                              ? buildOsiSymbol(
                                  row.underlying ?? row.symbol,
                                  row.expiry ? normalizeExpiryInput(String(row.expiry)) : "",
                                  row.option_type?.toString().startsWith("P") ? "P" : "C",
                                  row.strike ?? 0
                                ) || row.symbol
                              : row.symbol;
                          const selectSymbol =
                            row.isStrategySummary && row.underlying
                              ? row.underlying
                              : isOptionSymbol && row.underlying
                                ? row.underlying
                                : row.symbol;
                          const isShort = Number(row.qty || 0) < 0;
                          const typeBase = row.asset_class ? String(row.asset_class).toUpperCase() : "—";
                          const summarySide = row.position_side === "SHORT" ? "SHORT" : "LONG";
                          const typeDisplay = row.isStrategySummary
                            ? `${typeBase} ${summarySide}`
                            : isShort
                              ? `${typeBase} SHORT`
                              : typeBase;
                          const strategyId = row.strategy_id as string | undefined;
                          const isCollapsed = strategyId ? !!collapsedStrategies[strategyId] : false;
                          return (
                            <div
                              className={`row positions ${idx % 2 ? "alt" : ""} ${row.isStrategySummary ? "strategy" : ""} ${row.isStrategyLeg ? "leg" : ""} ${currentSymbol === selectSymbol ? "selected" : ""} ${selectedPosIndex === idx ? "selected" : ""}`}
                              key={
                                row.isStrategySummary
                                  ? `strategy-${row.strategy_id}-${idx}`
                                  : row.isStrategyLeg
                                    ? `leg-${row.instrument_id ?? row.symbol}-${idx}`
                                    : row.instrument_id ?? `${row.symbol}-${idx}`
                              }
                              onClick={() => {
                                setActiveTable("positions");
                                setSelectedPosIndex(idx);
                                setCurrentSymbol(selectSymbol);
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                setActiveTable("positions");
                                setSelectedPosIndex(idx);
                                setCurrentSymbol(selectSymbol);
                                const contextSymbol =
                                  row.isStrategySummary && row.underlying ? row.underlying : row.symbol;
                                setContextMenu({
                                  x: event.clientX,
                                  y: event.clientY,
                                  symbol: contextSymbol,
                                  selectSymbol,
                                  mode: "positions",
                                  instrumentId: row.isStrategySummary ? null : row.instrument_id,
                                  isStrategySummary: !!row.isStrategySummary,
                                });
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="mono">
                                {row.isStrategySummary && strategyId ? (
                                  <button
                                    type="button"
                                    className="strategy-toggle"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      toggleStrategy(strategyId);
                                    }}
                                  >
                                    {isCollapsed ? "▸" : "▾"}
                                  </button>
                                ) : null}
                                <span>{displaySymbol}</span>
                                {row.isStrategySummary && row.legCount ? (
                                  <span className="strategy-count">({row.legCount})</span>
                                ) : null}
                              </div>
                              <div className="mono">{typeDisplay}</div>
                              <div className="num mono">{formatNumber(row.qty)}</div>
                              <div className="num mono">{formatNumber(safeNumber(row.avg_cost))}</div>
                              <div className="num mono">{formatNumber(row.price)}</div>
                              <div className={`num mono ${dayPnl < 0 ? "neg" : "pos"}`}>{formatSignedMoney(dayPnl)}</div>
                              <div className={`num mono ${totalPnl < 0 ? "neg" : "pos"}`}>{formatSignedMoney(totalPnl)}</div>
                              <div className="num mono">{navPct.toFixed(1)}%</div>
                              <div className="centered mono">{row.expiry ?? "—"}</div>
                              <div className="centered mono cell-strike">
                                {row.strike ? formatNumber(row.strike) : "—"}
                              </div>
                              <div className="centered cell-entry-date">
                                {row.isStrategySummary ? (
                                  row.entry_date || "—"
                                ) : (
                                  <input
                                    key={`${row.instrument_id ?? row.symbol}-entry-${row.entry_date ?? ""}`}
                                    className="input input-mini mono"
                                    type="date"
                                    defaultValue={row.entry_date ?? ""}
                                    onBlur={(e) => updatePositionEntryDate(row, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        (e.target as HTMLInputElement).blur();
                                      }
                                    }}
                                  />
                                )}
                              </div>
                              <div className="cell-owner">
                                {row.isStrategySummary ? (
                                  row.owner ? row.owner : "—"
                                ) : (
                                  <input
                                    key={`${row.instrument_id ?? row.symbol}-owner-${row.owner ?? ""}`}
                                    className="input input-mini"
                                    list="owner-options"
                                    placeholder="Owner"
                                    defaultValue={row.owner ?? ""}
                                    onBlur={(e) => updatePositionOwner(row, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        (e.target as HTMLInputElement).blur();
                                      }
                                    }}
                                  />
                                )}
                              </div>
                              <div className="cell-sector">
                                {row.isStrategySummary ? (
                                  row.sector ?? "—"
                                ) : (
                                  <select
                                    className="input input-mini"
                                    value={row.sector ?? ""}
                                    onChange={(e) => updatePositionSector(row, e.target.value)}
                                  >
                                    <option value="">Unassigned</option>
                                    {sectorOptions.map((sector) => (
                                      <option key={sector} value={sector}>
                                        {sector}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}

              {showPanel("center", "chart") && showChart && (
                <div className="monitor-chart">
                  <div className={`panel-header ${portfolioStatus.ok ? "" : "stale"}`}>
                    <span>{chartMode === "SECTOR" ? "Sector vs Portfolio vs SPX" : "Portfolio vs SPX"} · {timeframe} · {portfolioStatus.label}</span>
                    <div className="panel-controls">
                      <select className="input input-mini" value={chartMode} onChange={(e) => setChartMode(e.target.value as "PORTFOLIO" | "SECTOR")}>
                        <option value="PORTFOLIO">Portfolio vs SPX</option>
                        <option value="SECTOR">Sector vs Portfolio vs SPX</option>
                      </select>
                      {chartMode === "PORTFOLIO" && accountId === "ALL" && accountChartOptions.length > 0 && (
                        <>
                          <select
                            className="input input-mini"
                            value={accountView}
                            onChange={(e) => setAccountView(e.target.value)}
                          >
                            {accountChartOptions.map((acct) => (
                              <option key={acct} value={acct}>
                                {acct}
                              </option>
                            ))}
                          </select>
                          <button type="button" className="tool" onClick={addAccountSelection}>
                            Add
                          </button>
                          <button
                            type="button"
                            className="tool"
                            onClick={clearAccountSelection}
                            disabled={selectedAccounts.length === 0}
                          >
                            Clear
                          </button>
                        </>
                      )}
                      {chartMode === "SECTOR" && (
                        <>
                          <select
                            className="input input-mini"
                            value={sectorView}
                            onChange={(e) => {
                              const value = e.target.value;
                              setSectorView(value);
                              if (selectedSectors.length <= 1) {
                                setSectorTouched(true);
                                setSelectedSectors([value]);
                              }
                            }}
                          >
                            {sectorOptions.map((sector) => (
                              <option key={sector} value={sector}>
                                {sector}
                              </option>
                            ))}
                          </select>
                          <button type="button" className="tool" onClick={addSectorSelection}>
                            Add
                          </button>
                          <button
                            type="button"
                            className="tool"
                            onClick={clearSectorSelection}
                            disabled={selectedSectors.length === 0}
                          >
                            Clear
                          </button>
                          <select
                            className="input input-mini"
                            value={sectorSource}
                            onChange={(e) => setSectorSource(e.target.value as "auto" | "etf" | "sleeve")}
                          >
                            <option value="auto">Auto</option>
                            <option value="etf">ETF</option>
                            <option value="sleeve">Sleeve</option>
                          </select>
                        </>
                      )}
                      <select className="input input-mini" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                        <option>1D</option>
                        <option>5D</option>
                        <option>1M</option>
                        <option>3M</option>
                        <option>MAX</option>
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          setChartFull((prev) => {
                            const next = !prev;
                            if (next) setShowChart(true);
                            return next;
                          })
                        }
                      >
                        {chartFull ? "⤡" : "⤢"}
                      </button>
                      <button type="button" onClick={() => toggleCollapsed("chart")}>{collapsed.chart ? "+" : "−"}</button>
                      <button type="button" onClick={() => toggleFocus("center", "chart")}>□</button>
                      <button type="button" onClick={() => notify("Detach not available.")}>↗</button>
                      <button type="button" onClick={() => notify("Chart settings opened.")}>⚙</button>
                    </div>
                  </div>
                  {!collapsed.chart && (
                    <>
                      {chartMode === "PORTFOLIO" && accountId === "ALL" && selectedAccounts.length > 0 && (
                        <div className="chart-filter-row">
                          {selectedAccounts.map((name) => (
                            <button
                              key={name}
                              type="button"
                              className="chart-chip"
                              onClick={() => removeAccountSelection(name)}
                              title="Remove account"
                            >
                              {name} ×
                            </button>
                          ))}
                        </div>
                      )}
                      {chartMode === "SECTOR" && selectedSectors.length > 0 && (
                        <div className="chart-filter-row">
                          {selectedSectors.map((sector) => (
                            <button
                              key={sector}
                              type="button"
                              className="chart-chip"
                              onClick={() => removeSectorSelection(sector)}
                              title="Remove sector"
                            >
                              {sector} ×
                            </button>
                          ))}
                        </div>
                      )}
                      {sectorEmpty && chartMode === "SECTOR" && (
                        <div className="warning-banner">No sector data yet. Add a sector or check that positions are assigned.</div>
                      )}
                      {sectorError && chartMode === "SECTOR" && <div className="error-banner">{sectorError}</div>}
                      <ErrorBoundary fallback={<div className="error-banner">Chart error. Please refresh.</div>}>
                        <PortfolioChart
                          key={`monitor-${chartMode}-${chartShowBench}-${sectorSeriesList.length}`}
                          data={chartData}
                          showSector={chartMode === "SECTOR"}
                          showBench={chartShowBench}
                          sectorSeries={sectorSeriesList}
                          extraSeries={accountId === "ALL" ? accountSeries : []}
                        />
                      </ErrorBoundary>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "Risk" && (
            <div className="tab-body">
              {showPanel("center", "risk") && (
                <>
                  <div className={`panel-header ${riskStatus.ok ? "" : "stale"}`}>
                    <span>Risk Dashboard · {riskStatus.label}</span>
                    <div className="panel-controls">
                      <button type="button" onClick={() => toggleCollapsed("risk")}>{collapsed.risk ? "+" : "−"}</button>
                      <button type="button" onClick={() => toggleFocus("center", "risk")}>□</button>
                      <button type="button" onClick={() => notify("Detach not available.")}>↗</button>
                      <button type="button" onClick={() => notify("Risk settings opened.")}>⚙</button>
                    </div>
                  </div>
                  {!collapsed.risk && (
                    <>
                      <div className="table">
                        <div className="row head risk">
                          <div>Metric</div>
                          <div className="num">Value</div>
                          <div className="num">Limit</div>
                        </div>
                        {riskRows.map((row, idx) => (
                          <div className={`row risk ${row.breached ? "warn" : ""} ${idx % 2 ? "alt" : ""}`} key={row.metric}>
                            <div className="mono">{riskLabels[row.metric] ?? row.metric.replaceAll("_", " ")}</div>
                            <div className="num mono">{formatRiskValue(row.metric, row.value)}</div>
                            <div className="num mono">{row.limit ? formatRiskValue(row.metric, row.limit) : "—"}</div>
                          </div>
                        ))}
                      </div>
                      <div className="table">
                        <div className="row head risk-matrix">
                          <div>Asset</div>
                          <div className="num">Long%</div>
                          <div className="num">Short%</div>
                          <div className="num">Net%</div>
                        </div>
                        {riskMatrix.map((row, idx) => (
                          <div className={`row risk-matrix ${idx % 2 ? "alt" : ""}`} key={row.cls}>
                            <div className="mono">{row.cls.toUpperCase()}</div>
                            <div className="num mono">{formatSignedPct(row.long * 100, 1)}</div>
                            <div className="num mono">{formatSignedPct(row.short * 100, 1)}</div>
                            <div className="num mono">{formatSignedPct(row.net * 100, 1)}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "Activity" && (
            <div className="tab-body">
              {showPanel("center", "blotter") && (
                <>
                  <div className={`panel-header ${portfolioStatus.ok ? "" : "stale"}`}>
                  <span>Transactions · {portfolioStatus.label}</span>
                    <div className="panel-controls">
                      <button type="button" onClick={() => toggleCollapsed("blotter")}>{collapsed.blotter ? "+" : "−"}</button>
                      <button type="button" onClick={() => toggleFocus("center", "blotter")}>□</button>
                      <button type="button" onClick={() => notify("Detach not available.")}>↗</button>
                      <button type="button" onClick={() => notify("Blotter settings opened.")}>⚙</button>
                    </div>
                  </div>
                  {!collapsed.blotter && (
                    <div className="table">
                      <div className="row head blotter">
                        <div className="centered">Time</div>
                        <div className="centered">Trade Date</div>
                        <div>Symbol</div>
                        <div className="centered">Side</div>
                        <div className="num">Qty</div>
                        <div className="num">Price</div>
                        <div>Status</div>
                      </div>
                      {(blotter?.trades ?? []).map((row, idx) => (
                        <div className={`row blotter ${idx % 2 ? "alt" : ""}`} key={`${row.ts}-${row.symbol}`}>
                          <div className="centered mono">{row.ts}</div>
                          <div className="centered mono">{row.trade_date ?? row.ts?.slice(0, 10)}</div>
                          <div className="mono">{row.symbol}</div>
                          <div className={`centered ${row.side === "BUY" ? "pos" : "neg"}`}>{row.side}</div>
                          <div className="num mono">{formatNumber(row.qty)}</div>
                          <div className="num mono">{formatNumber(row.price)}</div>
                          <div>{row.status}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "Admin" && (
            <div className="tab-body admin-body">
              <div className="admin-shell">
                <div className="panel-header">
                  <span>Portfolio Admin</span>
                  <div className="panel-controls">
                    <button type="button" onClick={() => notify("Admin settings opened.")}>⚙</button>
                  </div>
                </div>
                <div className="panel-body trade-form">
                  <div className="field">
                    <label>Cash (Total)</label>
                    <input
                      className="input"
                      type="number"
                      value={cashInput}
                      placeholder={snapshot ? String(snapshot.cash ?? "") : ""}
                      onChange={(e) => setCashInput(e.target.value)}
                    />
                    <button className="btn buy" type="button" onClick={updateCash}>Update Cash</button>
                  </div>
                  <div className="field">
                    <label>Benchmark Start (YYYY-MM-DD)</label>
                    <input className="input" type="date" value={benchStart} onChange={(e) => setBenchStart(e.target.value)} />
                    <button className="btn ghost" type="button" onClick={setBenchmarkStart}>Set Benchmark</button>
                  </div>
                  <div className="field">
                    <label>Reset Portfolio (Start Cash)</label>
                    <input
                      className="input"
                      type="number"
                      value={resetCash}
                      placeholder={snapshot ? String(snapshot.cash ?? "") : ""}
                      onChange={(e) => setResetCash(e.target.value)}
                    />
                    <button className="btn sell" type="button" onClick={resetPortfolio}>Reset Portfolio</button>
                  </div>
                  <div className="field">
                    <label>Positions</label>
                    <button className="btn ghost" type="button" onClick={() => openPositionModal()}>
                      Add / Update Position
                    </button>
                  </div>
                  <div className="field">
                    <label>NAV History</label>
                    <div className="btn-row">
                      <button className="btn ghost" type="button" onClick={rebuildNavHistory} disabled={navRebuildRunning}>
                        {navRebuildRunning ? "Rebuilding..." : "Rebuild NAV"}
                      </button>
                      <button className="btn ghost" type="button" onClick={clearNavHistory} disabled={navRebuildRunning}>
                        Clear NAV
                      </button>
                    </div>
                  </div>
                  <div className="field">
                    <label>Paste NAV History</label>
                    <div className="modal-text muted mono">
                      One line per entry. Formats: YYYY-MM-DD, 123456.78 or MM/DD/YYYY, 123456.78
                    </div>
                    <textarea
                      className="input mono"
                      rows={6}
                      value={navPasteText}
                      onChange={(e) => setNavPasteText(e.target.value)}
                      placeholder="2026-01-02, 433210.55"
                    />
                    <button className="btn ghost" type="button" onClick={importNavText}>
                      Import NAV Paste
                    </button>
                    {navPasteError && <div className="error-banner">{navPasteError}</div>}
                  </div>
                  <div className="field">
                    <label>Paste Benchmark (SPX) History</label>
                    <div className="modal-text muted mono">
                      One line per entry. Formats: YYYY-MM-DD, 1234.56 or MM/DD/YYYY, 1234.56
                    </div>
                    <textarea
                      className="input mono"
                      rows={6}
                      value={benchPasteText}
                      onChange={(e) => setBenchPasteText(e.target.value)}
                      placeholder="2026-01-02, 4769.83"
                    />
                    <button className="btn ghost" type="button" onClick={importBenchText}>
                      Import Benchmark Paste
                    </button>
                    {benchPasteError && <div className="error-banner">{benchPasteError}</div>}
                  </div>
                  <div className="field">
                    <label>Schwab Market Data</label>
                    <button className="btn ghost" type="button" onClick={openAuthModal}>
                      {schwabConnected ? "Schwab Connected ✓" : "Connect Schwab"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!staticMode && tab === "Trade" && (
            <div className="tab-body">
              <div className="trade-grid">
                {showPanel("center", "trade") && (
                  <div className="trade-card">
                    <div className="panel-header">
                      <span>Trade Ticket</span>
                      <div className="panel-controls">
                        <button type="button" onClick={() => toggleCollapsed("trade")}>{collapsed.trade ? "+" : "−"}</button>
                        <button type="button" onClick={() => toggleFocus("center", "trade")}>□</button>
                        <button type="button" onClick={() => notify("Detach not available.")}>↗</button>
                        <button type="button" onClick={() => notify("Trade settings opened.")}>⚙</button>
                      </div>
                    </div>
                    {!collapsed.trade && (
                      <div className="panel-body trade-form">
                        <div className="field">
                          <label>{tradeAssetClass === "OPTION" ? "Underlying (default)" : "Symbol"}</label>
                          <input
                            id="trade-symbol"
                            className="input"
                            value={tradeSymbol}
                            onChange={(e) => {
                              setTradeSymbolTouched(true);
                              setTradeSymbol(e.target.value.toUpperCase());
                            }}
                          />
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => {
                              setTradeSymbolTouched(false);
                              setTradeSymbol(currentSymbol);
                            }}
                          >
                            Use Chart Symbol
                          </button>
                        </div>
                        <div className="field">
                          <label>Trade Date</label>
                          <input
                            className="input"
                            value={tradeDate}
                            onChange={(e) => setTradeDate(e.target.value)}
                            type="date"
                          />
                        </div>
                        <div className="field">
                          <label>Sector</label>
                          <select className="input" value={tradeSector} onChange={(e) => setTradeSector(e.target.value)}>
                            {sectorOptions.map((sector) => (
                              <option key={sector} value={sector}>
                                {sector}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label>Asset</label>
                          <select className="input" value={tradeAssetClass} onChange={(e) => setTradeAssetClass(e.target.value)}>
                            <option>EQUITY</option>
                            <option>OPTION</option>
                            <option>FUTURE</option>
                          </select>
                        </div>
                        {tradeAssetClass !== "OPTION" && (
                          <div className="field">
                            <label>Side</label>
                            <select className="input" value={tradeSide} onChange={(e) => setTradeSide(e.target.value)}>
                              <option>BUY</option>
                              <option>SELL</option>
                            </select>
                          </div>
                        )}
                        {tradeAssetClass !== "OPTION" && (
                          <div className="field">
                            <label>Qty</label>
                            <input className="input" value={tradeQty} onChange={(e) => setTradeQty(e.target.value)} />
                          </div>
                        )}
                        {tradeAssetClass !== "EQUITY" && tradeAssetClass !== "OPTION" && (
                          <div className="field">
                            <label>Expiry</label>
                            <input className="input" value={tradeExpiry} onChange={(e) => setTradeExpiry(e.target.value)} />
                          </div>
                        )}
                        <div className="field">
                          <label>{tradeAssetClass === "OPTION" ? "Net Limit Price" : "Limit Price"}</label>
                          <input
                            className="input"
                            value={tradeLimit}
                            onChange={(e) => setTradeLimit(e.target.value)}
                            placeholder={
                              tradeAssetClass === "OPTION"
                                ? "Enter net limit (debit + / credit -)"
                                : "Enter limit price"
                            }
                            type="number"
                          />
                        </div>
                        <div className="trade-actions">
                          <button className="btn buy" type="button" onClick={runPreview} disabled={!canSubmit}>
                            Preview
                          </button>
                          <button className="btn sell" type="button" onClick={submitTrade} disabled={!canSubmit}>
                            Submit
                          </button>
                        </div>
                        {tradeAssetClass === "OPTION" && (
                          <div className="legs">
                            <div className="legs-header">Option Legs (net limit applies to all legs)</div>
                            {tradeLegs.map((leg) => (
                              <div className="leg-row" key={leg.id}>
                                <div className="leg-main">
                                  <select
                                    className="input input-mini"
                                    value={leg.side}
                                    onChange={(e) => updateLeg(leg.id, "side", e.target.value)}
                                  >
                                    <option>BUY</option>
                                    <option>SELL</option>
                                  </select>
                                  <input
                                    className="input"
                                    placeholder="Underlying"
                                    value={leg.underlying}
                                    onChange={(e) => updateLeg(leg.id, "underlying", e.target.value.toUpperCase())}
                                  />
                                  <input
                                    className="input input-mini"
                                    placeholder="Expiry (YYYY-MM-DD)"
                                    value={leg.expiry}
                                    onChange={(e) => updateLeg(leg.id, "expiry", e.target.value)}
                                  />
                                  <input
                                    className="input input-mini"
                                    placeholder="C/P"
                                    value={leg.right}
                                    onChange={(e) => updateLeg(leg.id, "right", e.target.value.toUpperCase())}
                                  />
                                  <input
                                    className="input input-mini"
                                    placeholder="Strike"
                                    value={leg.strike}
                                    onChange={(e) => updateLeg(leg.id, "strike", e.target.value)}
                                    type="number"
                                  />
                                </div>
                                <div className="leg-sub">
                                  <input
                                    className="input input-mini"
                                    placeholder="Qty"
                                    value={leg.qty}
                                    onChange={(e) => updateLeg(leg.id, "qty", e.target.value)}
                                    type="number"
                                  />
                                  <input
                                    className="input input-mini"
                                    placeholder="Mark"
                                    value={leg.price}
                                    readOnly
                                  />
                                  <input
                                    className="input"
                                    placeholder="OSI (optional)"
                                    value={leg.symbol}
                                    onChange={(e) => updateLeg(leg.id, "symbol", e.target.value.toUpperCase())}
                                  />
                                  <button className="btn ghost" type="button" onClick={() => removeLeg(leg.id)}>
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                            <div className="legs-actions">
                              <button className="btn ghost" type="button" onClick={addLeg}>
                                Add Leg
                              </button>
                              <button className="btn ghost" type="button" onClick={fetchLegMarks} disabled={!legsHaveData}>
                                Fetch Marks
                              </button>
                              <button className="btn buy" type="button" onClick={runLegsPreview} disabled={!optionLegCheck.ok}>
                                Preview Legs
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {showPanel("center", "preview") && (
                  <div className="trade-card">
                    <div className="panel-header">
                      <span>Preview</span>
                      <div className="panel-controls">
                        <button type="button" onClick={() => toggleCollapsed("preview")}>{collapsed.preview ? "+" : "−"}</button>
                        <button type="button" onClick={() => toggleFocus("center", "preview")}>□</button>
                        <button type="button" onClick={() => notify("Detach not available.")}>↗</button>
                        <button type="button" onClick={() => notify("Preview settings opened.")}>⚙</button>
                      </div>
                    </div>
                    {!collapsed.preview && (
                      <div className="list">
                        <div className="list-row">{previewText}</div>
                        {tradeAssetClass === "OPTION" ? (
                          <>
                            <div className="list-row">Net Limit: {tradeLimit || "—"}</div>
                            <div className="list-row">
                              Net Preview: {optionPreview ? formatSignedMoney(optionPreview.net) : "—"}
                            </div>
                            <div className="list-row">
                              Legs: {optionPreview?.legs ?? optionLegsRaw.length ?? 0}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="list-row">Mid: {formatNumber(currentPrice)} · Qty: {tradeQty}</div>
                            <div className="list-row">Impact: {formatSignedMoney((priceForTrade || 0) * qtyNum * (tradeSide === "BUY" ? -1 : 1))}</div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "Analyze" && (
            <div className="tab-body analyze-body">
              <div className="analyze-chart">
                <div className="analyze-controls">
                  <select className="input input-mini" value={chartMode} onChange={(e) => setChartMode(e.target.value as "PORTFOLIO" | "SECTOR")}>
                    <option value="PORTFOLIO">Portfolio</option>
                    <option value="SECTOR">Sector vs Portfolio</option>
                  </select>
                  {chartMode === "PORTFOLIO" && accountId === "ALL" && accountChartOptions.length > 0 && (
                    <>
                      <select
                        className="input input-mini"
                        value={accountView}
                        onChange={(e) => setAccountView(e.target.value)}
                      >
                        {accountChartOptions.map((acct) => (
                          <option key={acct} value={acct}>
                            {acct}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="btn ghost" onClick={addAccountSelection}>
                        Add
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={clearAccountSelection}
                        disabled={selectedAccounts.length === 0}
                      >
                        Clear
                      </button>
                    </>
                  )}
                  {chartMode === "SECTOR" && (
                    <>
                      <select
                        className="input input-mini"
                        value={sectorView}
                        onChange={(e) => {
                          const value = e.target.value;
                          setSectorView(value);
                          if (selectedSectors.length <= 1) {
                            setSectorTouched(true);
                            setSelectedSectors([value]);
                          }
                        }}
                      >
                        {sectorOptions.map((sector) => (
                          <option key={sector} value={sector}>
                            {sector}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="btn ghost" onClick={addSectorSelection}>
                        Add
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={clearSectorSelection}
                        disabled={selectedSectors.length === 0}
                      >
                        Clear
                      </button>
                      <select
                        className="input input-mini"
                        value={sectorSource}
                        onChange={(e) => setSectorSource(e.target.value as "auto" | "etf" | "sleeve")}
                      >
                        <option value="auto">Auto</option>
                        <option value="etf">ETF</option>
                        <option value="sleeve">Sleeve</option>
                      </select>
                    </>
                  )}
                  <select className="input input-mini" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                    <option>1D</option>
                    <option>5D</option>
                    <option>1M</option>
                    <option>3M</option>
                    <option>MAX</option>
                  </select>
                  <button
                    type="button"
                    className={`btn ghost ${chartShowBench ? "on" : ""}`}
                    onClick={() => setChartShowBench((prev) => !prev)}
                  >
                    {chartShowBench ? "SPX On" : "SPX Off"}
                  </button>
                </div>
                {chartMode === "SECTOR" && selectedSectors.length > 0 && (
                  <div className="chart-filter-row analyze">
                    {selectedSectors.map((sector) => (
                      <button
                        key={sector}
                        type="button"
                        className="chart-chip"
                        onClick={() => removeSectorSelection(sector)}
                        title="Remove sector"
                      >
                        {sector} ×
                      </button>
                    ))}
                  </div>
                )}
                {chartMode === "PORTFOLIO" && accountId === "ALL" && selectedAccounts.length > 0 && (
                  <div className="chart-filter-row analyze">
                    {selectedAccounts.map((name) => (
                      <button
                        key={name}
                        type="button"
                        className="chart-chip"
                        onClick={() => removeAccountSelection(name)}
                        title="Remove account"
                      >
                        {name} ×
                      </button>
                    ))}
                  </div>
                )}
                {sectorEmpty && chartMode === "SECTOR" && (
                  <div className="warning-banner">No sector data yet. Add a sector or check that positions are assigned.</div>
                )}
                <ErrorBoundary fallback={<div className="error-banner">Chart error. Please refresh.</div>}>
                  <PortfolioChart
                    key={`analyze-${chartMode}-${chartShowBench}-${sectorSeriesList.length}`}
                    data={chartData}
                    showSector={chartMode === "SECTOR"}
                    showBench={chartShowBench}
                    sectorSeries={sectorSeriesList}
                    extraSeries={accountId === "ALL" ? accountSeries : []}
                  />
                </ErrorBoundary>
              </div>
            </div>
          )}
        </main>
      </div>

      <div className="statusbar">
        <div>
          {toast ||
            (staticMode
              ? `Connected · Static Mode · ${snapshot?.stamp.asof ?? "—"}`
              : `Connected · Market ${marketConnected ? "Live" : "Offline"} · ${snapshot?.stamp.asof ?? "—"}`)}
        </div>
        <div>Quick Search: /</div>
        <div>Account {accountSummary?.name ?? "—"} · BP {accountSummary?.buyingPower ?? "—"} · Day Trades 0</div>
      </div>

      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button
            type="button"
            onClick={() => {
              setCurrentSymbol(contextMenu.selectSymbol ?? contextMenu.symbol);
              setTab("Monitor");
              setContextMenu(null);
            }}
          >
            Chart
          </button>
          {!staticMode && (
            <button
              type="button"
              onClick={() => {
                setCurrentSymbol(contextMenu.selectSymbol ?? contextMenu.symbol);
                openTrade();
                setContextMenu(null);
              }}
            >
              Trade
            </button>
          )}
          {contextMenu.mode === "positions" && !contextMenu.isStrategySummary && contextMenu.instrumentId && (
            <>
              <button
                type="button"
                onClick={() => {
                  const row =
                    positions.find((p) => p.instrument_id === contextMenu.instrumentId) ||
                    positions.find((p) => p.symbol === contextMenu.symbol);
                  openPositionModal(row);
                  setContextMenu(null);
                }}
              >
                Edit Position
              </button>
              <button
                type="button"
                onClick={() => {
                  removePosition(contextMenu.instrumentId);
                  setContextMenu(null);
                }}
              >
                Remove Position
              </button>
            </>
          )}
          {contextMenu.mode === "watchlist" && (
            <button
              type="button"
              onClick={() => {
                removeWatchSymbol(contextMenu.symbol);
                setContextMenu(null);
              }}
            >
              Remove from Watchlist
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(contextMenu.symbol);
              notify(`Copied ${contextMenu.symbol}`);
              setContextMenu(null);
            }}
          >
            Copy Symbol
          </button>
        </div>
      )}
    </div>
  );
}
