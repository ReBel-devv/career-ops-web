"use client";

import type { ReactNode } from "react";

/**
 * Shared chart chrome for /analytics (plan §6 + dataviz method):
 * - monochrome neutral ramp, ONE accent (--primary) as the single data hue;
 *   the only second "color" is the de-emphasis gray for low-n marks
 * - hairline solid grid/axes in --border, recessive
 * - text wears text tokens (never the series color); numbers are mono
 */

/** Chart color/style tokens — CSS variables so dark/light both resolve. */
export const CHART = {
  /** The single data accent (muted blue, theme-tuned). */
  accent: "var(--primary)",
  /** De-emphasis gray for low-n / contextual marks. */
  grayed: "var(--chart-2)",
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
} as const;

export function ChartCard({
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={`flex flex-col gap-3 rounded-lg border bg-card p-4 ${className ?? ""}`}
    >
      <header>
        <h2 className="text-sm font-medium">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
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
}: {
  /** One entry per bar, in data order. */
  texts: ReadonlyArray<{ main: string; sub?: string; mutedMain?: boolean }>;
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
  index?: number;
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
