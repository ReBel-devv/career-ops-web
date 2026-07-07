"use client";

import { STATUS_DOT_CLASS } from "@/components/data/status-indicator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useApplicationActions } from "@/lib/client/queries";
import type { Application, CanonicalState } from "@/lib/domain";
import { cn } from "@/lib/utils";

/**
 * Inline status editor for a tracker row. Delegates the write to the shared
 * `useApplicationActions` mutation — same optimistic cache update, undo toast,
 * follow-up-seed toast and 409 rollback the board uses (Decision 5). The
 * displayed value tracks `app.statusId`, which the mutation updates
 * optimistically in the query cache.
 */
export function StatusSelect({
  app,
  states,
}: {
  app: Application;
  states: CanonicalState[];
}) {
  const { moveStatus, isPending } = useApplicationActions();
  const current = states.find((s) => s.id === app.statusId) ?? null;

  return (
    <Select
      value={current?.id ?? ""}
      onValueChange={(id) => moveStatus(app, id)}
      disabled={isPending}
    >
      <SelectTrigger
        size="sm"
        aria-label={`Status of #${app.num} ${app.company}`}
        className="h-7 gap-1.5 border-transparent bg-transparent px-1.5 text-data shadow-none hover:border-input dark:bg-transparent dark:hover:bg-input/30"
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              (current && STATUS_DOT_CLASS[current.dashboardGroup]) ??
                "bg-muted-foreground/40",
            )}
          />
          {current?.label ?? app.statusRaw}
        </span>
      </SelectTrigger>
      <SelectContent>
        {states.map((state) => (
          <SelectItem key={state.id} value={state.id} className="text-data">
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 rounded-full",
                STATUS_DOT_CLASS[state.dashboardGroup] ?? "bg-muted-foreground/40",
              )}
            />
            {state.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
