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
import type { FunnelStage } from "@/lib/analytics";
import {
  BarEndLabel,
  CHART,
  ChartTipBody,
  type ChartTipProps,
} from "./chart-card";

/**
 * Pipeline funnel — cumulative "reached at least" stages with per-stage
 * conversion %. Single series → single accent hue, no legend (the title names
 * it); count + conversion direct-labeled at every bar end (5 bars = the
 * labels ARE the reading; the axis is hidden).
 */
export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <ResponsiveContainer width="100%" height={stages.length * 40 + 8}>
      <BarChart
        data={stages}
        layout="vertical"
        margin={{ top: 4, right: 118, bottom: 4, left: 0 }}
      >
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis
          type="category"
          dataKey="label"
          width={78}
          axisLine={false}
          tickLine={false}
          tick={CHART.tick}
        />
        <Tooltip
          cursor={CHART.cursor}
          isAnimationActive={false}
          content={(props: ChartTipProps) => {
            const stage = props.payload?.[0]?.payload as FunnelStage | undefined;
            if (!props.active || !stage) return null;
            return (
              <ChartTipBody
                title={stage.label}
                rows={[
                  { value: String(stage.count), label: "reached this stage" },
                  {
                    value: `${stage.pctOfTotal}%`,
                    label: "of all evaluated",
                  },
                  ...(stage.pctOfPrev !== null
                    ? [
                        {
                          value: `${stage.pctOfPrev}%`,
                          label: "conversion from previous stage",
                        },
                      ]
                    : []),
                ]}
              />
            );
          }}
        />
        <Bar
          dataKey="count"
          fill={CHART.accent}
          barSize={20}
          radius={[0, 4, 4, 0]}
          minPointSize={2}
          isAnimationActive={!reducedMotion}
        >
          {/* count strong mono + conversion muted at every bar end */}
          <LabelList
            content={
              <BarEndLabel
                texts={stages.map((s) => ({
                  main: String(s.count),
                  sub:
                    s.pctOfPrev !== null ? `${s.pctOfPrev}% of prev` : undefined,
                }))}
              />
            }
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
