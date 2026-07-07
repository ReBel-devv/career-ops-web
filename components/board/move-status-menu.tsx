"use client";

import { ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_DOT_CLASS } from "@/components/data/status-indicator";
import type { Application, CanonicalState } from "@/lib/domain";
import { cn } from "@/lib/utils";

/**
 * Keyboard-operable "Move to status…" menu — the accessible mirror of drag on
 * every card (plan §6, WCAG). Works identically on desktop; the mobile board
 * uses the Sheet-based action sheet instead.
 */
export function MoveStatusMenu({
  app,
  states,
  onMove,
  disabled = false,
}: {
  app: Application;
  states: CanonicalState[];
  onMove: (statusId: string) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={`Move #${app.num} ${app.company} to another status`}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
      >
        <ChevronsUpDown className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Move to status</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={app.statusId ?? ""}
          onValueChange={(id) => onMove(id)}
        >
          {states.map((state) => (
            <DropdownMenuRadioItem
              key={state.id}
              value={state.id}
              className="text-data"
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  STATUS_DOT_CLASS[state.dashboardGroup] ?? "bg-muted-foreground/40",
                )}
              />
              {state.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
