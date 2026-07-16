"use client";

import { useMemo } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Gauge,
  Reply,
  Send,
  FileSearch,
} from "lucide-react";
import type { Application } from "@/lib/domain";
import { computePipelineStats, SUBMITTED_STATUS_IDS } from "@/lib/stats";

/**
 * KPI band for /analytics — the four headline numbers of the pipeline, same
 * math as the stats header (lib/stats.ts, mirroring analyze-patterns.mjs) so
 * the page never contradicts the chrome.
 *
 * Color rules: the value stays monochrome; only the week-over-week delta may
 * wear a state color (green = up, red = down — for volume KPIs more is
 * better). Rate/score cards carry their honest denominator instead.
 */

const WEEK_MS = 7 * 86_400_000;

/** Wall clock frozen at module load — render stays pure (react-hooks/purity);
 * page-load granularity is plenty for a "this week" delta. */
const LOADED_AT = Date.now();

interface Kpi {
  label: string;
  value: string;
  icon: typeof Send;
  /** Week-over-week change (this 7d vs previous 7d), colored by sign. */
  delta?: number;
  /** Muted context line (used when there is no delta). */
  sub?: string;
}

/** 0 = this week (last 7 days), 1 = the 7 days before, … */
function weeksAgo(date: string, now: number): number {
  const t = Date.parse(`${date}T00:00:00`);
  if (Number.isNaN(t)) return -1;
  const diff = now - t;
  return diff < 0 ? -1 : Math.floor(diff / WEEK_MS);
}

export function KpiCards({
  applications,
  allApplications,
}: {
  /** Rows in the current view (range-filtered) — the headline values. */
  applications: Application[];
  /** Every tracker row — week-over-week deltas stay meaningful even when a
   * short range would have cropped last week away. Defaults to the view. */
  allApplications?: Application[];
}) {
  const deltaSource = allApplications ?? applications;
  const kpis = useMemo<Kpi[]>(() => {
    const stats = computePipelineStats(applications);
    const tracked = [0, 0];
    const applied = [0, 0];
    for (const app of deltaSource) {
      const week = weeksAgo(app.date, LOADED_AT);
      if (week !== 0 && week !== 1) continue;
      tracked[week] += 1;
      // The tracker date becomes the apply date once a row turns Applied
      // (plan Decision 4), so this counts recent submissions.
      if (app.statusId !== null && SUBMITTED_STATUS_IDS.has(app.statusId)) {
        applied[week] += 1;
      }
    }

    return [
      {
        label: "Tracked",
        value: String(applications.length),
        icon: FileSearch,
        delta: tracked[0] - tracked[1],
      },
      {
        label: "Applied",
        value: String(stats.applied),
        icon: Send,
        delta: applied[0] - applied[1],
      },
      {
        label: "Response rate",
        value: stats.responseRate === null ? "—" : `${stats.responseRate}%`,
        icon: Reply,
        sub: `${stats.advanced} of ${stats.submitted} advanced`,
      },
      {
        label: "Avg score",
        value: stats.avgScore === null ? "—" : stats.avgScore.toFixed(1),
        icon: Gauge,
        sub: `${stats.scoredCount} scored`,
      },
    ];
  }, [applications, deltaSource]);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <section
          key={kpi.label}
          aria-label={kpi.label}
          className="flex flex-col gap-2 rounded-lg border bg-card p-4"
        >
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <kpi.icon className="size-3.5" aria-hidden />
            {kpi.label}
          </p>
          <p className="font-mono text-2xl font-semibold tabular-nums leading-none">
            {kpi.value}
          </p>
          {kpi.delta !== undefined ? <KpiDelta delta={kpi.delta} /> : null}
          {kpi.sub ? (
            <p className="text-xs text-muted-foreground">{kpi.sub}</p>
          ) : null}
        </section>
      ))}
    </div>
  );
}

/** Week-over-week delta — green up / red down / muted flat, always with the
 * plain-words period so the color never carries the meaning alone. */
function KpiDelta({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">±0</span> vs last week
      </p>
    );
  }
  const up = delta > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      <span
        className="flex items-center gap-0.5 font-mono font-semibold tabular-nums"
        style={{ color: up ? "var(--score-high)" : "var(--score-low)" }}
      >
        <Icon className="size-3.5" aria-hidden />
        {up ? "+" : ""}
        {delta}
      </span>
      vs last week
    </p>
  );
}
