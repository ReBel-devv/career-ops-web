"use client";

import { useMemo } from "react";
import { pipelineAging } from "@/lib/analytics";
import type { Application } from "@/lib/domain";
import { ChartCard, ChartEmpty } from "./chart-card";

/**
 * Pipeline aging — submitted applications still waiting on a FIRST reply
 * (status exactly `applied`), bucketed by days since the apply date. The
 * final `> 21d` bucket is the follow-up alarm: its count wears the negative
 * color when non-zero (state, not decoration); everything else stays neutral.
 */

/** Frozen at module load — same purity convention as kpi-cards. */
const LOADED_AT = Date.now();

export function AgingCard({
  applications,
  className,
}: {
  applications: Application[];
  className?: string;
}) {
  const aging = useMemo(
    () => pipelineAging(applications, LOADED_AT),
    [applications],
  );

  return (
    <ChartCard
      className={className}
      title="Waiting on a reply"
      subtitle="Submitted, no response yet — time since the apply date."
      footer={
        aging.waiting > 0 ? (
          <>
            <span className="font-mono">{aging.waiting}</span> waiting · oldest{" "}
            <span className="font-mono">{aging.oldestDays}d</span> — anything
            past 21d is overdue for a follow-up.
          </>
        ) : undefined
      }
    >
      {aging.waiting === 0 ? (
        <ChartEmpty>Nothing waiting on a reply.</ChartEmpty>
      ) : (
        <div className="grid flex-1 grid-cols-4 items-center gap-2">
          {aging.buckets.map((bucket) => {
            const alarm = bucket.stale && bucket.count > 0;
            return (
              <div key={bucket.label} className="flex flex-col gap-1 text-center">
                <span
                  className="font-mono text-xl font-semibold tabular-nums"
                  style={alarm ? { color: "var(--score-low)" } : undefined}
                >
                  {bucket.count}
                </span>
                <span className="text-xs text-muted-foreground">
                  {bucket.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}
