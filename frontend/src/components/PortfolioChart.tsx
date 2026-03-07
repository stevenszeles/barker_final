import { useEffect, useRef } from "react";
import { createChart, ISeriesApi, type BusinessDay } from "lightweight-charts";
import type { NavPoint } from "../store";

type SeriesPoint = NavPoint & { sector?: number | null };
type SectorSeries = { name: string; data: SeriesPoint[] };

const chartOptions = {
  layout: {
    background: { color: "#141414" },
    textColor: "#a0a0a0",
  },
  grid: {
    vertLines: { color: "#2a2a2a" },
    horzLines: { color: "#2a2a2a" },
  },
  rightPriceScale: {
    borderColor: "#2a2a2a",
  },
  timeScale: {
    borderColor: "#2a2a2a",
  },
  crosshair: {
    vertLine: { color: "#333" },
    horzLine: { color: "#333" },
  },
};

const percentFormatter = (value: number) => `${value.toFixed(2)}%`;

export default function PortfolioChart({
  data,
  showNav = true,
  showSector = false,
  showBench = true,
  sectorSeries = [],
  extraSeries = [],
  emptyMessage,
}: {
  data: SeriesPoint[];
  showNav?: boolean;
  showSector?: boolean;
  showBench?: boolean;
  sectorSeries?: SectorSeries[];
  extraSeries?: SectorSeries[];
  emptyMessage?: string;
}) {
  const navAccessor = (point: SeriesPoint) => {
    const twr = Number(point.twr);
    if (Number.isFinite(twr) && Math.abs(twr) > 1e-12) return twr;
    return Number(point.nav);
  };
  const cleaned = data.filter(
    (point) =>
      Boolean(point.date) &&
      Number.isFinite(navAccessor(point)) &&
      Math.abs(navAccessor(point)) > 1e-12
  );
  const hasBaseData = cleaned.length > 0;
  const hasInlineSectorData = cleaned.some(
    (point) => point.sector != null && Number.isFinite(Number(point.sector))
  );
  const hasSectorSeriesData = sectorSeries.some((series) =>
    series.data.some((point) => point.sector != null && Number.isFinite(Number(point.sector)))
  );
  const hasExtraSeriesData = extraSeries.some((series) =>
    series.data.some((point) => Boolean(point.date) && Number.isFinite(navAccessor(point)) && Math.abs(navAccessor(point)) > 1e-12)
  );
  const hasRenderableData =
    (showNav && hasBaseData) ||
    (showBench && hasBaseData) ||
    (showSector && (hasInlineSectorData || hasSectorSeriesData)) ||
    hasExtraSeriesData;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const spreadCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const navSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const benchSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const sectorSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sectorMultiRefs = useRef<ISeriesApi<"Line">[]>([]);
  const extraSeriesRefs = useRef<ISeriesApi<"Line">[]>([]);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const palette = ["#FFC107", "#FF7043", "#8BC34A", "#03A9F4", "#AB47BC", "#26A69A"];

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      ...chartOptions,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 220,
    });
    chartRef.current = chart;
    navSeriesRef.current = chart.addAreaSeries({
      lineColor: "#00C851",
      topColor: "rgba(0, 200, 81, 0.14)",
      bottomColor: "rgba(0, 200, 81, 0.01)",
      lineWidth: 2,
      priceFormat: { type: "custom", formatter: percentFormatter },
    });
    benchSeriesRef.current = chart.addAreaSeries({
      lineColor: "#F2F2F2",
      topColor: "rgba(255, 255, 255, 0.12)",
      bottomColor: "rgba(255, 255, 255, 0.01)",
      lineWidth: 2,
      priceFormat: { type: "custom", formatter: percentFormatter },
    });
    sectorSeriesRef.current = chart.addLineSeries({
      color: "#FFC107",
      lineWidth: 1,
      priceFormat: { type: "custom", formatter: percentFormatter },
    });

    const handleResize = () => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight || 220,
      });
      const canvas = spreadCanvasRef.current;
      if (canvas && containerRef.current) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(containerRef.current.clientWidth * dpr));
        canvas.height = Math.max(1, Math.floor((containerRef.current.clientHeight || 220) * dpr));
        canvas.style.width = `${containerRef.current.clientWidth}px`;
        canvas.style.height = `${containerRef.current.clientHeight || 220}px`;
      }
      chart.timeScale().fitContent();
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);
    window.addEventListener("resize", handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!navSeriesRef.current || !benchSeriesRef.current || !sectorSeriesRef.current || !chartRef.current) return;
    const toBusinessDay = (date: string): BusinessDay => {
      const parts = date.split("-").map((v) => Number(v));
      return { year: parts[0], month: parts[1], day: parts[2] };
    };
    const resetDynamicSeries = () => {
      sectorMultiRefs.current.forEach((series) => {
        try {
          chartRef.current?.removeSeries(series);
        } catch {
          // ignore
        }
      });
      sectorMultiRefs.current = [];
      extraSeriesRefs.current.forEach((series) => {
        try {
          chartRef.current?.removeSeries(series);
        } catch {
          // ignore
        }
      });
      extraSeriesRefs.current = [];
    };
    if (!hasRenderableData) {
      navSeriesRef.current.setData([]);
      benchSeriesRef.current.setData([]);
      sectorSeriesRef.current.setData([]);
      resetDynamicSeries();
      chartRef.current.timeScale().fitContent();
      return;
    }
    const firstNav = cleaned[0];
    let baseNav = firstNav ? navAccessor(firstNav) : 1;
    if (!Number.isFinite(baseNav) || Math.abs(baseNav) <= 1e-12) baseNav = 1;
    const basePoint = cleaned[0];
    const firstBench = cleaned.find((p) => Number(p.bench) > 0)?.bench;
    let baseBench = Number(firstBench ?? basePoint?.bench ?? basePoint?.nav ?? baseNav);
    if (!Number.isFinite(baseBench) || baseBench <= 0) baseBench = baseNav;
    const navData = hasBaseData
      ? cleaned
          .map((p) => ({ time: toBusinessDay(p.date), value: ((navAccessor(p) / baseNav) - 1) * 100 }))
          .filter((p) => Number.isFinite(p.value))
      : [];
    const benchData = hasBaseData
      ? cleaned
          .map((p) => ({
            time: toBusinessDay(p.date),
            value: ((Number(p.bench ?? p.nav) / (baseBench || baseNav)) - 1) * 100,
          }))
          .filter((p) => Number.isFinite(p.value))
      : [];
    const spreadData =
      hasBaseData
        ? cleaned
            .map((p) => ({
              time: toBusinessDay(p.date),
              nav: ((navAccessor(p) / baseNav) - 1) * 100,
              bench: ((Number(p.bench ?? p.nav) / (baseBench || baseNav)) - 1) * 100,
            }))
            .filter((p) => Number.isFinite(p.nav) && Number.isFinite(p.bench))
        : [];
    const buildSectorPoints = (points: SeriesPoint[]) =>
      points
        .filter((p) => p.sector != null && Number.isFinite(Number(p.sector)))
        .map((p) => ({ time: toBusinessDay(p.date), value: Number(p.sector) }))
        .filter((p) => Number.isFinite(p.value));
    const buildReturnPoints = (points: SeriesPoint[]) => {
      const cleanedPoints = points.filter((p) => Number.isFinite(Number(navAccessor(p))) && Boolean(p.date));
      if (!cleanedPoints.length) return [];
      const first =
        cleanedPoints.find((p) => {
          const v = navAccessor(p);
          return Number.isFinite(v) && Math.abs(v) > 1e-12;
        }) ?? cleanedPoints[0];
      let base = navAccessor(first);
      if (!Number.isFinite(base) || Math.abs(base) <= 1e-12) base = 1;
      return cleanedPoints
        .map((p) => ({ time: toBusinessDay(p.date), value: ((navAccessor(p) / base) - 1) * 100 }))
        .filter((p) => Number.isFinite(p.value));
    };
    const sectorData = hasBaseData ? buildSectorPoints(cleaned) : [];
    if (showNav) {
      navSeriesRef.current.setData(navData);
    } else {
      navSeriesRef.current.setData([]);
    }
    if (showBench) {
      benchSeriesRef.current.setData(benchData);
    } else {
      benchSeriesRef.current.setData([]);
    }
    if (sectorData.length && showSector && sectorSeries.length === 0) {
      sectorSeriesRef.current.setData(sectorData);
    } else {
      sectorSeriesRef.current.setData([]);
    }

    sectorMultiRefs.current.forEach((series) => {
      try {
        chartRef.current?.removeSeries(series);
      } catch {
        // ignore
      }
    });
    sectorMultiRefs.current = [];
    if (showSector && sectorSeries.length) {
      sectorSeries.forEach((series, idx) => {
        const line = chartRef.current?.addLineSeries({
          color: palette[idx % palette.length],
          lineWidth: 1,
          priceFormat: { type: "custom", formatter: percentFormatter },
        });
        if (!line) return;
        const cleaned = series.data.filter((p) => p.sector != null && Number.isFinite(Number(p.sector)));
        if (!cleaned.length) return;
        const points = buildSectorPoints(cleaned);
        line.setData(points);
        sectorMultiRefs.current.push(line);
      });
    }

    extraSeriesRefs.current.forEach((series) => {
      try {
        chartRef.current?.removeSeries(series);
      } catch {
        // ignore
      }
    });
    extraSeriesRefs.current = [];
    if (extraSeries.length) {
      extraSeries.forEach((series, idx) => {
        const line = chartRef.current?.addLineSeries({
          color: palette[(idx + sectorSeries.length) % palette.length],
          lineWidth: 1,
          priceFormat: { type: "custom", formatter: percentFormatter },
        });
        if (!line) return;
        const points = buildReturnPoints(series.data);
        if (!points.length) return;
        line.setData(points);
        extraSeriesRefs.current.push(line);
      });
    }
    chartRef.current.timeScale().fitContent();

    const drawSpread = () => {
      const canvas = spreadCanvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || !chartRef.current || !navSeriesRef.current || !benchSeriesRef.current) return;
      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const height = container.clientHeight || 220;
      if (width <= 0 || height <= 0) return;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (!showNav || !showBench || spreadData.length < 2) return;

      type Pt = { x: number; yNav: number; yBench: number; diff: number };
      const pts: Pt[] = [];
      for (const point of spreadData) {
        const x = chartRef.current.timeScale().timeToCoordinate(point.time);
        const yNav = navSeriesRef.current.priceToCoordinate(point.nav);
        const yBench = benchSeriesRef.current.priceToCoordinate(point.bench);
        if (x == null || yNav == null || yBench == null) continue;
        pts.push({ x, yNav, yBench, diff: point.nav - point.bench });
      }
      if (pts.length < 2) return;

      for (let i = 1; i < pts.length; i += 1) {
        const a = pts[i - 1];
        const b = pts[i];
        const avgDiff = (a.diff + b.diff) / 2;
        ctx.fillStyle = avgDiff >= 0 ? "rgba(35, 193, 107, 0.22)" : "rgba(242, 95, 92, 0.22)";
        ctx.beginPath();
        ctx.moveTo(a.x, a.yNav);
        ctx.lineTo(b.x, b.yNav);
        ctx.lineTo(b.x, b.yBench);
        ctx.lineTo(a.x, a.yBench);
        ctx.closePath();
        ctx.fill();
      }
    };

    requestAnimationFrame(drawSpread);
  }, [data, showNav, showSector, showBench, sectorSeries, extraSeries, hasRenderableData, hasBaseData]);

  return (
    <div className="chart-box chart-wrap" ref={containerRef}>
      <canvas ref={spreadCanvasRef} className="chart-spread-overlay" />
      {!hasRenderableData && (
        <div className="chart-empty">
          {emptyMessage || "No NAV data - ensure price history is available and benchmark start is configured"}
        </div>
      )}
      <div className="chart-legend">
        {showNav && (
          <span className="legend-item">
            <span className="swatch nav" /> Portfolio
          </span>
        )}
        {showBench && (
          <span className="legend-item">
            <span className="swatch bench" /> SPX
          </span>
        )}
        {showSector && sectorSeries.length === 0 && (
          <span className="legend-item">
            <span className="swatch sector" /> Sector
          </span>
        )}
        {showSector &&
          sectorSeries.map((series, idx) => (
            <span className="legend-item" key={series.name}>
              <span className="swatch" style={{ background: palette[idx % palette.length] }} /> {series.name}
            </span>
          ))}
        {!!extraSeries.length &&
          extraSeries.map((series, idx) => (
            <span className="legend-item" key={`extra-${series.name}`}>
              <span className="swatch" style={{ background: palette[(idx + sectorSeries.length) % palette.length] }} /> {series.name}
            </span>
          ))}
      </div>
    </div>
  );
}
