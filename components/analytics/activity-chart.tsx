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
import type { ActivityPoint } from "@/lib/analytics";
import { CHART, ChartTipBody, type ChartTipProps } from "./chart-card";

/**
 * Pipeline activity, weekly or daily — tracked rows (de-emphasis gray line)
 * vs actually submitted ones (foreground, soft area fill), plus a dashed
 * reference line at the mean applied per bucket: the cadence read (steady vs
 * sawtooth) at a glance. Monochrome by rule: series wear foreground + gray,
 * never a hue.
 */

export type ActivityGranularity = "weekly" | "daily";

export const GRANULARITY_OPTIONS: ReadonlyArray<{
  key: ActivityGranularity;
  label: string;
}> = [
  { key: "weekly", label: "Weekly" },
  { key: "daily", label: "Daily" },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Recharts re-animates the whole area path from scratch on every data change
 * (weekly⇄daily toggle, range filter) — its 1500ms/"ease" default reads as a
 * slow crawl. Override to a snappy micro-interaction (skill: 150–300ms,
 * ease-out) so the switch feels reactive: quick to move, gentle to settle.
 */
const ANIM_MS = 260;
const ANIM_EASING = "ease-out" as const;

/** Tooltip title — "Week of Jul 6" weekly, "Mon · Jul 6" daily (the weekday
 * makes weekend dips legible without cluttering the axis). */
function tipTitle(point: ActivityPoint, granularity: ActivityGranularity): string {
  if (granularity === "weekly") return `Week of ${point.label}`;
  const day = new Date(`${point.date}T00:00:00Z`).getUTCDay();
  return `${WEEKDAYS[day]} · ${point.label}`;
}

export function ActivityChart({
  points,
  granularity,
}: {
  points: ActivityPoint[];
  granularity: ActivityGranularity;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const avgApplied =
    points.length > 0
      ? points.reduce((sum, p) => sum + p.applied, 0) / points.length
      : 0;
  const avgUnit = granularity === "weekly" ? "wk" : "d";

  return (
    <ResponsiveContainer width="100%" height={220}>
      {/* Keyed on granularity so weekly⇄daily remounts and plays a clean
          left→right entrance reveal. Recharts' data-change animation is an
          index-based tween (old point n → new point n); across datasets with
          different lengths AND x-domains (weekly Mondays vs daily dates) that
          maps unrelated points onto each other, producing a garbage in-between
          shape — the "curve jumps from nowhere" on daily→weekly. A remount
          sidesteps the tween entirely and is symmetric in both directions. */}
      <AreaChart
        key={granularity}
        data={points}
        margin={{ top: 8, right: 20, bottom: 0, left: 0 }}
      >
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
            const point = props.payload?.[0]?.payload as ActivityPoint | undefined;
            if (!props.active || !point) return null;
            return (
              <ChartTipBody
                title={tipTitle(point, granularity)}
                rows={[
                  { value: String(point.tracked), label: "tracked" },
                  { value: String(point.applied), label: "applied" },
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
              value: `avg ${avgApplied.toFixed(1)}/${avgUnit}`,
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
          animationDuration={ANIM_MS}
          animationEasing={ANIM_EASING}
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
          animationDuration={ANIM_MS}
          animationEasing={ANIM_EASING}
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
