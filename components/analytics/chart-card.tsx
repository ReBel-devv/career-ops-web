"use client";

import type { ReactNode } from "react";
import { Rectangle } from "recharts";

/**
 * Shared chart chrome for /analytics (plan §6 + dataviz method):
 * - monochrome: series wear the foreground (white on dark, near-black on
 *   light); the only second "color" is the de-emphasis gray for low-n marks
 * - red/green (score-ramp tokens) are reserved for STATE — KPI deltas, aging
 *   alerts, globe score dots — never for bars or lines
 * - hairline solid grid/axes in --border, recessive
 * - text wears text tokens (never the series color); numbers are mono
 */

/** Chart color/style tokens — CSS variables so dark/light both resolve. */
export const CHART = {
  /** The single data hue — monochrome foreground, like the rest of the site. */
  accent: "var(--foreground)",
  /** De-emphasis gray for low-n / contextual marks. */
  grayed: "var(--chart-2)",
  /** State colors — deltas and alerts only, never series. AA as text on card
   * surfaces in both themes (see --score-* notes in globals.css). */
  positive: "var(--score-high)",
  negative: "var(--score-low)",
  /** Hairline grid + axis lines. */
  grid: "var(--border)",
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
  tickMono: {
    fill: "var(--muted-foreground)",
    fontSize: 11,
    fontFamily: "var(--font-mono, ui-monospace)",
  },
  /** Hover cursor wash behind bars — a ghost, never a highlight fill. */
  cursor: { fill: "var(--muted)", fillOpacity: 0.6 },
  /** Shared entrance-motion tokens. `growMs` mirrors --chart-grow-dur in
   * globals.css (the grow itself + its easing live in CSS); `staggerMs` is the
   * per-bar cascade delay, kept small so long breakdowns don't turn sluggish
   * (skill: 20–45ms/item). Used to time the bar-end label fade-in. */
  motion: { growMs: 460, staggerMs: 45 },
} as const;

/**
 * Custom Recharts bar shape: renders the normal rounded rectangle wrapped in a
 * group that grows from its axis via a CSS keyframe, cascaded by `index`. Keeps
 * every bit of Recharts' own infrastructure (geometry, Cells, tooltips,
 * LabelList) — only the entrance is ours. Pair with `isAnimationActive={false}`
 * on the <Bar> so Recharts' bulk animation doesn't double up.
 *
 * `radius` is passed per chart (Recharts doesn't forward it to custom shapes);
 * `animate` is `!prefersReducedMotion` — false renders a plain, static bar.
 */
export function growBar(opts: {
  orientation: "horizontal" | "vertical";
  radius: number | [number, number, number, number];
  animate: boolean;
}) {
  return function GrowBar(props: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    fill?: string;
    index?: number;
  }) {
    const { x, y, width, height, fill, index = 0 } = props;
    const rect = { x, y, width, height, fill, radius: opts.radius };
    if (!opts.animate) return <Rectangle {...rect} />;
    return (
      <g
        className="chart-grow-bar"
        data-axis={opts.orientation === "vertical" ? "y" : "x"}
        style={{ animationDelay: `${index * CHART.motion.staggerMs}ms` }}
      >
        <Rectangle {...rect} />
      </g>
    );
  };
}

export function ChartCard({
  title,
  subtitle,
  children,
  footer,
  className,
  aside,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Right side of the header row — inline legend, meta chip. */
  aside?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={`flex flex-col gap-3 rounded-lg border bg-card p-4 ${className ?? ""}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </header>
      {children}
      {footer ? (
        <footer className="border-t pt-2 text-xs text-muted-foreground">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

/**
 * Minimal structural type for Recharts custom tooltip content functions.
 * Recharts' own `TooltipContentProps<TValue, TName>` generics don't unify with
 * concrete instantiations under TS strict; every chart only reads `active` +
 * the hovered datum, so this narrow supertype keeps the boundary simple (the
 * datum itself is re-narrowed per chart).
 */
export interface ChartTipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
}

/** Tooltip shell — values lead (strong, mono), labels follow (muted). */
export function ChartTipBody({
  title,
  rows,
}: {
  title: string;
  rows: ReadonlyArray<{ label: string; value: string }>;
}) {
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="mt-0.5 flex items-baseline gap-2">
          <span className="font-mono font-semibold tabular-nums">{row.value}</span>
          <span className="text-muted-foreground">{row.label}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Bar-end label for horizontal bars — `{main}` strong mono + optional muted
 * `{sub}` (e.g. a conversion % or the non-negotiable `n=` on vendor bars).
 * Recharts v3 clones LabelList `content` elements with `viewBox` + `index`
 * (NOT top-level x/y/width/height), so geometry is read from the viewBox.
 */
export function BarEndLabel({
  texts,
  viewBox,
  index,
  animate = false,
}: {
  /** One entry per bar, in data order. */
  texts: ReadonlyArray<{ main: string; sub?: string; mutedMain?: boolean }>;
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
  index?: number;
  /** Fade the label in, timed to land as its bar finishes growing. */
  animate?: boolean;
}) {
  if (
    index === undefined ||
    viewBox?.x === undefined ||
    viewBox.y === undefined ||
    viewBox.width === undefined ||
    viewBox.height === undefined
  ) {
    return null;
  }
  const text = texts[index];
  if (!text) return null;
  return (
    <text
      x={viewBox.x + viewBox.width + 8}
      y={viewBox.y + viewBox.height / 2}
      dominantBaseline="central"
      fontSize={11}
      fontFamily="var(--font-mono, ui-monospace)"
      className={animate ? "chart-label-in" : undefined}
      // Land as the bar arrives: its stagger delay + most of the grow.
      style={
        animate
          ? { animationDelay: `${index * CHART.motion.staggerMs + 210}ms` }
          : undefined
      }
    >
      <tspan
        fill={text.mutedMain ? "var(--muted-foreground)" : "var(--foreground)"}
        fontWeight={600}
      >
        {text.main}
      </tspan>
      {text.sub ? (
        <tspan dx={6} fill="var(--muted-foreground)">
          {text.sub}
        </tspan>
      ) : null}
    </text>
  );
}

/** Empty-state body for a chart card with nothing to plot yet. */
export function ChartEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="flex min-h-24 items-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
