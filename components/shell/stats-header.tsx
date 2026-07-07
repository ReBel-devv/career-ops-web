"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";
import { AvatarMenu } from "./avatar-menu";
import { useApplications, useFollowUpCadence } from "@/lib/client/queries";
import { computePipelineStats } from "@/lib/stats";
import { followUpSummary } from "@/lib/follow-ups-view";
import { openCommandPalette } from "@/components/command/command-palette";

interface StatChip {
  label: string;
  value: string;
  /** Honest denominator / detail for rates (small n — don't lie). */
  title?: string;
}

/**
 * Persistent stats header (F3). Numbers are computed client-side from the
 * shared applications query, using the same funnel conventions as
 * `analyze-patterns.mjs` (see lib/stats.ts): "applied" = submitted, "response
 * rate" = advanced / submitted. Follow-ups due/overdue stay "—" until M4 wires
 * `followup-cadence.mjs` — the shape is already typed (stats.followUps).
 *
 * Stats reflect the WHOLE pipeline (unfiltered) — the header is a fixed
 * summary, not a view of the current filter.
 */
export function StatsHeader() {
  const { data, isSuccess } = useApplications();
  const cadenceQuery = useFollowUpCadence();

  const chips = useMemo<StatChip[]>(() => {
    if (!isSuccess || !data) {
      return [
        { label: "Applied", value: "—" },
        { label: "Avg score", value: "—" },
        { label: "Response rate", value: "—" },
        { label: "Follow-ups due", value: "—" },
      ];
    }
    const s = computePipelineStats(data);
    // Follow-ups due/overdue come from followup-cadence.mjs (never recomputed).
    const fu = cadenceQuery.data ? followUpSummary(cadenceQuery.data) : null;
    return [
      { label: "Applied", value: String(s.applied) },
      {
        label: "Avg score",
        value: s.avgScore === null ? "—" : s.avgScore.toFixed(1),
        title: s.avgScore === null ? undefined : `${s.scoredCount} scored`,
      },
      {
        label: "Response rate",
        value: s.responseRate === null ? "—" : `${s.responseRate}%`,
        title: `${s.advanced} of ${s.submitted} submitted advanced past screening`,
      },
      {
        label: "Follow-ups due",
        value: fu === null ? "—" : String(fu.due),
        title: fu === null ? undefined : `${fu.overdue} overdue`,
      },
    ];
  }, [data, isSuccess, cadenceQuery.data]);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
      <div
        className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none]"
        aria-label="Pipeline stats"
      >
        {chips.map((stat) => (
          <div
            key={stat.label}
            title={stat.title}
            className="flex shrink-0 items-baseline gap-1.5 rounded-md border bg-card px-2.5 py-1"
          >
            <span className="font-mono text-data font-medium tabular-nums">{stat.value}</span>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={openCommandPalette}
        aria-label="Open command palette"
        className="hidden h-9 items-center gap-2 rounded-md border bg-card px-2.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:inline-flex"
      >
        <Search className="size-3.5" aria-hidden />
        Search
        <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">⌘K</kbd>
      </button>
      <AvatarMenu />
    </header>
  );
}
