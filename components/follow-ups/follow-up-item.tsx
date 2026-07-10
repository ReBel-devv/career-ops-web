"use client";

import Link from "next/link";
import { STATUS_DOT_CLASS } from "@/components/data/status-indicator";
import { FollowUpActions } from "./follow-up-actions";
import type { CadenceEntry } from "@/lib/domain";
import { cn } from "@/lib/utils";

/** Human "due in / overdue by" phrasing from daysUntilNext (≤0 = past). */
export function dueLabel(entry: CadenceEntry): string {
  const d = entry.daysUntilNext;
  if (d === null) return "no next date";
  if (d === 0) return "due today";
  if (d < 0) return `${Math.abs(d)}d overdue`;
  return `in ${d}d`;
}

/**
 * One follow-up row: links to the application detail (drawer route from M3),
 * shows status + next-date + urgency, and carries the reschedule / log actions.
 * Overdue uses a muted status-appropriate treatment (not a saturated red fill).
 */
export function FollowUpItem({ entry }: { entry: CadenceEntry }) {
  const overdue = entry.urgency === "overdue" || entry.urgency === "urgent";
  const dot = STATUS_DOT_CLASS[entry.status] ?? "bg-muted-foreground/40";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-card px-3 py-2 text-data transition-colors",
        overdue && "bg-score-low/5",
      )}
    >
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dot)} />
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {String(entry.num).padStart(3, "0")}
      </span>
      <Link
        href={`/app/${entry.num}`}
        className="min-w-0 flex-1 truncate font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        title={`${entry.company} — ${entry.role}`}
      >
        {entry.company}
        <span className="ml-1.5 font-normal text-muted-foreground">{entry.role}</span>
      </Link>

      {entry.nextFollowupDate ? (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {entry.nextFollowupDate}
        </span>
      ) : null}
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-xs",
          overdue
            ? "bg-score-low/10 text-score-low"
            : "text-muted-foreground",
        )}
      >
        {dueLabel(entry)}
      </span>

      <FollowUpActions entry={entry} />
    </div>
  );
}
