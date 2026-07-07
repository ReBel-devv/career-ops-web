"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePrefersReducedMotion } from "@/lib/client/use-reduced-motion";
import type { HistogramBin } from "@/lib/analytics";
import { CHART, ChartTipBody, type ChartTipProps } from "./chart-card";

/**
 * Score distribution — one hue for one series; values live in the y-axis
 * ticks + tooltip (no number on every column). Hairline horizontal grid only.
 */
export function ScoreHistogram({ bins }: { bins: HistogramBin[] }) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={bins}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        barCategoryGap="22%"
      >
        <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: CHART.grid }}
          tick={CHART.tickMono}
          interval="preserveStartEnd"
        />
        <YAxis
          allowDecimals={false}
          width={28}
          tickLine={false}
          axisLine={false}
          tick={CHART.tickMono}
        />
        <Tooltip
          cursor={CHART.cursor}
          isAnimationActive={false}
          content={(props: ChartTipProps) => {
            const bin = props.payload?.[0]?.payload as HistogramBin | undefined;
            if (!props.active || !bin) return null;
            return (
              <ChartTipBody
                title={`Score ${bin.label}`}
                rows={[
                  {
                    value: String(bin.count),
                    label: bin.count === 1 ? "application" : "applications",
                  },
                ]}
              />
            );
          }}
        />
        <Bar
          dataKey="count"
          fill={CHART.accent}
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
          isAnimationActive={!reducedMotion}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
