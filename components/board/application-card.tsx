"use client";

import Link from "next/link";
import * as React from "react";
import { forwardRef, type ReactNode } from "react";
import { AlertTriangle, FileText, UsersRound } from "lucide-react";
import { ScoreBadge } from "@/components/data/score-badge";
import { STAGE_LABELS, type OutreachCardHint } from "@/lib/outreach-view";
import type { Application } from "@/lib/domain";
import { cn } from "@/lib/utils";

/**
 * Presentational Kanban card. Kept drag-agnostic so it renders identically in
 * the desktop draggable column, the drag overlay, and the mobile list.
 *
 * The `overdue` prop is a clean seam for M4: follow-up cadence isn't wired yet,
 * so the board never passes it (indicator stays hidden). When M4 computes
 * overdue follow-ups, pass `overdue` and the indicator lights up — no other
 * change needed.
 */
export interface ApplicationCardProps
  extends React.HTMLAttributes<HTMLDivElement> {
  app: Application;
  /** Slot for the move-menu / drag affordance rendered by the parent. */
  action?: ReactNode;
  /** M4 seam — follow-up past its pinned date. */
  overdue?: boolean;
  /** M6 — outreach presence hint (contact count + furthest stage). */
  outreach?: OutreachCardHint;
  dragging?: boolean;
}

export const ApplicationCard = forwardRef<HTMLDivElement, ApplicationCardProps>(
  function ApplicationCard(
    { app, action, overdue = false, outreach, dragging = false, className, ...rest },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={cn(
          // Minimalist premium card: hairline border + subtle shadow, gentle
          // lift on hover. Status color is carried by the column (and the score
          // badge) — no left accent bar.
          "group/card rounded-md border bg-card p-2.5 text-data shadow-xs",
          "transition-[box-shadow,border-color,transform] duration-150",
          "hover:border-foreground/20 hover:shadow-sm",
          dragging && "opacity-60",
          className,
        )}
        {...rest}
      >
        <div className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {String(app.num).padStart(3, "0")}
              </span>
              {overdue ? (
                <AlertTriangle
                  className="size-3 text-score-low"
                  aria-label="Follow-up overdue"
                />
              ) : null}
            </div>
            <Link
              href={`/app/${app.num}`}
              className="mt-0.5 block truncate font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              title={`${app.company} — ${app.role}`}
            >
              {app.company}
            </Link>
            <p className="truncate text-muted-foreground" title={app.role}>
              {app.role}
            </p>
          </div>
          {action}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <ScoreBadge raw={app.scoreRaw} score={app.score} />
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {app.date}
          </span>
          {outreach ? (
            <span
              className="ml-auto inline-flex items-center gap-0.5 text-muted-foreground"
              title={`${outreach.count} outreach contact${outreach.count > 1 ? "s" : ""} — furthest stage: ${STAGE_LABELS[outreach.topStage]}`}
              aria-label={`${outreach.count} outreach contacts, furthest stage ${STAGE_LABELS[outreach.topStage]}`}
            >
              <UsersRound className="size-3" aria-hidden />
              <span className="font-mono text-[10px] tabular-nums">
                {outreach.count}
              </span>
            </span>
          ) : null}
          {app.hasPdf ? (
            <FileText
              className={cn(
                "size-3.5 text-muted-foreground",
                !outreach && "ml-auto",
              )}
              aria-label="CV PDF generated"
            />
          ) : null}
        </div>

        {app.notes.trim() !== "" ? (
          <p
            className="mt-2 line-clamp-2 text-xs leading-snug text-muted-foreground"
            title={app.notes}
          >
            {app.notes}
          </p>
        ) : null}
      </div>
    );
  },
);
