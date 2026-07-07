"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { STATUS_DOT_CLASS } from "@/components/data/status-indicator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FollowUpActions } from "./follow-up-actions";
import { dueLabel } from "./follow-up-item";
import { buildMonthMatrix, type CalendarDay } from "@/lib/follow-ups-view";
import type { CadenceEntry } from "@/lib/domain";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Hand-rolled month grid (plan §5 — no calendar library). Renders the upcoming
 * follow-ups on their scheduled day; each is a Popover with the app link + the
 * reschedule / log actions. Overdue items are pinned above the grid by the
 * parent, so the grid focuses on what's scheduled. Desktop only (md+).
 */
export function MonthCalendar({
  year,
  monthIndex0,
  entries,
  today,
}: {
  year: number;
  monthIndex0: number;
  entries: CadenceEntry[];
  today: string;
}) {
  const weeks = buildMonthMatrix(year, monthIndex0, entries, today);

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((day) => (
          <DayCell key={day.date} day={day} />
        ))}
      </div>
    </div>
  );
}

function DayCell({ day }: { day: CalendarDay }) {
  return (
    <div
      className={cn(
        "min-h-24 border-b border-r p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0",
        !day.inMonth && "bg-muted/20 text-muted-foreground/50",
      )}
    >
      <div className="mb-1 flex items-center justify-end">
        <span
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-full font-mono text-xs tabular-nums",
            day.isToday
              ? "bg-primary font-semibold text-primary-foreground"
              : day.inMonth
                ? "text-muted-foreground"
                : "text-muted-foreground/50",
          )}
        >
          {day.day}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {day.entries.map((entry) => (
          <DayChip key={entry.num} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function DayChip({ entry }: { entry: CadenceEntry }) {
  const dot = STATUS_DOT_CLASS[entry.status] ?? "bg-muted-foreground/40";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`${entry.company} — ${entry.role}`}
          className="flex w-full items-center gap-1.5 rounded border bg-card px-1.5 py-1 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dot)} />
          <span className="truncate">{entry.company}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <div className="flex flex-col gap-2">
          <div>
            <p className="font-medium">{entry.company}</p>
            <p className="text-xs text-muted-foreground">{entry.role}</p>
          </div>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {entry.nextFollowupDate} · {dueLabel(entry)}
          </p>
          <Link
            href={`/app/${entry.num}`}
            className="inline-flex w-fit items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            View application
          </Link>
          <FollowUpActions entry={entry} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
