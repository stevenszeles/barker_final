import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { downsample } from "../lib/chart";
import { percent, shortDate } from "../lib/format";
import type { NavPoint } from "../types";

export function PerformanceChart({ points, height = 360 }: { points: NavPoint[]; height?: number }) {
  const rows = useMemo(() => {
    if (!points.length) return [];
    const firstNav = points.find((point) => point.nav > 0)?.nav || 1;
    const firstBench = points.find((point) => (point.bench ?? 0) > 0)?.bench ?? null;
    return downsample(
      points.map((point) => ({
        date: point.date,
        portfolio: point.twr ? (point.twr - 1) * 100 : ((point.nav / firstNav) - 1) * 100,
        benchmark: point.bench !== null && point.bench > 0 && firstBench
          ? ((point.bench / firstBench) - 1) * 100
          : null,
      })),
    );
  }, [points]);

  return (
    <div style={{ height }} className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 2 }}>
          <CartesianGrid stroke="rgba(148,163,184,.1)" vertical={false} />
          <XAxis
            dataKey="date"
            minTickGap={52}
            tickFormatter={(value) => shortDate(String(value)).replace(/, \d{4}/, "")}
            tick={{ fill: "#7f8b9d", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value) => `${value.toFixed(0)}%`}
            tick={{ fill: "#7f8b9d", fontSize: 11 }}
            width={48}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            labelFormatter={(value) => shortDate(String(value))}
            formatter={(value: number, name: string) => [percent(value), name]}
            contentStyle={{ background: "#101722", border: "1px solid #273448", borderRadius: 8 }}
          />
          <Legend />
          <Line type="monotone" dataKey="portfolio" name="Portfolio" stroke="#5ce1b9" strokeWidth={2.3} dot={false} />
          <Line type="monotone" dataKey="benchmark" name="Benchmark" stroke="#7298ff" strokeWidth={1.7} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
