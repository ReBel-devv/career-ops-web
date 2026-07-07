"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthCalendar } from "./month-calendar";
import { FollowUpItem } from "./follow-up-item";
import { useFollowUpCadence } from "@/lib/client/queries";
import { agendaGroups, partitionCadence } from "@/lib/follow-ups-view";
import type { CadenceEntry } from "@/lib/domain";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Follow-up calendar screen (F6): overdue pinned on top, month grid on desktop,
 * agenda grouped by day on mobile. All entries come from followup-cadence.mjs. */
export function FollowUpsView() {
  const { data, isLoading, isError, error } = useFollowUpCadence();

  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [monthIndex0, setMonthIndex0] = useState(now.getUTCMonth());

  const today = data?.metadata.analysisDate ?? now.toISOString().slice(0, 10);

  const { overdue, upcoming, cold } = useMemo(
    () => (data ? partitionCadence(data) : { overdue: [], upcoming: [], cold: [] }),
    [data],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="max-w-prose rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <p className="font-medium">Could not load follow-ups</p>
        <p className="mt-1 text-muted-foreground">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  const step = (delta: number) => {
    let m = monthIndex0 + delta;
    let y = year;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    while (m > 11) {
      m -= 12;
      y += 1;
    }
    setMonthIndex0(m);
    setYear(y);
  };

  const goToday = () => {
    setYear(now.getUTCFullYear());
    setMonthIndex0(now.getUTCMonth());
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Follow-ups</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{overdue.length} overdue</span>
          <span aria-hidden>·</span>
          <span>{upcoming.length} upcoming</span>
        </div>
      </div>

      {overdue.length > 0 ? (
        <section aria-label="Overdue follow-ups" className="flex flex-col gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-score-low">
            <AlertTriangle className="size-4" aria-hidden />
            Overdue ({overdue.length})
          </h2>
          <div className="flex flex-col gap-1.5">
            {overdue.map((e) => (
              <FollowUpItem key={e.num} entry={e} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Desktop: hand-rolled month grid */}
      <section aria-label="Follow-up calendar" className="hidden flex-col gap-3 md:flex">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => step(-1)} aria-label="Previous month">
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium">
            {MONTHS[monthIndex0]} {year}
          </span>
          <Button variant="outline" size="sm" onClick={() => step(1)} aria-label="Next month">
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday}>
            Today
          </Button>
        </div>
        <MonthCalendar
          year={year}
          monthIndex0={monthIndex0}
          entries={upcoming}
          today={today}
        />
      </section>

      {/* Mobile: agenda grouped by day */}
      <section aria-label="Follow-up agenda" className="flex flex-col gap-4 md:hidden">
        <Agenda entries={upcoming} />
      </section>

      {cold.length > 0 ? (
        <section aria-label="Cold applications" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Cold — no more scheduled follow-ups ({cold.length})
          </h2>
          <div className="flex flex-col gap-1.5">
            {cold.map((e) => (
              <FollowUpItem key={e.num} entry={e} />
            ))}
          </div>
        </section>
      ) : null}

      {overdue.length === 0 && upcoming.length === 0 && cold.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No actionable follow-ups. Apply to some roles to start the cadence.
        </p>
      ) : null}
    </div>
  );
}

function Agenda({ entries }: { entries: CadenceEntry[] }) {
  const groups = agendaGroups(entries);
  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No upcoming follow-ups.</p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.date} className="flex flex-col gap-1.5">
          <h3 className="font-mono text-xs tabular-nums text-muted-foreground">
            {group.date}
          </h3>
          {group.entries.map((e) => (
            <FollowUpItem key={e.num} entry={e} />
          ))}
        </div>
      ))}
    </div>
  );
}
