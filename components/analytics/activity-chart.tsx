"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePrefersReducedMotion } from "@/lib/client/use-reduced-motion";
import type { ActivityWeek } from "@/lib/analytics";
import { CHART, ChartTipBody, type ChartTipProps } from "./chart-card";

/**
 * Weekly pipeline activity — tracked rows (de-emphasis gray line) vs actually
 * submitted ones (foreground, soft area fill), plus a dashed reference line at
 * the mean applied/week: the cadence read (steady vs sawtooth) at a glance.
 * Monochrome by rule: series wear foreground + gray, never a hue.
 */
export function ActivityChart({ weeks }: { weeks: ActivityWeek[] }) {
  const reducedMotion = usePrefersReducedMotion();
  const avgApplied =
    weeks.length > 0
      ? weeks.reduce((sum, w) => sum + w.applied, 0) / weeks.length
      : 0;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={weeks} margin={{ top: 8, right: 20, bottom: 0, left: 0 }}>
        <defs>
          {/* Soft accent wash under the applied line (reference-dashboard
              idiom) — fades to transparent so the grid stays readable. */}
          <linearGradient id="applied-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.accent} stopOpacity={0.16} />
            <stop offset="100%" stopColor={CHART.accent} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: CHART.grid }}
          tick={CHART.tickMono}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          width={28}
          tickLine={false}
          axisLine={false}
          tick={CHART.tickMono}
        />
        <Tooltip
          cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.4 }}
          isAnimationActive={false}
          content={(props: ChartTipProps) => {
            const week = props.payload?.[0]?.payload as ActivityWeek | undefined;
            if (!props.active || !week) return null;
            return (
              <ChartTipBody
                title={`Week of ${week.label}`}
                rows={[
                  { value: String(week.tracked), label: "tracked" },
                  { value: String(week.applied), label: "applied" },
                ]}
              />
            );
          }}
        />
        {avgApplied > 0 ? (
          <ReferenceLine
            y={avgApplied}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            strokeOpacity={0.7}
            label={{
              value: `avg ${avgApplied.toFixed(1)}/wk`,
              position: "insideTopLeft",
              fill: "var(--muted-foreground)",
              fontSize: 10,
              fontFamily: "var(--font-mono, ui-monospace)",
            }}
          />
        ) : null}
        <Area
          type="monotone"
          dataKey="tracked"
          stroke={CHART.grayed}
          strokeWidth={1.5}
          fill="transparent"
          dot={false}
          activeDot={{ r: 3, fill: CHART.grayed, strokeWidth: 0 }}
          isAnimationActive={!reducedMotion}
        />
        <Area
          type="monotone"
          dataKey="applied"
          stroke={CHART.accent}
          strokeWidth={2}
          fill="url(#applied-fill)"
          dot={false}
          activeDot={{ r: 3, fill: CHART.accent, strokeWidth: 0 }}
          isAnimationActive={!reducedMotion}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Inline header legend — accent chip + gray chip, text in text tokens. */
export function ActivityLegend() {
  return (
    <p className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block size-2 rounded-full"
          style={{ background: CHART.grayed }}
        />
        Tracked
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block size-2 rounded-full"
          style={{ background: CHART.accent }}
        />
        Applied
      </span>
    </p>
  );
}
