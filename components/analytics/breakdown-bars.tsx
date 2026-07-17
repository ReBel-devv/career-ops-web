"use client";

import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePrefersReducedMotion } from "@/lib/client/use-reduced-motion";
import type { BreakdownDatum } from "@/lib/analytics";
import {
  BarEndLabel,
  CHART,
  ChartTipBody,
  growBar,
  type ChartTipProps,
} from "./chart-card";

/**
 * Horizontal count bars for a categorical breakdown (archetype families,
 * location buckets). One series → one hue; the count rides each bar's tip.
 */
export function BreakdownBars({
  data,
  unit = "reports",
  yAxisWidth = 64,
}: {
  data: BreakdownDatum[];
  unit?: string;
  /** Category label column width — keep it just wide enough for the labels so
   * the bars sit flush left instead of behind a wide gutter. */
  yAxisWidth?: number;
}) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <ResponsiveContainer width="100%" height={data.length * 34 + 8}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 40, bottom: 4, left: 0 }}
      >
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis
          type="category"
          dataKey="label"
          width={yAxisWidth}
          axisLine={false}
          tickLine={false}
          tick={CHART.tick}
        />
        <Tooltip
          cursor={CHART.cursor}
          isAnimationActive={false}
          content={(props: ChartTipProps) => {
            const datum = props.payload?.[0]?.payload as
              | BreakdownDatum
              | undefined;
            if (!props.active || !datum) return null;
            return (
              <ChartTipBody
                title={datum.label}
                rows={[{ value: String(datum.count), label: unit }]}
              />
            );
          }}
        />
        <Bar
          dataKey="count"
          fill={CHART.accent}
          barSize={18}
          minPointSize={2}
          isAnimationActive={false}
          shape={growBar({
            orientation: "horizontal",
            radius: [0, 4, 4, 0],
            animate: !reducedMotion,
          })}
        >
          {/* count at every bar tip (bars → value at the tip) */}
          <LabelList
            content={
              <BarEndLabel
                animate={!reducedMotion}
                texts={data.map((d) => ({ main: String(d.count) }))}
              />
            }
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
