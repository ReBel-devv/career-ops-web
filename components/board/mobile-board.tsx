"use client";

import { useState } from "react";
import { MoveHorizontal } from "lucide-react";
import { ApplicationCard } from "@/components/board/application-card";
import { STATUS_DOT_CLASS } from "@/components/data/status-indicator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Application, CanonicalState } from "@/lib/domain";
import type { BoardColumn } from "@/lib/grouping";
import { cn } from "@/lib/utils";

/**
 * Mobile board (< md): single column per view with a swipeable segmented status
 * control, and a "Move to status" action sheet per card instead of drag —
 * touch drag across a horizontal scroll board is a usability trap (plan §2).
 */
export function MobileBoard({
  columns,
  states,
  onMove,
  disabled = false,
}: {
  columns: BoardColumn[];
  states: CanonicalState[];
  onMove: (app: Application, statusId: string) => void;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState(columns[0]?.state.id ?? "");
  const [moveTarget, setMoveTarget] = useState<Application | null>(null);

  // Keep the selected segment valid as columns change (archived toggle, filters).
  // Adjusted during render (react.dev) rather than in an effect.
  if (columns.length > 0 && !columns.some((c) => c.state.id === selected)) {
    setSelected(columns[0].state.id);
  }

  const active = columns.find((c) => c.state.id === selected) ?? columns[0];

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Status columns"
        className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]"
      >
        {columns.map((column) => {
          const isActive = column.state.id === active?.state.id;
          const dot = STATUS_DOT_CLASS[column.state.dashboardGroup] ?? "bg-muted-foreground/40";
          return (
            <button
              key={column.state.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSelected(column.state.id)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-data focus-visible:outline-2 focus-visible:outline-ring",
                isActive
                  ? "border-ring bg-accent text-accent-foreground"
                  : "text-muted-foreground",
              )}
            >
              <span aria-hidden className={cn("size-2 rounded-full", dot)} />
              {column.state.label}
              <span className="font-mono text-xs tabular-nums">
                {column.applications.length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        {active && active.applications.length > 0 ? (
          active.applications.map((app) => (
            <ApplicationCard
              key={app.num}
              app={app}
              action={
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setMoveTarget(app)}
                  aria-label={`Move #${app.num} ${app.company} to another status`}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                >
                  <MoveHorizontal className="size-4" aria-hidden />
                </button>
              }
            />
          ))
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground/70">
            No applications in {active?.state.label ?? "this column"}.
          </p>
        )}
      </div>

      <Sheet open={moveTarget !== null} onOpenChange={(open) => !open && setMoveTarget(null)}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Move to status</SheetTitle>
            {moveTarget ? (
              <SheetDescription>
                #{String(moveTarget.num).padStart(3, "0")} {moveTarget.company}
              </SheetDescription>
            ) : null}
          </SheetHeader>
          <div className="flex flex-col gap-1">
            {states.map((state) => {
              const current = moveTarget?.statusId === state.id;
              const dot = STATUS_DOT_CLASS[state.dashboardGroup] ?? "bg-muted-foreground/40";
              return (
                <button
                  key={state.id}
                  type="button"
                  disabled={current}
                  onClick={() => {
                    if (moveTarget) onMove(moveTarget, state.id);
                    setMoveTarget(null);
                  }}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-md px-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring",
                    current ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                  )}
                >
                  <span aria-hidden className={cn("size-2.5 rounded-full", dot)} />
                  {state.label}
                  {current ? (
                    <span className="ml-auto text-xs text-muted-foreground">current</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
