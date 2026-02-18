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
  showSector = false,
  showBench = true,
  sectorSeries = [],
  extraSeries = [],
}: {
  data: SeriesPoint[];
  showSector?: boolean;
  showBench?: boolean;
  sectorSeries?: SectorSeries[];
  extraSeries?: SectorSeries[];
}) {
  const cleaned = data.filter((point) => Number.isFinite(Number(point.nav)) && Boolean(point.date));
  const hasData = cleaned.length > 0;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const navSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const benchSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
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
    navSeriesRef.current = chart.addLineSeries({
      color: "#00C851",
      lineWidth: 1,
      priceFormat: { type: "custom", formatter: percentFormatter },
    });
    benchSeriesRef.current = chart.addLineSeries({
      color: "#2196F3",
      lineWidth: 1,
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
    if (!hasData) {
      navSeriesRef.current.setData([]);
      benchSeriesRef.current.setData([]);
      sectorSeriesRef.current.setData([]);
      sectorMultiRefs.current.forEach((series) => {
        try {
          chartRef.current?.removeSeries(series);
        } catch {
          // ignore
        }
      });
      sectorMultiRefs.current = [];
      chartRef.current.timeScale().fitContent();
      return;
    }
    const navAccessor = (point: SeriesPoint) => Number(point.twr ?? point.nav);
    const firstNav = cleaned.find((p) => navAccessor(p) > 0);
    let baseNav = navAccessor(firstNav ?? cleaned[0]);
    if (!Number.isFinite(baseNav) || baseNav <= 0) baseNav = 1;
    const firstBench = cleaned.find((p) => Number(p.bench) > 0)?.bench;
    let baseBench = Number(firstBench ?? cleaned[0].bench ?? cleaned[0].nav);
    if (!Number.isFinite(baseBench) || baseBench <= 0) baseBench = baseNav;
    const navData = hasData
      ? cleaned
          .map((p) => ({ time: toBusinessDay(p.date), value: ((navAccessor(p) / baseNav) - 1) * 100 }))
          .filter((p) => Number.isFinite(p.value))
      : [];
    const benchData = hasData
      ? cleaned
          .map((p) => ({
            time: toBusinessDay(p.date),
            value: ((Number(p.bench ?? p.nav) / (baseBench || baseNav)) - 1) * 100,
          }))
          .filter((p) => Number.isFinite(p.value))
      : [];
    const buildSectorPoints = (points: SeriesPoint[]) =>
      points
        .filter((p) => p.sector != null && Number.isFinite(Number(p.sector)))
        .map((p) => ({ time: toBusinessDay(p.date), value: Number(p.sector) }))
        .filter((p) => Number.isFinite(p.value));
    const buildReturnPoints = (points: SeriesPoint[]) => {
      const cleanedPoints = points.filter((p) => Number.isFinite(Number(navAccessor(p))) && Boolean(p.date));
      if (!cleanedPoints.length) return [];
      const first = cleanedPoints.find((p) => navAccessor(p) > 0) ?? cleanedPoints[0];
      let base = navAccessor(first);
      if (!Number.isFinite(base) || base <= 0) base = 1;
      return cleanedPoints
        .map((p) => ({ time: toBusinessDay(p.date), value: ((navAccessor(p) / base) - 1) * 100 }))
        .filter((p) => Number.isFinite(p.value));
    };
    const sectorData = hasData ? buildSectorPoints(cleaned) : [];
    navSeriesRef.current.setData(navData);
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
    if (showSector && sectorSeries.length && hasData) {
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
    if (extraSeries.length && hasData) {
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
  }, [data, showSector, showBench, sectorSeries, extraSeries]);

  return (
    <div className="chart-box chart-wrap" ref={containerRef}>
      {!hasData && <div className="chart-empty">No NAV data</div>}
      <div className="chart-legend">
        <span className="legend-item">
          <span className="swatch nav" /> Portfolio
        </span>
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
