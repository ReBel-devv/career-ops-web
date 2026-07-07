"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePrefersReducedMotion } from "@/lib/client/use-reduced-motion";
import type { VendorChartData, VendorDatum } from "@/lib/analytics";
import {
  BarEndLabel,
  CHART,
  ChartEmpty,
  ChartTipBody,
  type ChartTipProps,
} from "./chart-card";

/**
 * ATS channel yield — advance rate per vendor. F5 honesty rules: low-n bars
 * are GRAYED but never hidden, and every rate carries its n right on the bar
 * (`{rate}% · n={total}` — small n = don't lie).
 */
export function VendorChart({ chart }: { chart: VendorChartData }) {
  const reducedMotion = usePrefersReducedMotion();

  if (chart.data.length === 0) {
    return (
      <ChartEmpty>
        No submitted application routed through an identified ATS vendor yet
        ({chart.identified} of {chart.submitted} submitted identified).
      </ChartEmpty>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={chart.data.length * 36 + 8}>
      <BarChart
        data={chart.data}
        layout="vertical"
        margin={{ top: 4, right: 96, bottom: 4, left: 0 }}
      >
        <XAxis type="number" hide domain={[0, 100]} />
        <YAxis
          type="category"
          dataKey="vendor"
          width={96}
          axisLine={false}
          tickLine={false}
          tick={CHART.tick}
        />
        <Tooltip
          cursor={CHART.cursor}
          isAnimationActive={false}
          content={(props: ChartTipProps) => {
            const datum = props.payload?.[0]?.payload as VendorDatum | undefined;
            if (!props.active || !datum) return null;
            return (
              <ChartTipBody
                title={datum.vendor}
                rows={[
                  { value: `${datum.advanceRate}%`, label: "advance rate" },
                  {
                    value: `${datum.advanced}/${datum.total}`,
                    label: "advanced past screening",
                  },
                  ...(datum.grayed
                    ? [
                        {
                          value: `n<${chart.minSample}`,
                          label: "low sample — not a claim",
                        },
                      ]
                    : []),
                ]}
              />
            );
          }}
        />
        <Bar
          dataKey="advanceRate"
          barSize={20}
          radius={[0, 4, 4, 0]}
          minPointSize={2}
          isAnimationActive={!reducedMotion}
        >
          {chart.data.map((datum) => (
            <Cell
              key={datum.vendor}
              fill={datum.grayed ? CHART.grayed : CHART.accent}
            />
          ))}
          {/* `{rate}% · n={total}` at every bar end — the n is non-negotiable (F5) */}
          <LabelList
            content={
              <BarEndLabel
                texts={chart.data.map((d) => ({
                  main: `${d.advanceRate}%`,
                  sub: `n=${d.total}`,
                  mutedMain: d.grayed,
                }))}
              />
            }
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
