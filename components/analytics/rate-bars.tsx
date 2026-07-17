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
import type { RateDatum } from "@/lib/analytics";
import {
  BarEndLabel,
  CHART,
  ChartTipBody,
  growBar,
  type ChartTipProps,
} from "./chart-card";

/**
 * Horizontal advance-rate bars for any categorical breakdown (ATS vendors,
 * score bands, archetype families). F5 honesty rules baked in: low-n bars are
 * GRAYED but never hidden, and every rate carries its n right on the bar
 * (`{rate}% · n={total}` — small n = don't lie).
 */
export function RateBars({
  data,
  minSample,
  yAxisWidth = 96,
  advancedLabel = "advanced past screening",
}: {
  data: RateDatum[];
  minSample: number;
  /** Category label column width — widen for long labels. */
  yAxisWidth?: number;
  advancedLabel?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <ResponsiveContainer width="100%" height={data.length * 36 + 8}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 96, bottom: 4, left: 0 }}
      >
        <XAxis type="number" hide domain={[0, 100]} />
        <YAxis
          type="category"
          dataKey="label"
          width={yAxisWidth}
          axisLine={false}
          tickLine={false}
          tick={CHART.tick}
          // Long free-prose labels (archetype families) get clipped, not
          // wrapped into 4-line ticks — the tooltip carries the full name.
          tickFormatter={(value: string) =>
            value.length > 22 ? `${value.slice(0, 21)}…` : value
          }
        />
        <Tooltip
          cursor={CHART.cursor}
          isAnimationActive={false}
          content={(props: ChartTipProps) => {
            const datum = props.payload?.[0]?.payload as RateDatum | undefined;
            if (!props.active || !datum) return null;
            return (
              <ChartTipBody
                title={datum.label}
                rows={[
                  { value: `${datum.rate}%`, label: "advance rate" },
                  { value: `${datum.advanced}/${datum.n}`, label: advancedLabel },
                  ...(datum.grayed
                    ? [
                        {
                          value: `n<${minSample}`,
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
          dataKey="rate"
          barSize={20}
          minPointSize={2}
          isAnimationActive={false}
          shape={growBar({
            orientation: "horizontal",
            radius: [0, 4, 4, 0],
            animate: !reducedMotion,
          })}
        >
          {data.map((datum) => (
            <Cell
              key={datum.label}
              fill={datum.grayed ? CHART.grayed : CHART.accent}
            />
          ))}
          {/* `{rate}% · n={total}` at every bar end — the n is non-negotiable (F5) */}
          <LabelList
            content={
              <BarEndLabel
                animate={!reducedMotion}
                texts={data.map((d) => ({
                  main: `${d.rate}%`,
                  sub: `n=${d.n}`,
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
