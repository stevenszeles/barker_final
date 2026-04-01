import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "./store";
import type { NavPoint, Position } from "./store";
import { api } from "./services/api";
import PortfolioChart from "./components/PortfolioChart";
import ErrorBoundary from "./components/ErrorBoundary";

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
  "TYD": 320,
  "MAX": 3650,
};

type RiskMetricRow = {
  metric: string;
  value: number;
  limit?: number | null;
  breached?: boolean;
};

type RiskProfilePayload = {
  stamp?: { asof?: string; source?: string; method_version?: string };
  metrics?: RiskMetricRow[];
  correlation?: {
    labels?: string[];
    matrix?: number[][];
    observations?: number;
  };
  rolling?: {
    dates?: string[];
    portfolio_vol_20d?: number[];
    benchmark_vol_20d?: number[];
    tracking_error_20d?: number[];
    drawdown?: number[];
  };
};

type SectorLinePoint = { date: string; sector?: number | null };
type SectorSourceSeries = { sleeve: SectorLinePoint[]; etf: SectorLinePoint[] };
type ChartPrefs = {
  timeframe?: string;
  chartMode?: "PORTFOLIO" | "SECTOR";
  chartShowBench?: boolean;
  selectedAccounts?: string[];
  selectedSectors?: string[];
  sectorShowSleeve?: boolean;
  sectorShowEtf?: boolean;
  sectorShowPortfolio?: boolean;
  accountTouched?: boolean;
  sectorTouched?: boolean;
};

const CHART_PREFS_STORAGE_KEY = "ws_chart_prefs";

function loadChartPrefs(): ChartPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CHART_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return {
      timeframe: typeof parsed.timeframe === "string" ? parsed.timeframe : undefined,
      chartMode: parsed.chartMode === "SECTOR" ? "SECTOR" : parsed.chartMode === "PORTFOLIO" ? "PORTFOLIO" : undefined,
      chartShowBench: typeof parsed.chartShowBench === "boolean" ? parsed.chartShowBench : undefined,
      selectedAccounts: Array.isArray(parsed.selectedAccounts) ? parsed.selectedAccounts.filter((v) => typeof v === "string") : undefined,
      selectedSectors: Array.isArray(parsed.selectedSectors) ? parsed.selectedSectors.filter((v) => typeof v === "string") : undefined,
      sectorShowSleeve: typeof parsed.sectorShowSleeve === "boolean" ? parsed.sectorShowSleeve : undefined,
      sectorShowEtf: typeof parsed.sectorShowEtf === "boolean" ? parsed.sectorShowEtf : undefined,
      sectorShowPortfolio: typeof parsed.sectorShowPortfolio === "boolean" ? parsed.sectorShowPortfolio : undefined,
      accountTouched: typeof parsed.accountTouched === "boolean" ? parsed.accountTouched : undefined,
      sectorTouched: typeof parsed.sectorTouched === "boolean" ? parsed.sectorTouched : undefined,
    };
  } catch {
    return {};
  }
}

function saveChartPrefs(value: ChartPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHART_PREFS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

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

function sparklinePath(values: number[], width = 240, height = 64, pad = 6) {
  const cleaned = values.filter((v) => Number.isFinite(v));
  if (cleaned.length < 2) return "";
  const min = Math.min(...cleaned);
  const max = Math.max(...cleaned);
  const span = Math.max(max - min, 1e-9);
  const step = (width - pad * 2) / Math.max(cleaned.length - 1, 1);
  const points = cleaned.map((v, i) => {
    const x = pad + i * step;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return `${x},${y}`;
  });
  return points.join(" ");
}

function filterPointsByStart<T extends { date: string }>(points: T[], startDate: string) {
  if (!startDate) return points;
  const filtered = points.filter((point) => point.date >= startDate);
  return filtered.length ? filtered : points;
}

function combineAccountNavSeries(
  seriesList: Array<{ name: string; data: NavPoint[] }>,
  benchmarkSource: NavPoint[]
): NavPoint[] {
  if (!seriesList.length) return [];
  const benchmarkMap = new Map<string, number>();
  benchmarkSource.forEach((point) => {
    const bench = Number(point.bench);
    if (point.date && Number.isFinite(bench) && bench > 0) {
      benchmarkMap.set(point.date, bench);
    }
  });

  const normalized = seriesList
    .map((series) => {
      const values = new Map<string, number>();
      let firstDate = "";
      series.data.forEach((point) => {
        const nav = Number(point.nav);
        if (!point.date || !Number.isFinite(nav)) return;
        values.set(point.date, nav);
        if (!firstDate || point.date < firstDate) firstDate = point.date;
        const bench = Number(point.bench);
        if (Number.isFinite(bench) && bench > 0 && !benchmarkMap.has(point.date)) {
          benchmarkMap.set(point.date, bench);
        }
      });
      return { values, firstDate };
    })
    .filter((series) => series.firstDate);

  if (!normalized.length) return [];

  const allDates = Array.from(
    new Set(normalized.flatMap((series) => Array.from(series.values.keys())))
  ).sort();
  const carry = new Array<number | null>(normalized.length).fill(null);
  let lastBench: number | null = null;

  return allDates
    .map((date) => {
      let total = 0;
      let active = 0;
      normalized.forEach((series, idx) => {
        if (date < series.firstDate) return;
        const next = series.values.get(date);
        if (Number.isFinite(next)) {
          carry[idx] = Number(next);
        }
        const current = carry[idx];
        if (Number.isFinite(current)) {
          total += Number(current);
          active += 1;
        }
      });
      const bench = benchmarkMap.get(date);
      if (Number.isFinite(bench) && Number(bench) > 0) {
        lastBench = Number(bench);
      }
      if (!active) return null;
      return {
        date,
        nav: total,
        bench: lastBench ?? 1,
        twr: null,
      };
    })
    .filter((point): point is NavPoint => Boolean(point));
}

export default function App() {
  const initialChartPrefs = loadChartPrefs();
  const [tab, setTab] = useState("Monitor");
  const [showLeft, setShowLeft] = useState(true);
  const [showChart, setShowChart] = useState(true);
  const [currentSymbol, setCurrentSymbol] = useState("AAPL");
  const [timeframe, setTimeframe] = useState(initialChartPrefs.timeframe || "MAX");
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expandedPositionGroups, setExpandedPositionGroups] = useState<Record<string, boolean>>({});
  const navResyncTimerRef = useRef<number | null>(null);
  const [focus, setFocus] = useState<{ left?: string; center?: string }>({});
  const [activeTable, setActiveTable] = useState<"positions" | null>(null);
  const [selectedPosIndex, setSelectedPosIndex] = useState(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    symbol: string;
    selectSymbol?: string;
    mode: "positions";
    instrumentId?: string | null;
    isStrategySummary?: boolean;
  } | null>(null);
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
    owner: "",
    sector: "",
    strategy: "",
  });
  const [cashInput, setCashInput] = useState("");
  const [csvError, setCsvError] = useState("");
  const [benchStart, setBenchStart] = useState("");
  const [resetCash, setResetCash] = useState("");
  const [resetDeleteAccounts, setResetDeleteAccounts] = useState(true);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [riskProfile, setRiskProfile] = useState<RiskProfilePayload | null>(null);
  const [sectorView, setSectorView] = useState(sectorOptions[0]);
  const [sectorSeriesMap, setSectorSeriesMap] = useState<Record<string, SectorSourceSeries>>({});
  const [sectorError, setSectorError] = useState("");
  const [sectorShowSleeve, setSectorShowSleeve] = useState(initialChartPrefs.sectorShowSleeve ?? true);
  const [sectorShowEtf, setSectorShowEtf] = useState(initialChartPrefs.sectorShowEtf ?? true);
  const [sectorShowPortfolio, setSectorShowPortfolio] = useState(initialChartPrefs.sectorShowPortfolio ?? true);
  const [accountSeries, setAccountSeries] = useState<Array<{ name: string; data: any[] }>>([]);
  const [navPasteText, setNavPasteText] = useState("");
  const [navPasteError, setNavPasteError] = useState("");
  const [benchPasteText, setBenchPasteText] = useState("");
  const [benchPasteError, setBenchPasteError] = useState("");
  const [accountView, setAccountView] = useState("");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(initialChartPrefs.selectedAccounts ?? []);
  const [accountTouched, setAccountTouched] = useState(initialChartPrefs.accountTouched ?? false);
  const [chartFull, setChartFull] = useState(false);
  const [chartMode, setChartMode] = useState<"PORTFOLIO" | "SECTOR">(initialChartPrefs.chartMode || "PORTFOLIO");
  const [chartShowBench, setChartShowBench] = useState(initialChartPrefs.chartShowBench ?? true);
  const [selectedSectors, setSelectedSectors] = useState<string[]>(initialChartPrefs.selectedSectors ?? []);
  const [sectorTouched, setSectorTouched] = useState(initialChartPrefs.sectorTouched ?? false);
  const [optionPreview, setOptionPreview] = useState<{ net: number; legs: number } | null>(null);
  const [activityClosedOnly, setActivityClosedOnly] = useState(true);
  const [tradeRealizedDrafts, setTradeRealizedDrafts] = useState<Record<string, string>>({});
  const [sectorReloadKey, setSectorReloadKey] = useState(0);
  const [sectorPerfAccount, setSectorPerfAccount] = useState("");
  const [sectorPerfSector, setSectorPerfSector] = useState(sectorOptions[0]);
  const [sectorPerfBaseline, setSectorPerfBaseline] = useState("");
  const [sectorPerfTargetWeight, setSectorPerfTargetWeight] = useState("");
  const [sectorPerfRows, setSectorPerfRows] = useState<Array<{
    sector: string;
    baseline_value?: number | null;
    target_weight?: number | null;
  }>>([]);

  const {
    snapshot,
    nav,
    risk,
    blotter,
    status,
    accounts,
    account: accountId,
    setAccount,
    fetchAccounts,
    quotes,
    marketConnected,
    connectMarketStream,
    fetchQuotes,
    fetchSnapshot,
    fetchStatus,
    fetchRisk,
    fetchBlotter,
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
    let base = NAV_LIMITS[timeframe] ?? 120;
    if (timeframe === "TYD") {
      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const days = Math.ceil((now.getTime() - yearStart.getTime()) / 86400000) + 5;
      base = Math.max(base, days);
    }
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
    if (portfolioStatus && !portfolioStatus.ok) flags.push("PORTFOLIO STALE");
    if (market && !market.ok) flags.push("MARKET STALE");
    if (flags.length) return flags.join(" · ");
    if (!portfolioStatus) return "OK";
    return `OK · ${portfolioStatus.asof}`;
  }, [status, staticMode]);

  const statusTone = useMemo(() => {
    if (toast) return "warn";
    if (statusLine.includes("STALE")) return "stale";
    return "live";
  }, [statusLine, toast]);

  const dataTone = useMemo(() => {
    if (portfolioStatus.source === "demo") return "warn";
    return portfolioStatus.ok ? "live" : "stale";
  }, [portfolioStatus.ok, portfolioStatus.source]);

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
    if (tab !== "Risk") return;
    let active = true;
    const run = async () => {
      try {
        const resp = await api.get<RiskProfilePayload>("/risk/profile");
        if (active) setRiskProfile(resp.data ?? null);
      } catch {
        if (active) setRiskProfile(null);
      }
    };
    run();
    const timer = setInterval(run, 45000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [tab, accountId]);

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
    saveChartPrefs({
      timeframe,
      chartMode,
      chartShowBench,
      selectedAccounts,
      selectedSectors,
      sectorShowSleeve,
      sectorShowEtf,
      sectorShowPortfolio,
      accountTouched,
      sectorTouched,
    });
  }, [
    timeframe,
    chartMode,
    chartShowBench,
    selectedAccounts,
    selectedSectors,
    sectorShowSleeve,
    sectorShowEtf,
    sectorShowPortfolio,
    accountTouched,
    sectorTouched,
  ]);


  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    return () => {
      if (navResyncTimerRef.current) {
        window.clearTimeout(navResyncTimerRef.current);
        navResyncTimerRef.current = null;
      }
    };
  }, []);
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
        setSectorSeriesMap({});
        setSectorError("");
        return;
      }
      const enabledSources: Array<"sleeve" | "etf"> = [];
      const guardErrors: string[] = [];
      const sleeveAllowed = Boolean(accountId && accountId !== "ALL");
      if (sectorShowSleeve) {
        if (sleeveAllowed) {
          enabledSources.push("sleeve");
        } else {
          guardErrors.push("Sleeve sectors are account-scoped. Select one account to chart sleeve returns.");
        }
      }
      if (sectorShowEtf) enabledSources.push("etf");
      if (!enabledSources.length) {
        setSectorSeriesMap({});
        setSectorError(guardErrors.join(" · "));
        return;
      }
      try {
        const accountParam = accountId && accountId !== "ALL" ? `&account=${encodeURIComponent(accountId)}` : "";
        const jobs = targets.flatMap((sector) =>
          enabledSources.map((source) => ({
            sector,
            source,
            url: `/portfolio/sector?sector=${encodeURIComponent(sector)}&limit=${navLimit}&source=${source}${accountParam}`,
          }))
        );
        const settled = await Promise.allSettled(jobs.map((job) => api.get(job.url)));
        if (!active) return;
        const nextMap: Record<string, SectorSourceSeries> = {};
        targets.forEach((sector) => {
          nextMap[sector] = { sleeve: [], etf: [] };
        });
        const errors: string[] = [...guardErrors];
        settled.forEach((result, idx) => {
          const job = jobs[idx];
          if (result.status === "fulfilled") {
            nextMap[job.sector][job.source] = result.value.data ?? [];
            return;
          }
          const detail = (result.reason as any)?.response?.data?.detail ?? (result.reason as any)?.message ?? "Unavailable";
          errors.push(`${job.sector} ${job.source.toUpperCase()}: ${detail}`);
        });
        setSectorSeriesMap(nextMap);
        setSectorError(errors.join(" · "));
      } catch (err: any) {
        if (!active) return;
        setSectorSeriesMap({});
        setSectorError(err?.response?.data?.detail ?? "Sector series unavailable");
      }
    };
    loadSectors();
    return () => {
      active = false;
    };
  }, [selectedSectors, sectorView, navLimit, chartMode, accountId, sectorShowSleeve, sectorShowEtf, sectorTouched, sectorReloadKey]);

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
    const grouped = new Map<string, Position[]>();
    const order: string[] = [];
    positions.forEach((row) => {
      const parsed = row.symbol ? parseOsiSymbol(String(row.symbol)) : null;
      const underlying = String(row.underlying || parsed?.underlying || row.symbol || "")
        .trim()
        .toUpperCase();
      if (!underlying) return;
      const accountKey = accountId === "ALL" ? String(row.account || "ALL").trim().toUpperCase() : "";
      const groupKey = `${accountKey}::${underlying}`;
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, []);
        order.push(groupKey);
      }
      grouped.get(groupKey)?.push(row);
    });

    const flat: any[] = [];
    order.forEach((groupKey) => {
      const rows = [...(grouped.get(groupKey) || [])];
      if (!rows.length) return;
      rows.sort((a, b) => {
        const assetRank = (value: Position) => {
          const asset = String(value.asset_class || "").toLowerCase();
          if (asset === "equity") return 0;
          if (asset === "future") return 1;
          if (asset === "option") return 2;
          return 3;
        };
        const rankDiff = assetRank(a) - assetRank(b);
        if (rankDiff !== 0) return rankDiff;
        const expiryA = String(a.expiry || "");
        const expiryB = String(b.expiry || "");
        if (expiryA !== expiryB) return expiryA.localeCompare(expiryB);
        const strikeA = Number(a.strike || 0);
        const strikeB = Number(b.strike || 0);
        if (strikeA !== strikeB) return strikeA - strikeB;
        return String(a.symbol || "").localeCompare(String(b.symbol || ""));
      });

      const first = rows[0];
      const underlying = String(first.underlying || parseOsiSymbol(String(first.symbol || ""))?.underlying || first.symbol || "")
        .trim()
        .toUpperCase();
      const accountName = String(first.account || "").trim();
      const stockCount = rows.filter((row) => String(row.asset_class || "").toLowerCase() === "equity").length;
      const futureCount = rows.filter((row) => String(row.asset_class || "").toLowerCase() === "future").length;
      const optionCount = rows.filter((row) => String(row.asset_class || "").toLowerCase() === "option").length;
      const needsGroup = rows.length > 1;
      const expanded = Boolean(expandedPositionGroups[groupKey]);
      const selectSymbol = underlying || String(first.symbol || "").toUpperCase();
      const owners = Array.from(new Set(rows.map((row) => String(row.owner || "").trim()).filter(Boolean)));
      const sectors = Array.from(new Set(rows.map((row) => String(row.sector || "").trim()).filter(Boolean)));
      const stockLikeRows = rows.filter((row) => {
        const asset = String(row.asset_class || "").toLowerCase();
        return asset === "equity" || asset === "future";
      });
      const primaryRow = stockLikeRows.length === 1 ? stockLikeRows[0] : null;
      const typeParts: string[] = [];
      if (stockCount) typeParts.push(stockCount === 1 ? "Stock" : `${stockCount} Stocks`);
      if (futureCount) typeParts.push(futureCount === 1 ? "Future" : `${futureCount} Futures`);
      if (optionCount) typeParts.push(optionCount === 1 ? "Option" : `${optionCount} Options`);
      const groupType = [accountId === "ALL" && accountName ? accountName : "", typeParts.join(" · ")]
        .filter(Boolean)
        .join(" · ");

      if (!needsGroup) {
        const row = rows[0];
        const asset = String(row.asset_class || "").toLowerCase();
        const optionParsed = row.symbol ? parseOsiSymbol(String(row.symbol)) : null;
        const isOptionSymbol = asset === "option" || Boolean(optionParsed);
        const displaySymbol =
          isOptionSymbol && row.symbol && !optionParsed
            ? buildOsiSymbol(
                row.underlying ?? row.symbol,
                row.expiry ? normalizeExpiryInput(String(row.expiry)) : "",
                row.option_type?.toString().startsWith("P") ? "P" : "C",
                row.strike ?? 0
              ) || row.symbol
            : row.symbol;
        const baseType = row.asset_class ? String(row.asset_class).toUpperCase() : "—";
        const withSide = Number(row.qty || 0) < 0 ? `${baseType} SHORT` : baseType;
        flat.push({
          kind: "position",
          key: row.instrument_id ?? `${groupKey}-${row.symbol}`,
          groupKey,
          row,
          selectSymbol: isOptionSymbol && row.underlying ? row.underlying : row.symbol,
          displaySymbol,
          typeDisplay:
            accountId === "ALL" && accountName ? `${withSide} · ${accountName}` : withSide,
          child: false,
        });
        return;
      }

      flat.push({
        kind: "group",
        key: `group-${groupKey}`,
        groupKey,
        expanded,
        symbol: underlying,
        selectSymbol,
        typeDisplay: groupType || `${rows.length} Legs`,
        qtyDisplay: primaryRow && optionCount === 0 ? formatNumber(Number(primaryRow.qty || 0)) : "—",
        avgDisplay: primaryRow && Number.isFinite(Number(primaryRow.avg_cost)) ? formatNumber(Number(primaryRow.avg_cost || 0)) : "—",
        lastDisplay: primaryRow && Number.isFinite(Number(primaryRow.price)) ? formatNumber(Number(primaryRow.price || 0)) : "—",
        dayPnl: rows.reduce((sum, row) => sum + safeNumber(row.day_pnl), 0),
        totalPnl: rows.reduce((sum, row) => sum + safeNumber(row.total_pnl), 0),
        marketValue: rows.reduce((sum, row) => sum + safeNumber(row.market_value), 0),
        ownerDisplay: owners.length === 1 ? owners[0] : owners.length > 1 ? "Multiple" : "—",
        sectorDisplay: sectors.length === 1 ? sectors[0] : sectors.length > 1 ? "Multiple" : "—",
      });

      if (!expanded) return;
      rows.forEach((row) => {
        const asset = String(row.asset_class || "").toLowerCase();
        const optionParsed = row.symbol ? parseOsiSymbol(String(row.symbol)) : null;
        const isOptionSymbol = asset === "option" || Boolean(optionParsed);
        const displaySymbol =
          isOptionSymbol && row.symbol && !optionParsed
            ? buildOsiSymbol(
                row.underlying ?? row.symbol,
                row.expiry ? normalizeExpiryInput(String(row.expiry)) : "",
                row.option_type?.toString().startsWith("P") ? "P" : "C",
                row.strike ?? 0
              ) || row.symbol
            : row.symbol;
        const baseType = row.asset_class ? String(row.asset_class).toUpperCase() : "—";
        const withSide = Number(row.qty || 0) < 0 ? `${baseType} SHORT` : baseType;
        flat.push({
          kind: "position",
          key: row.instrument_id ?? `${groupKey}-${row.symbol}`,
          groupKey,
          row,
          selectSymbol: isOptionSymbol && row.underlying ? row.underlying : row.symbol,
          displaySymbol,
          typeDisplay:
            accountId === "ALL" && accountName ? `${withSide} · ${accountName}` : withSide,
          child: true,
        });
      });
    });
    return flat;
  }, [positions, accountId, expandedPositionGroups]);

  useEffect(() => {
    setExpandedPositionGroups((prev) => {
      const valid = new Set(
        positions.map((row) => {
          const parsed = row.symbol ? parseOsiSymbol(String(row.symbol)) : null;
          const underlying = String(row.underlying || parsed?.underlying || row.symbol || "")
            .trim()
            .toUpperCase();
          const accountKey = accountId === "ALL" ? String(row.account || "ALL").trim().toUpperCase() : "";
          return `${accountKey}::${underlying}`;
        })
      );
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (valid.has(key)) next[key] = value;
      });
      return next;
    });
  }, [positions, accountId]);

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

  const timeframeStart = useMemo(() => {
    if (timeframe !== "TYD") return "";
    const year = new Date().getFullYear();
    return `${year}-01-01`;
  }, [timeframe]);

  const chartStart = useMemo(() => {
    const starts = [benchStart, timeframeStart].filter(Boolean).sort();
    return starts.length ? starts[starts.length - 1] : "";
  }, [benchStart, timeframeStart]);

  const navFiltered = useMemo(() => {
    if (!chartStart) return nav;
    const filtered = nav.filter((point) => point.date >= chartStart);
    return filtered.length ? filtered : nav;
  }, [nav, chartStart]);

  const allAccountsPortfolioMode = chartMode === "PORTFOLIO" && accountId === "ALL";
  const selectedAccountSeries = useMemo(
    () => accountSeries.filter((series) => selectedAccounts.includes(series.name)),
    [accountSeries, selectedAccounts]
  );
  const allSelectedIncludesTotal = selectedAccounts.includes("ALL");
  const selectedAccountAggregateData = useMemo(() => {
    if (!allAccountsPortfolioMode || selectedAccounts.length === 0) {
      return navFiltered;
    }
    const totalSeries = selectedAccountSeries.find((series) => series.name === "ALL");
    if (allSelectedIncludesTotal && totalSeries) {
      return filterPointsByStart(totalSeries.data, chartStart);
    }
    const componentSeries = selectedAccountSeries.filter((series) => series.name !== "ALL");
    return filterPointsByStart(combineAccountNavSeries(componentSeries, navFiltered), chartStart);
  }, [allAccountsPortfolioMode, selectedAccounts, selectedAccountSeries, navFiltered, chartStart, allSelectedIncludesTotal]);
  const chartData = useMemo(
    () => (allAccountsPortfolioMode ? selectedAccountAggregateData : navFiltered),
    [allAccountsPortfolioMode, selectedAccountAggregateData, navFiltered]
  );
  const chartNeedsAccountSelection = allAccountsPortfolioMode && selectedAccounts.length === 0;
  const chartNeedsSelection = chartMode === "SECTOR" && !sectorShowPortfolio && !chartShowBench && !sectorShowSleeve && !sectorShowEtf;
  const chartShowNav =
    chartMode === "SECTOR"
      ? sectorShowPortfolio
      : (!allAccountsPortfolioMode || selectedAccounts.length > 0);
  const chartShowBenchEffective =
    chartMode === "SECTOR"
      ? chartShowBench
      : chartShowBench && (!allAccountsPortfolioMode || selectedAccounts.length > 0);
  const chartExtraSeries = allAccountsPortfolioMode
    ? selectedAccountSeries
        .filter((series) => series.name !== "ALL")
        .filter((series) => allSelectedIncludesTotal || selectedAccounts.length > 1)
        .map((series) => ({
          ...series,
          data: filterPointsByStart(series.data, chartStart),
        }))
    : [];
  const chartEmptyMessage = chartNeedsAccountSelection
    ? "Select one or more accounts and click Add to chart."
    : chartNeedsSelection
      ? "Enable at least one series (Sleeve, ETF, Portfolio, or SPX)."
      : undefined;

  const sectorSeriesList = useMemo(() => {
    if (chartMode !== "SECTOR") return [];
    const names = selectedSectors.length
      ? selectedSectors
      : !sectorTouched && sectorView
        ? [sectorView]
        : [];
    const base = chartData;
    const out: Array<{ name: string; data: any[] }> = [];
    names.forEach((name) => {
      const bySource = sectorSeriesMap[name] ?? { sleeve: [], etf: [] };
      if (sectorShowSleeve) {
        const filtered = chartStart ? bySource.sleeve.filter((point: any) => point.date >= chartStart) : bySource.sleeve;
        const data = filtered.length ? filtered : base.map((point: any) => ({ ...point, sector: 0 }));
        out.push({ name: `${name} Sleeve`, data });
      }
      if (sectorShowEtf) {
        const filtered = chartStart ? bySource.etf.filter((point: any) => point.date >= chartStart) : bySource.etf;
        const data = filtered.length ? filtered : base.map((point: any) => ({ ...point, sector: 0 }));
        out.push({ name: `${name} ETF`, data });
      }
    });
    return out;
  }, [
    chartMode,
    sectorSeriesMap,
    chartStart,
    sectorView,
    selectedSectors,
    sectorTouched,
    chartData,
    sectorShowSleeve,
    sectorShowEtf,
  ]);

  const sectorEmpty = useMemo(() => {
    if (chartMode !== "SECTOR") return false;
    if (!sectorShowSleeve && !sectorShowEtf) return false;
    if (!sectorSeriesList.length) return true;
    return sectorSeriesList.every((series) => !series.data?.length);
  }, [chartMode, sectorSeriesList, sectorShowSleeve, sectorShowEtf]);

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

  const scheduleNavResync = (durationMs = 180000, intervalMs = 10000) => {
    if (navResyncTimerRef.current) {
      window.clearTimeout(navResyncTimerRef.current);
      navResyncTimerRef.current = null;
    }
    const deadline = Date.now() + durationMs;
    const tick = () => {
      fetchNav(navLimit);
      if (Date.now() + intervalMs > deadline) {
        navResyncTimerRef.current = null;
        return;
      }
      navResyncTimerRef.current = window.setTimeout(tick, intervalMs);
    };
    tick();
  };

  const refreshPortfolioViews = async (includeAccounts = false) => {
    if (includeAccounts) {
      await fetchAccounts();
    }
    await Promise.allSettled([refreshAll(), fetchNav(navLimit)]);
  };

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
    const names = accounts
      .map((row) => row.account)
      .filter(Boolean)
      .filter((name) => name.toUpperCase() !== "ALL");
    const unique = Array.from(new Set(names));
    return ["ALL", ...unique];
  }, [accounts]);

  const accountSpecificOptions = useMemo(
    () => accountChartOptions.filter((name) => name && name.toUpperCase() !== "ALL"),
    [accountChartOptions]
  );

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
    if (!accountSpecificOptions.length) {
      setSectorPerfAccount("");
      setSectorPerfRows([]);
      return;
    }
    if (accountId && accountId !== "ALL" && accountSpecificOptions.includes(accountId)) {
      setSectorPerfAccount(accountId);
      return;
    }
    if (!sectorPerfAccount || !accountSpecificOptions.includes(sectorPerfAccount)) {
      setSectorPerfAccount(accountSpecificOptions[0]);
    }
  }, [accountId, accountSpecificOptions, sectorPerfAccount]);

  const loadSectorPerformanceInputs = async (accountName: string) => {
    if (!accountName || accountName === "ALL") {
      setSectorPerfRows([]);
      return;
    }
    try {
      const resp = await api.get("/admin/sector-performance-inputs", {
        params: { account: accountName },
      });
      const rows = Array.isArray(resp.data?.rows) ? resp.data.rows : [];
      setSectorPerfRows(rows);
    } catch {
      setSectorPerfRows([]);
    }
  };

  useEffect(() => {
    if (!sectorPerfAccount) return;
    loadSectorPerformanceInputs(sectorPerfAccount);
  }, [sectorPerfAccount]);

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
            const resp = await api.get<NavPoint[]>("/portfolio/nav", {
              params: {
                limit: navLimit,
                account: name,
                _ts: Date.now(),
              },
              headers: { "Cache-Control": "no-cache" },
            });
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
  }, [accountId, accountChartOptions, navLimit, selectedAccounts, nav]);

  const riskMetricMap = useMemo(() => {
    const map = new Map<string, { metric: string; value: number; limit?: number | null; breached?: boolean }>();
    const source = (riskProfile?.metrics && riskProfile.metrics.length ? riskProfile.metrics : risk?.metrics) ?? [];
    source.forEach((row) => {
      map.set(row.metric, row);
    });
    return map;
  }, [risk, riskProfile]);

  const formatRiskValue = (metric: string, value: number) => {
    if (!Number.isFinite(value)) return "—";
    if (
      metric.includes("concentration") ||
      metric.includes("drawdown") ||
      metric.startsWith("matrix_") ||
      metric.includes("volatility") ||
      metric.endsWith("_pct") ||
      metric === "annualized_return" ||
      metric === "tracking_error" ||
      metric === "win_rate" ||
      metric === "best_day_return" ||
      metric === "worst_day_return"
    ) {
      return formatSignedPct(value * 100, 2);
    }
    if (
      metric === "beta" ||
      metric === "delta" ||
      metric === "sharpe" ||
      metric === "sortino" ||
      metric === "calmar" ||
      metric === "benchmark_correlation" ||
      metric === "information_ratio"
    ) {
      return formatSignedNumber(value, 2);
    }
    if (metric.includes("exposure") || metric.includes("notional") || metric === "var_95") {
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
      "benchmark_correlation",
      "sharpe",
      "sortino",
      "calmar",
      "annualized_return",
      "annualized_volatility",
      "downside_volatility",
      "max_drawdown",
      "current_drawdown",
      "var_95",
      "var_95_pct",
      "cvar_95_pct",
      "tracking_error",
      "information_ratio",
      "win_rate",
      "best_day_return",
      "worst_day_return",
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
    benchmark_correlation: "Correlation vs SPX",
    sharpe: "Sharpe Ratio",
    sortino: "Sortino Ratio",
    calmar: "Calmar Ratio",
    annualized_return: "Annualized Return",
    annualized_volatility: "Annualized Volatility",
    downside_volatility: "Downside Volatility",
    max_drawdown: "Max Drawdown",
    current_drawdown: "Current Drawdown",
    var_95: "VaR (95%)",
    var_95_pct: "VaR (95%) %",
    cvar_95_pct: "CVaR (95%) %",
    tracking_error: "Tracking Error",
    information_ratio: "Information Ratio",
    win_rate: "Win Rate",
    best_day_return: "Best Day",
    worst_day_return: "Worst Day",
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

  const riskCorrelation = riskProfile?.correlation;
  const riskRolling = riskProfile?.rolling;
  const correlationLabels = riskCorrelation?.labels ?? [];
  const correlationMatrix = riskCorrelation?.matrix ?? [];
  const rollingLatest = useMemo(() => {
    const idx = (riskRolling?.dates?.length ?? 0) - 1;
    if (!riskRolling || idx < 0) {
      return {
        date: "—",
        portfolioVol: 0,
        benchVol: 0,
        trackingError: 0,
        drawdown: 0,
      };
    }
    return {
      date: riskRolling.dates?.[idx] ?? "—",
      portfolioVol: Number(riskRolling.portfolio_vol_20d?.[idx] ?? 0),
      benchVol: Number(riskRolling.benchmark_vol_20d?.[idx] ?? 0),
      trackingError: Number(riskRolling.tracking_error_20d?.[idx] ?? 0),
      drawdown: Number(riskRolling.drawdown?.[idx] ?? 0),
    };
  }, [riskRolling]);
  const riskVisualCards = useMemo(() => {
    const cards = [
      {
        key: "annualized_volatility",
        label: "Portfolio Vol",
        value: Number(riskMetricMap.get("annualized_volatility")?.value ?? 0),
        cap: 0.5,
      },
      {
        key: "current_drawdown",
        label: "Current Drawdown",
        value: Number(riskMetricMap.get("current_drawdown")?.value ?? rollingLatest.drawdown ?? 0),
        cap: 0.3,
      },
      {
        key: "var_95_pct",
        label: "1-Day VaR (95%)",
        value: Number(riskMetricMap.get("var_95_pct")?.value ?? 0),
        cap: 0.08,
      },
      {
        key: "beta",
        label: "Beta vs SPX",
        value: Number(riskMetricMap.get("beta")?.value ?? 0),
        cap: 2.0,
      },
    ];
    return cards.map((card) => {
      const ratio = Math.max(0, Math.min(1, Math.abs(card.value) / Math.max(card.cap, 1e-9)));
      return {
        ...card,
        display: formatRiskValue(card.key, card.value),
        ratio,
      };
    });
  }, [riskMetricMap, rollingLatest, formatRiskValue]);
  const riskSparkSeries = useMemo(() => {
    const pVol = (riskRolling?.portfolio_vol_20d ?? []).map((v) => Number(v ?? 0));
    const te = (riskRolling?.tracking_error_20d ?? []).map((v) => Number(v ?? 0));
    const dd = (riskRolling?.drawdown ?? []).map((v) => Number(v ?? 0));
    return [
      {
        key: "pvol",
        label: "Portfolio Volatility (20D)",
        metric: "annualized_volatility",
        values: pVol,
        latest: pVol.length ? pVol[pVol.length - 1] : 0,
      },
      {
        key: "te",
        label: "Tracking Error (20D)",
        metric: "tracking_error",
        values: te,
        latest: te.length ? te[te.length - 1] : 0,
      },
      {
        key: "dd",
        label: "Drawdown",
        metric: "current_drawdown",
        values: dd,
        latest: dd.length ? dd[dd.length - 1] : 0,
      },
    ];
  }, [riskRolling]);
  const correlationCellStyle = (value: number) => {
    const v = Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
    const intensity = Math.abs(v);
    const hue = v >= 0 ? 145 : 2;
    const saturation = 66 + intensity * 18;
    const lightness = 20 + intensity * 18;
    const alpha = 0.2 + intensity * 0.75;
    return {
      backgroundColor: `hsla(${hue}, ${saturation.toFixed(0)}%, ${lightness.toFixed(0)}%, ${alpha.toFixed(3)})`,
      color: intensity > 0.58 ? "#f5f8ff" : "#d7dce2",
      fontWeight: intensity > 0.75 ? 700 : 600,
    } as const;
  };

  const activityTrades = useMemo(() => {
    const rows = blotter?.trades ?? [];
    if (!activityClosedOnly) return rows;
    return rows.filter((row) => {
      const source = String(row.source || "").toUpperCase();
      const status = String(row.status || "").toUpperCase();
      return (
        source === "CSV_REALIZED" ||
        row.realized_pl != null ||
        status.includes("CLOSE") ||
        status.includes("EXPIRE")
      );
    });
  }, [blotter, activityClosedOnly]);


  const notify = (message: string) => setToast(message);
  const resolveRowAccount = (row: any, action: string): string | null => {
    if (accountId && accountId !== "ALL") return accountId;
    const rowAccount = String(row?.account || "").trim();
    if (rowAccount && rowAccount.toUpperCase() !== "ALL") return rowAccount;
    const msg = `Select a specific account (not ALL) to ${action}.`;
    notify(msg);
    return null;
  };
  const requireAccount = (action: string, setError?: (message: string) => void) => {
    if (!accountId || accountId === "ALL") {
      const msg = `Select a specific account (not ALL) to ${action}.`;
      if (setError) setError(msg);
      notify(msg);
      return null;
    }
    return accountId;
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

  const toggleFocus = (column: "left" | "center", key: string) => {
    setFocus((prev) => ({ ...prev, [column]: prev[column] === key ? undefined : key }));
  };

  const showPanel = (column: "left" | "center", key: string) => !focus[column] || focus[column] === key;

  const resetLayout = () => {
    setCollapsed({});
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
        owner: position.owner ?? "",
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
        owner: "",
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
      owner: positionForm.owner || undefined,
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
    const row =
      positions.find((p) => p.instrument_id === instrumentId) ||
      positions.find((p) => p.symbol === instrumentId);
    const account = resolveRowAccount(row, "remove positions") || requireAccount("remove positions");
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
    const account = resolveRowAccount(row, "update positions");
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
    const account = resolveRowAccount(row, "update positions");
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
      notify(`Label updated: ${trimmed || "Unassigned"}`);
    } catch (err: any) {
      notify(err?.response?.data?.detail ?? "Failed to update label");
    }
  };

  const updatePositionEntryDate = async (row: any, value: string) => {
    if (!row?.instrument_id) {
      notify("Missing instrument id.");
      return;
    }
    const account = resolveRowAccount(row, "update positions");
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
      await api.post("/admin/reset", {
        start_cash: value,
        delete_accounts: resetDeleteAccounts,
      });
      setAccount("ALL");
      setAccountView("");
      setSelectedAccounts([]);
      await fetchAccounts();
      await refreshAll();
      await fetchNav(navLimit);
      notify(`Portfolio reset complete (${resetDeleteAccounts ? "accounts deleted" : "accounts kept"})`);
    } catch (err: any) {
      notify(err?.response?.data?.detail ?? "Reset failed");
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

  const updateTradeSectorRow = async (tradeId: string, sector: string) => {
    if (!tradeId) {
      notify("Cannot update this row: missing trade id. Re-import realized activity for this account.");
      return;
    }
    const sectorValue = (sector || "").trim() || "Unassigned";
    try {
      await api.post("/admin/trades/update-sector", { trade_id: tradeId, sector: sectorValue });
      setSectorReloadKey((prev) => prev + 1);
      await fetchBlotter();
      notify(`Trade sector set to ${sectorValue}.`);
    } catch (err: any) {
      notify(err?.response?.data?.detail ?? "Failed to update trade sector");
    }
  };

  const commitTradeRealizedRow = async (tradeId: string) => {
    if (!tradeId) return;
    const raw = (tradeRealizedDrafts[tradeId] ?? "").trim();
    let realizedValue: number | null = null;
    if (raw) {
      const parsed = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(parsed)) {
        notify("Realized P/L must be a valid number.");
        return;
      }
      realizedValue = parsed;
    }
    try {
      await api.post("/admin/trades/update-realized", { trade_id: tradeId, realized_pl: realizedValue });
      setTradeRealizedDrafts((prev) => {
        const next = { ...prev };
        delete next[tradeId];
        return next;
      });
      setSectorReloadKey((prev) => prev + 1);
      refreshAll();
      fetchBlotter();
      notify("Realized P/L updated.");
    } catch (err: any) {
      notify(err?.response?.data?.detail ?? "Failed to update realized P/L");
    }
  };

  const saveSectorPerformanceInput = async () => {
    if (!sectorPerfAccount || sectorPerfAccount === "ALL") {
      notify("Select a specific account for sector performance inputs.");
      return;
    }
    const sector = (sectorPerfSector || "").trim();
    if (!sector) {
      notify("Select a sector.");
      return;
    }
    const baselineRaw = sectorPerfBaseline.trim();
    const targetRaw = sectorPerfTargetWeight.trim();
    const baselineValue = baselineRaw ? Number(baselineRaw.replace(/,/g, "")) : null;
    const targetWeight = targetRaw ? Number(targetRaw.replace(/,/g, "")) : null;
    if (baselineValue != null && (!Number.isFinite(baselineValue) || baselineValue < 0)) {
      notify("Baseline must be a number >= 0.");
      return;
    }
    if (targetWeight != null && (!Number.isFinite(targetWeight) || targetWeight < -100 || targetWeight > 100)) {
      notify("Target weight must be between -100 and 100.");
      return;
    }
    try {
      await api.post("/admin/sector-performance-inputs", {
        account: sectorPerfAccount,
        sector,
        baseline_value: baselineValue,
        target_weight: targetWeight,
      });
      await loadSectorPerformanceInputs(sectorPerfAccount);
      setSectorReloadKey((prev) => prev + 1);
      notify(`Saved sector inputs for ${sector}.`);
    } catch (err: any) {
      notify(err?.response?.data?.detail ?? "Failed to save sector inputs");
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
    const textLower = stripBom(text).toLowerCase();
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
    const filenameLower = (file?.name || "").toLowerCase();
    const isBalanceFilename = filenameLower.includes("balance");
    const dateIdx = headerRow.indexOf("date");
    const amountIdx = headerRow.indexOf("amount");
    const hasDateAmountHeader = dateIdx >= 0 && amountIdx >= 0;
    const hasBalancesMarker = firstRows.some((rowText) => rowText.includes("balances for"));
    const isBalancesReport =
      isBalanceFilename ||
      hasBalancesMarker ||
      firstRows.some((rowText) => rowText.includes("balances for all-accounts") || rowText.includes("balances for all accounts")) ||
      firstRows.some((rowText) => rowText.includes("total accounts value") && rowText.includes("cash & cash investments total")) ||
      (filenameLower.includes("balances") && hasDateAmountHeader);
    const isBalanceHistoryCsv =
      hasDateAmountHeader &&
      rawRows.length >= 3 &&
      rawRows.slice(1, Math.min(rawRows.length, 20)).some((row) => {
        if (dateIdx >= row.length || amountIdx >= row.length) return false;
        const dateText = stripBom(row[dateIdx] || "").trim();
        const amountText = stripBom(row[amountIdx] || "").trim();
        if (!dateText || !amountText) return false;
        const normalizedDate = dateText.replace(/^"|"$/g, "");
        const normalizedAmount = amountText
          .replace(/^"|"$/g, "")
          .replace(/\$/g, "")
          .replace(/,/g, "")
          .replace(/\(/g, "-")
          .replace(/\)/g, "")
          .trim();
        const looksLikeDate = /^(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})$/.test(normalizedDate);
        const looksLikeAmount = /^-?\d+(\.\d+)?$/.test(normalizedAmount);
        return looksLikeDate && looksLikeAmount;
      });
    const isAccountStatement = firstRows.some((rowText) => rowText.includes("account statement"));
    const isRealizedGainLossReport =
      textLower.includes("realized gain/loss - lot details") ||
      firstRows.some((rowText) => rowText.includes("realized gain/loss - lot details")) ||
      filenameLower.includes("gainloss_realized");
    const isSchwabPositionsFilename = /positions[_-]\d{4}[-_]\d{2}[-_]\d{2}/.test(filenameLower);
    const hasPositionsHeader = rawRows.slice(0, 40).some((row) => {
      const cols = row.map((cell) => stripBom(cell || "").toLowerCase().trim());
      if (!cols.length) return false;
      const hasSymbol = cols.includes("symbol");
      const hasQty = cols.some((cell) => cell === "qty" || cell.includes("qty (quantity)"));
      const hasSecurityType = cols.some((cell) => cell.includes("security type"));
      return hasSymbol && hasQty && hasSecurityType;
    });
    const looksLikeSchwabPositionsDump =
      textLower.includes("positions for custaccs") ||
      isSchwabPositionsFilename ||
      hasPositionsHeader;
    const isAllAccountsPositionsReport =
      looksLikeSchwabPositionsDump &&
      (
        filenameLower.includes("all-accounts") ||
        filenameLower.includes("all_accounts") ||
        textLower.includes("positions for custaccs") ||
        firstRows.some((rowText) => rowText.includes("positions for custaccs"))
      );
    const isPositionsReport =
      (!isBalancesReport && looksLikeSchwabPositionsDump) ||
      firstRows.some((rowText) => rowText.includes("positions for") || rowText.includes("custaccs")) ||
      (!isBalancesReport && filenameLower.includes("positions"));
    if (isBalancesReport || isBalanceHistoryCsv) {
      try {
        setToast("Importing balances CSV...");
        const form = new FormData();
        form.append("file", file);
        const accountParam =
          accountId && accountId.trim() && accountId !== "ALL"
            ? `?account=${encodeURIComponent(accountId)}`
            : "";
        const resp = await api.post(`/admin/import-balances${accountParam}`, form, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120000,
        });
        const historyPoints = Number(resp.data?.history_points ?? 0);
        const updated = resp.data?.accounts_updated ?? 0;
        const adjustmentMode = String(resp.data?.history_adjustment_mode || "").toLowerCase();
        const rebuildStatus = String(resp.data?.nav_rebuild || "").toLowerCase();
        await refreshPortfolioViews(true);
        if (historyPoints > 0) {
          const target = String(resp.data?.account || accountId || "account");
          const modeLabel = adjustmentMode ? ` (${adjustmentMode} cash-flow mode)` : "";
          if (rebuildStatus === "queued") scheduleNavResync();
          notify(`Imported ${historyPoints} historical balance points for ${target}${modeLabel}.`);
        } else {
          notify(`Imported balances for ${updated} accounts.`);
        }
        return;
      } catch (err: any) {
        const detail = err?.response?.data?.detail ?? err?.message ?? "CSV import failed";
        setCsvError(detail);
        setToast(detail);
        return;
      }
    }
    if (isPositionsReport) {
      const account = isAllAccountsPositionsReport
        ? "ALL"
        : accountId && accountId.trim()
          ? accountId
          : "ALL";
      try {
        setToast("Importing positions CSV...");
        const form = new FormData();
        form.append("file", file);
        const resp = await api.post(`/admin/import-positions?account=${encodeURIComponent(account)}`, form, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 300000,
        });
        const count = resp.data?.positions_count ?? resp.data?.count ?? 0;
        const importedAccounts = Array.isArray(resp.data?.accounts) ? resp.data.accounts.length : null;
        fetchAccounts();
        if (account === "ALL" && accountId !== "ALL") {
          setAccount("ALL");
        }
        refreshAll();
        fetchNav(navLimit);
        if (account === "ALL") {
          notify(`Imported positions from Schwab CSV (${count} rows across ${importedAccounts ?? "multiple"} accounts).`);
        } else {
          notify(`Imported positions from Schwab CSV (${count} rows).`);
        }
        return;
      } catch (err: any) {
        const detail = err?.response?.data?.detail ?? err?.message ?? "CSV import failed";
        setCsvError(detail);
        setToast(detail);
        return;
      }
    }
    if (isRealizedGainLossReport) {
      const targetAccounts =
        accountId && accountId !== "ALL"
          ? [accountId]
          : accountOptions.filter((name) => name && name.toUpperCase() !== "ALL");
      if (!targetAccounts.length) {
        const msg = "Select an account (or load account list) before importing realized gain/loss CSV.";
        setCsvError(msg);
        notify(msg);
        return;
      }
      try {
        setToast("Importing realized gain/loss CSV...");
        let importedAccounts = 0;
        let noRowsAccounts = 0;
        let tradesCreated = 0;
        const failures: string[] = [];

        for (const account of targetAccounts) {
          const form = new FormData();
          form.append("file", file);
          try {
            const resp = await api.post(
              `/admin/import-transactions?account=${encodeURIComponent(account)}&replace=false`,
              form,
              {
                headers: { "Content-Type": "multipart/form-data" },
                timeout: 180000,
              }
            );
            importedAccounts += 1;
            tradesCreated += Number(resp.data?.trades_created ?? 0);
          } catch (err: any) {
            const detailRaw = err?.response?.data?.detail ?? err?.message ?? "CSV import failed";
            const detail = typeof detailRaw === "string" ? detailRaw : JSON.stringify(detailRaw);
            if (detail.includes("No transactions found")) {
              noRowsAccounts += 1;
              continue;
            }
            failures.push(`${account}: ${detail}`);
          }
        }

        fetchAccounts();
        refreshAll();
        fetchNav(navLimit);

        if (failures.length) {
          const msg = `Realized import finished with ${failures.length} error(s). First error: ${failures[0]}`;
          setCsvError(msg);
          setToast(
            `Realized import: ${importedAccounts} accounts imported, ${noRowsAccounts} no rows, ${failures.length} errors.`
          );
          return;
        }

        notify(
          `Imported realized gain/loss for ${importedAccounts} account(s) (${tradesCreated} trades, ${noRowsAccounts} with no rows).`
        );
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
      account: ["account", "account_name", "acct", "accountid", "account_id"],
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
      owner: ["owner", "label", "book", "desk", "sleeve"],
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
        account: pick("account") || undefined,
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
        owner: pick("owner") || undefined,
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
      const selectedAccount = accountId && accountId !== "ALL" ? accountId : null;
      const hasRowAccounts = filtered.every(
        (row) => !!row.account && row.account.trim() !== "" && row.account.trim().toUpperCase() !== "ALL"
      );
      if (!selectedAccount && !hasRowAccounts) {
        const msg = "For ALL Accounts import, include an account column in the CSV (or select a specific account).";
        setCsvError(msg);
        notify(msg);
        return;
      }
      await api.post("/positions/bulk", {
        positions: filtered,
        ...(selectedAccount ? { account: selectedAccount } : {}),
      });
      refreshAll();
      notify(
        selectedAccount
          ? `Imported ${filtered.length} positions.`
          : `Imported ${filtered.length} positions across accounts.`
      );
    } catch (err: any) {
      setCsvError(err?.response?.data?.detail ?? "CSV import failed");
    }
  };

  const importBalanceFiles = async (files: File[] | FileList | null | undefined) => {
    const list = Array.isArray(files) ? files : Array.from(files ?? []);
    if (!list.length) return;
    setCsvError("");
    const accountParam =
      accountId && accountId.trim() && accountId !== "ALL"
        ? `?account=${encodeURIComponent(accountId)}`
        : "";
    setToast(`Importing ${list.length} balance file${list.length === 1 ? "" : "s"}...`);
    let imported = 0;
    let historyPoints = 0;
    let pendingRebuild = false;
    const failures: string[] = [];
    for (const file of list) {
      try {
        const form = new FormData();
        form.append("file", file);
        const resp = await api.post(`/admin/import-balances${accountParam}`, form, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 180000,
        });
        imported += 1;
        historyPoints += Number(resp.data?.history_points ?? 0);
        if (String(resp.data?.nav_rebuild || "").toLowerCase() === "queued") {
          pendingRebuild = true;
        }
      } catch (err: any) {
        const detailRaw = err?.response?.data?.detail ?? err?.message ?? "Balance CSV import failed";
        const detail = typeof detailRaw === "string" ? detailRaw : JSON.stringify(detailRaw);
        failures.push(`${file.name}: ${detail}`);
      }
    }
    await refreshPortfolioViews(true);
    if (pendingRebuild) scheduleNavResync();
    if (failures.length) {
      const msg = `Imported ${imported}/${list.length} balance files. First error: ${failures[0]}`;
      setCsvError(msg);
      notify(msg);
      return;
    }
    const suffix = historyPoints > 0 ? ` (${historyPoints} historical points)` : "";
    notify(`Imported ${imported} balance file${imported === 1 ? "" : "s"}${suffix}.`);
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
    if (currentSymbol && !parseOsiSymbol(currentSymbol)) symbols.add(currentSymbol.toUpperCase());
    if (tradeSymbol && !parseOsiSymbol(tradeSymbol)) symbols.add(tradeSymbol.toUpperCase());
    return Array.from(symbols);
  }, [positions, currentSymbol, tradeSymbol]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === "arrowup" || key === "arrowdown") {
        if (tab === "Monitor") {
          event.preventDefault();
          if (activeTable === "positions") {
            setSelectedPosIndex((prev) => {
              const max = positionsDisplay.length - 1;
              const next = key === "arrowdown" ? Math.min(prev + 1, max) : Math.max(prev - 1, 0);
              const row: any = positionsDisplay[next];
              const asset = String(row?.row?.asset_class || row?.asset_class || "").toLowerCase();
              const symbol =
                row?.selectSymbol ||
                (asset === "option" && row?.row?.underlying ? row.row.underlying : row?.row?.symbol || row?.symbol);
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
  }, [tab, activeTable, positionsDisplay]);

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

  const tabs = useMemo(
    () => (staticMode ? ["Monitor", "Analyze", "Risk", "Activity", "Admin"] : ["Monitor", "Trade", "Analyze", "Risk", "Activity", "Admin"]),
    [staticMode]
  );

  return (
    <div className={`ws ${chartFull ? "chart-full" : ""}`}>
      <div className="topbar">
        <div className="top-tabs">
          {tabs.map((label) => (
            <button key={label} className={`tab ${tab === label ? "active" : ""}`} onClick={() => setTab(label)}>
              {label}
            </button>
          ))}
        </div>
        <div className="top-meta">
          <div className={`topcell ${statusTone}`}>
            <span className="label">Status</span>
            <div className={`status status-${statusTone}`}>{toast || statusLine}</div>
          </div>
          <div className={`topcell ${dataTone}`}>
            <span className="label">Data</span>
            <div className={`status status-${dataTone}`}>{portfolioStatus.source === "demo" ? "Demo" : "Local"}</div>
          </div>
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
        <button className="tool" type="button" onClick={resetLayout}>
          Reset Layout
        </button>
      </div>

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
                    <span>Label</span>
                    <input
                      className="input"
                      value={positionForm.owner}
                      onChange={(e) => setPositionForm((prev) => ({ ...prev, owner: e.target.value }))}
                      list="label-options"
                    />
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
                <datalist id="label-options">
                  {ownerOptions.map((owner) => (
                    <option key={owner} value={owner} />
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
                  <div className="account-summary-grid">
                    {accountSummary ? (
                      [
                        ["Account", accountSummary.name],
                        ["NLV", accountSummary.nlv],
                        ["Day PnL", accountSummary.dayPnl],
                        ["Total PnL", accountSummary.totalPnl],
                        ["Cash", accountSummary.cashTotal],
                        ["Cash (Avail)", accountSummary.cash],
                        ["Buying Power", accountSummary.buyingPower],
                      ].map(([k, v]) => (
                        <div className="account-kpi" key={k as string}>
                          <div className="label">{k}</div>
                          <div className={`mono ${(k as string).includes("PnL") && String(v).startsWith("-") ? "neg" : ""}`}>{v}</div>
                        </div>
                      ))
                    ) : (
                      <div className="account-kpi">
                        <div className="label">Loading</div>
                        <div className="mono">—</div>
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
                      <datalist id="label-options">
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
                        <div>Label</div>
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
                          const isGroupRow = row.kind === "group";
                          const position = isGroupRow ? null : row.row;
                          const navBase = isGroupRow ? safeNumber(row.marketValue) : safeNumber(position?.market_value);
                          const navPct = snapshot ? (navBase / Math.max(snapshot.nlv, 1)) * 100 : 0;
                          const dayPnl = safeNumber(isGroupRow ? row.dayPnl : position?.day_pnl);
                          const totalPnl = safeNumber(isGroupRow ? row.totalPnl : position?.total_pnl);
                          const selectSymbol = row.selectSymbol;
                          return (
                            <div
                              className={`row positions ${isGroupRow ? "positions-group" : row.child ? "positions-child" : ""} ${idx % 2 ? "alt" : ""} ${currentSymbol === selectSymbol ? "selected" : ""} ${selectedPosIndex === idx ? "selected" : ""}`}
                              key={row.key ?? `${row.symbol}-${idx}`}
                              onClick={() => {
                                setActiveTable("positions");
                                setSelectedPosIndex(idx);
                                if (selectSymbol) setCurrentSymbol(selectSymbol);
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                setActiveTable("positions");
                                setSelectedPosIndex(idx);
                                if (selectSymbol) setCurrentSymbol(selectSymbol);
                                setContextMenu({
                                  x: event.clientX,
                                  y: event.clientY,
                                  symbol: isGroupRow ? row.symbol : position?.symbol,
                                  selectSymbol,
                                  mode: "positions",
                                  instrumentId: isGroupRow ? null : position?.instrument_id,
                                  isStrategySummary: isGroupRow,
                                });
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <div className={`mono position-symbol-cell ${row.child ? "indented" : ""}`}>
                                {isGroupRow ? (
                                  <>
                                    <button
                                      type="button"
                                      className="positions-toggle"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setExpandedPositionGroups((prev) => ({
                                          ...prev,
                                          [row.groupKey]: !prev[row.groupKey],
                                        }));
                                      }}
                                    >
                                      {row.expanded ? "-" : "+"}
                                    </button>
                                    <span>{row.symbol}</span>
                                  </>
                                ) : (
                                  <span>{row.displaySymbol}</span>
                                )}
                              </div>
                              <div className="mono">{row.typeDisplay}</div>
                              <div className="num mono">
                                {isGroupRow ? row.qtyDisplay : formatNumber(position?.qty)}
                              </div>
                              <div className="num mono">
                                {isGroupRow ? row.avgDisplay : formatNumber(safeNumber(position?.avg_cost))}
                              </div>
                              <div className="num mono">
                                {isGroupRow ? row.lastDisplay : formatNumber(position?.price)}
                              </div>
                              <div className={`num mono ${dayPnl < 0 ? "neg" : "pos"}`}>{formatSignedMoney(dayPnl)}</div>
                              <div className={`num mono ${totalPnl < 0 ? "neg" : "pos"}`}>{formatSignedMoney(totalPnl)}</div>
                              <div className="num mono">{navPct.toFixed(1)}%</div>
                              <div className="centered mono">{isGroupRow ? "—" : position?.expiry ?? "—"}</div>
                              <div className="centered mono cell-strike">
                                {isGroupRow ? "—" : position?.strike ? formatNumber(position.strike) : "—"}
                              </div>
                              <div className="centered cell-entry-date">
                                {isGroupRow ? (
                                  <span className="mono">—</span>
                                ) : (
                                  <input
                                    key={`${position?.instrument_id ?? position?.symbol}-entry-${position?.entry_date ?? ""}`}
                                    className="input input-mini mono"
                                    type="date"
                                    defaultValue={position?.entry_date ?? ""}
                                    onBlur={(e) => updatePositionEntryDate(position, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        (e.target as HTMLInputElement).blur();
                                      }
                                    }}
                                  />
                                )}
                              </div>
                              <div className="cell-owner">
                                {isGroupRow ? (
                                  <span>{row.ownerDisplay}</span>
                                ) : (
                                  <input
                                    key={`${position?.instrument_id ?? position?.symbol}-owner-${position?.owner ?? ""}`}
                                    className="input input-mini"
                                    list="label-options"
                                    placeholder="Label"
                                    defaultValue={position?.owner ?? ""}
                                    onBlur={(e) => updatePositionOwner(position, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        (e.target as HTMLInputElement).blur();
                                      }
                                    }}
                                  />
                                )}
                              </div>
                              <div className="cell-sector">
                                {isGroupRow ? (
                                  <span>{row.sectorDisplay}</span>
                                ) : (
                                  <select
                                    className="input input-mini"
                                    value={position?.sector ?? ""}
                                    onChange={(e) => updatePositionSector(position, e.target.value)}
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
                    <span>{chartMode === "SECTOR" ? "Sector Comparison" : "Portfolio Comparison"}</span>
                    <div className="panel-controls">
                      <select className="input input-mini" value={chartMode} onChange={(e) => setChartMode(e.target.value as "PORTFOLIO" | "SECTOR")}>
                        <option value="PORTFOLIO">Portfolio</option>
                        <option value="SECTOR">Sector Comparison</option>
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
                          <button
                            type="button"
                            className={`tool ${sectorShowSleeve ? "active" : ""}`}
                            onClick={() => setSectorShowSleeve((prev) => !prev)}
                          >
                            Sleeve
                          </button>
                          <button
                            type="button"
                            className={`tool ${sectorShowEtf ? "active" : ""}`}
                            onClick={() => setSectorShowEtf((prev) => !prev)}
                          >
                            ETF
                          </button>
                          <button
                            type="button"
                            className={`tool ${sectorShowPortfolio ? "active" : ""}`}
                            onClick={() => setSectorShowPortfolio((prev) => !prev)}
                          >
                            Portfolio
                          </button>
                        </>
                      )}
                      <select className="input input-mini" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                        <option>1D</option>
                        <option>5D</option>
                        <option>1M</option>
                        <option>3M</option>
                        <option>TYD</option>
                        <option>MAX</option>
                      </select>
                      <button
                        type="button"
                        className={`tool ${chartShowBench ? "active" : ""}`}
                        onClick={() => setChartShowBench((prev) => !prev)}
                      >
                        {chartShowBench ? "SPX On" : "SPX Off"}
                      </button>
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
                        <div className="warning-banner">No sector data yet. Add sectors and enable Sleeve and/or ETF.</div>
                      )}
                      {sectorError && chartMode === "SECTOR" && <div className="error-banner">{sectorError}</div>}
                      <ErrorBoundary fallback={<div className="error-banner">Chart error. Please refresh.</div>}>
                        <PortfolioChart
                          key={`monitor-${chartMode}-${chartShowBench}-${sectorSeriesList.length}`}
                          data={chartData}
                          showNav={chartShowNav}
                          showSector={chartMode === "SECTOR"}
                          showBench={chartShowBenchEffective}
                          sectorSeries={sectorSeriesList}
                          extraSeries={chartExtraSeries}
                          emptyMessage={chartEmptyMessage}
                        />
                      </ErrorBoundary>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "Risk" && (
            <div className="tab-body risk-body">
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
                    <div className="risk-grid">
                      <section className="risk-card">
                        <div className="risk-card-title">Risk Snapshot</div>
                        <div className="risk-hero-grid">
                          {riskVisualCards.map((card) => (
                            <div className="risk-hero-card" key={card.key}>
                              <div className="label">{card.label}</div>
                              <div className="risk-hero-value mono">{card.display}</div>
                              <div className="risk-bar">
                                <div className="risk-bar-fill" style={{ width: `${(card.ratio * 100).toFixed(1)}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="risk-card">
                        <div className="risk-card-title">Exposure Map</div>
                        <div className="exposure-bars">
                          {riskMatrix.map((row, idx) => (
                            <div className={`exposure-row ${idx % 2 ? "alt" : ""}`} key={row.cls}>
                              <div className="mono">{row.cls.toUpperCase()}</div>
                              <div className="exposure-track">
                                <div className="exposure-fill long" style={{ width: `${Math.min(100, Math.abs(row.long) * 100)}%` }} />
                                <div className="exposure-fill short" style={{ width: `${Math.min(100, Math.abs(row.short) * 100)}%` }} />
                              </div>
                              <div className="num mono">{formatSignedPct(row.net * 100, 1)}</div>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="risk-card">
                        <div className="risk-card-title">Rolling Visuals</div>
                        <div className="risk-spark-grid">
                          {riskSparkSeries.map((series) => (
                            <div className="risk-spark-card" key={series.key}>
                              <div className="risk-spark-head">
                                <span>{series.label}</span>
                                <span className="mono">{formatRiskValue(series.metric, series.latest)}</span>
                              </div>
                              <svg viewBox="0 0 240 64" className="risk-sparkline" preserveAspectRatio="none">
                                <polyline points={sparklinePath(series.values)} />
                              </svg>
                            </div>
                          ))}
                          <div className="risk-footnote">As of {rollingLatest.date}</div>
                        </div>
                      </section>

                      <section className="risk-card">
                        <div className="risk-card-title">Top Metrics</div>
                        <div className="table">
                          <div className="row head risk">
                            <div>Metric</div>
                            <div className="num">Value</div>
                            <div className="num">Limit</div>
                          </div>
                          {riskRows.slice(0, 10).map((row, idx) => (
                            <div className={`row risk ${row.breached ? "warn" : ""} ${idx % 2 ? "alt" : ""}`} key={row.metric}>
                              <div className="mono">{riskLabels[row.metric] ?? row.metric.replaceAll("_", " ")}</div>
                              <div className="num mono">{formatRiskValue(row.metric, row.value)}</div>
                              <div className="num mono">{row.limit ? formatRiskValue(row.metric, row.limit) : "—"}</div>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="risk-card">
                        <div className="risk-card-title">Correlation Matrix</div>
                        {correlationLabels.length > 1 ? (
                          <div className="corr-matrix-wrap">
                            <table className="corr-matrix">
                              <thead>
                                <tr>
                                  <th />
                                  {correlationLabels.map((label) => (
                                    <th key={`col-${label}`}>{label}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {correlationLabels.map((rowLabel, rowIdx) => (
                                  <tr key={`row-${rowLabel}`}>
                                    <th>{rowLabel}</th>
                                    {correlationLabels.map((colLabel, colIdx) => {
                                      const value = Number(correlationMatrix[rowIdx]?.[colIdx] ?? 0);
                                      return (
                                        <td key={`${rowLabel}-${colLabel}`} style={correlationCellStyle(value)}>
                                          {value.toFixed(2)}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="corr-legend">
                              <span className="mono">-1.0</span>
                              <div className="corr-legend-bar" />
                              <span className="mono">+1.0</span>
                            </div>
                            <div className="risk-footnote">Observations: {riskCorrelation?.observations ?? 0}</div>
                          </div>
                        ) : (
                          <div className="risk-empty">Correlation data will appear after enough daily history is available.</div>
                        )}
                      </section>
                    </div>
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
                      <button
                        type="button"
                        className={`tool ${activityClosedOnly ? "active" : ""}`}
                        onClick={() => setActivityClosedOnly((prev) => !prev)}
                        title="Toggle closed/realized only"
                      >
                        Closed
                      </button>
                      <button type="button" onClick={() => toggleCollapsed("blotter")}>{collapsed.blotter ? "+" : "−"}</button>
                      <button type="button" onClick={() => toggleFocus("center", "blotter")}>□</button>
                      <button type="button" onClick={() => notify("Detach not available.")}>↗</button>
                      <button type="button" onClick={() => notify("Blotter settings opened.")}>⚙</button>
                    </div>
                  </div>
                  {!collapsed.blotter && (
                    <div className="table scroll activity-table">
                      <div className="row head blotter">
                        <div className="centered">Time</div>
                        <div className="centered">Trade Date</div>
                        <div>Account</div>
                        <div>Symbol</div>
                        <div className="centered">Side</div>
                        <div className="num">Qty</div>
                        <div className="num">Price</div>
                        <div>Sector</div>
                        <div className="num">Realized P/L</div>
                        <div>Status</div>
                      </div>
                      {activityTrades.map((row, idx) => (
                        <div className={`row blotter ${idx % 2 ? "alt" : ""}`} key={row.trade_id || `${row.ts}-${row.symbol}-${idx}`}>
                          <div className="centered mono">{row.ts}</div>
                          <div className="centered mono">{row.trade_date ?? row.ts?.slice(0, 10)}</div>
                          <div className="mono">{row.account ?? "—"}</div>
                          <div className="mono">{row.symbol}</div>
                          <div className={`centered ${row.side === "BUY" ? "pos" : "neg"}`}>{row.side}</div>
                          <div className="num mono">{formatNumber(row.qty)}</div>
                          <div className="num mono">{formatNumber(row.price)}</div>
                          <div className="cell-sector">
                            <select
                              className="input"
                              value={(row.sector || "").trim() || "Unassigned"}
                              onChange={(e) => updateTradeSectorRow(row.trade_id, e.target.value)}
                            >
                              <option value="Unassigned">Unassigned</option>
                              {sectorOptions.map((sector) => (
                                <option key={`trade-sector-${row.trade_id}-${sector}`} value={sector}>
                                  {sector}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="cell-realized">
                            <input
                              className="input mono"
                              value={
                                row.trade_id && tradeRealizedDrafts[row.trade_id] != null
                                  ? tradeRealizedDrafts[row.trade_id]
                                  : row.realized_pl == null
                                    ? ""
                                    : String(Number(row.realized_pl.toFixed(2)))
                              }
                              placeholder="0.00"
                              onChange={(e) => {
                                if (!row.trade_id) return;
                                setTradeRealizedDrafts((prev) => ({ ...prev, [row.trade_id]: e.target.value }));
                              }}
                              onBlur={() => {
                                if (!row.trade_id) return;
                                commitTradeRealizedRow(row.trade_id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              disabled={!row.trade_id}
                            />
                          </div>
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
                <div className="panel-body admin-grid">
                  <section className="field admin-card">
                    <div className="admin-card-title">Cash</div>
                    <label>Cash (Total)</label>
                    <input
                      className="input"
                      type="number"
                      value={cashInput}
                      placeholder={snapshot ? String(snapshot.cash ?? "") : ""}
                      onChange={(e) => setCashInput(e.target.value)}
                    />
                    <button className="btn buy" type="button" onClick={updateCash}>Update Cash</button>
                  </section>

                  <section className="field admin-card">
                    <div className="admin-card-title">Benchmark</div>
                    <label>Benchmark Start (YYYY-MM-DD)</label>
                    <input className="input" type="date" value={benchStart} onChange={(e) => setBenchStart(e.target.value)} />
                    <button className="btn ghost" type="button" onClick={setBenchmarkStart}>Set Benchmark</button>
                  </section>

                  <section className="field admin-card">
                    <div className="admin-card-title">Portfolio Reset</div>
                    <label>Reset Portfolio (Start Cash)</label>
                    <input
                      className="input"
                      type="number"
                      value={resetCash}
                      placeholder={snapshot ? String(snapshot.cash ?? "") : ""}
                      onChange={(e) => setResetCash(e.target.value)}
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none" }}>
                      <input
                        type="checkbox"
                        checked={resetDeleteAccounts}
                        onChange={(e) => setResetDeleteAccounts(e.target.checked)}
                      />
                      Delete accounts on reset
                    </label>
                    <button className="btn sell" type="button" onClick={resetPortfolio}>Reset Portfolio</button>
                  </section>

                  <section className="field admin-card">
                    <div className="admin-card-title">Positions</div>
                    <label>Manual Entry</label>
                    <button className="btn ghost" type="button" onClick={() => openPositionModal()}>
                      Add / Update Position
                    </button>
                  </section>

                  <section className="field admin-card admin-card-wide">
                    <div className="admin-card-title">Balance Imports</div>
                    <label>Balance CSVs (Batch)</label>
                    <div className="modal-text muted mono">
                      Select multiple balance/history CSV files to import all accounts in one run.
                    </div>
                    <input
                      className="input"
                      type="file"
                      accept=".csv,text/csv"
                      multiple
                      onChange={async (e) => {
                        const files = e.target.files;
                        if (files && files.length) {
                          await importBalanceFiles(files);
                        }
                        e.currentTarget.value = "";
                      }}
                    />
                  </section>

                  <section className="field admin-card admin-card-wide">
                    <div className="admin-card-title">Sector Performance Inputs</div>
                    <div className="modal-text muted mono">
                      Baseline anchors sector return when sleeve capital is near zero. Target weight is stored for attribution overlays.
                    </div>
                    <div className="trade-form">
                      <label className="field">
                        <span>Account</span>
                        <select
                          className="input"
                          value={sectorPerfAccount}
                          onChange={(e) => setSectorPerfAccount(e.target.value)}
                        >
                          {accountSpecificOptions.map((name) => (
                            <option key={`perf-account-${name}`} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Sector</span>
                        <select
                          className="input"
                          value={sectorPerfSector}
                          onChange={(e) => setSectorPerfSector(e.target.value)}
                        >
                          {sectorOptions.map((sector) => (
                            <option key={`perf-sector-${sector}`} value={sector}>
                              {sector}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Baseline ($)</span>
                        <input
                          className="input mono"
                          value={sectorPerfBaseline}
                          onChange={(e) => setSectorPerfBaseline(e.target.value)}
                          placeholder="e.g. 500000"
                        />
                      </label>
                      <label className="field">
                        <span>Target Weight (%)</span>
                        <input
                          className="input mono"
                          value={sectorPerfTargetWeight}
                          onChange={(e) => setSectorPerfTargetWeight(e.target.value)}
                          placeholder="e.g. 12.5"
                        />
                      </label>
                    </div>
                    <div className="btn-row">
                      <button className="btn ghost" type="button" onClick={saveSectorPerformanceInput}>
                        Save Sector Inputs
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => {
                          setSectorPerfBaseline("");
                          setSectorPerfTargetWeight("");
                        }}
                      >
                        Clear Inputs
                      </button>
                    </div>
                    <div className="table scroll">
                      <div className="row head" style={{ gridTemplateColumns: "1.2fr 1fr 1fr 0.8fr" }}>
                        <div>Sector</div>
                        <div className="num">Baseline</div>
                        <div className="num">Target %</div>
                        <div className="centered">Use</div>
                      </div>
                      {sectorPerfRows.map((row, idx) => (
                        <div
                          className={`row ${idx % 2 ? "alt" : ""}`}
                          style={{ gridTemplateColumns: "1.2fr 1fr 1fr 0.8fr" }}
                          key={`sector-perf-${row.sector}`}
                        >
                          <div>{row.sector}</div>
                          <div className="num mono">{row.baseline_value == null ? "—" : formatMoney(row.baseline_value)}</div>
                          <div className="num mono">
                            {row.target_weight == null ? "—" : `${Number(row.target_weight).toFixed(2)}%`}
                          </div>
                          <div className="centered">
                            <button
                              className="tool"
                              type="button"
                              onClick={() => {
                                setSectorPerfSector(row.sector);
                                setSectorPerfBaseline(row.baseline_value == null ? "" : String(row.baseline_value));
                                setSectorPerfTargetWeight(row.target_weight == null ? "" : String(row.target_weight));
                              }}
                            >
                              Use
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="field admin-card admin-card-wide">
                    <div className="admin-card-title">NAV History (Paste)</div>
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
                  </section>

                  <section className="field admin-card admin-card-wide">
                    <div className="admin-card-title">Benchmark History (Paste)</div>
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
                  </section>
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
                    <option value="SECTOR">Sector Comparison</option>
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
                      <button
                        type="button"
                        className={`btn ghost ${sectorShowSleeve ? "on" : ""}`}
                        onClick={() => setSectorShowSleeve((prev) => !prev)}
                      >
                        {sectorShowSleeve ? "Sleeve On" : "Sleeve Off"}
                      </button>
                      <button
                        type="button"
                        className={`btn ghost ${sectorShowEtf ? "on" : ""}`}
                        onClick={() => setSectorShowEtf((prev) => !prev)}
                      >
                        {sectorShowEtf ? "ETF On" : "ETF Off"}
                      </button>
                      <button
                        type="button"
                        className={`btn ghost ${sectorShowPortfolio ? "on" : ""}`}
                        onClick={() => setSectorShowPortfolio((prev) => !prev)}
                      >
                        {sectorShowPortfolio ? "Portfolio On" : "Portfolio Off"}
                      </button>
                    </>
                  )}
                  <select className="input input-mini" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                    <option>1D</option>
                    <option>5D</option>
                    <option>1M</option>
                    <option>3M</option>
                    <option>TYD</option>
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
                  <div className="warning-banner">No sector data yet. Add sectors and enable Sleeve and/or ETF.</div>
                )}
                <ErrorBoundary fallback={<div className="error-banner">Chart error. Please refresh.</div>}>
                  <PortfolioChart
                    key={`analyze-${chartMode}-${chartShowBench}-${sectorSeriesList.length}`}
                    data={chartData}
                    showNav={chartShowNav}
                    showSector={chartMode === "SECTOR"}
                    showBench={chartShowBenchEffective}
                    sectorSeries={sectorSeriesList}
                    extraSeries={chartExtraSeries}
                    emptyMessage={chartEmptyMessage}
                  />
                </ErrorBoundary>
              </div>
            </div>
          )}
        </main>
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
                  if (!row) {
                    notify("Position not found.");
                    setContextMenu(null);
                    return;
                  }
                  const next = window.prompt("Assign label", row.owner ?? "");
                  if (next != null) {
                    updatePositionOwner(row, next);
                  }
                  setContextMenu(null);
                }}
              >
                Assign Label
              </button>
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
