"use client";

import { useState } from "react";
import {
  ChevronRight,
  FilePen,
  FilePlus,
  FileText,
  FolderSearch,
  Search,
  Terminal,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionLogEntry } from "./types";

/** Icon per tool (read-only + the Phase 4 mutating tools). */
function toolIcon(name: string) {
  switch (name) {
    case "Read":
      return FileText;
    case "Grep":
      return Search;
    case "Glob":
      return FolderSearch;
    case "Write":
      return FilePlus;
    case "Edit":
      return FilePen;
    case "Bash":
      return Terminal;
    default:
      return Wrench;
  }
}

/** One-line, human label for a tool call (e.g. `Read profile.yml`). */
function describe(entry: ActionLogEntry): string {
  const input = entry.input as Record<string, unknown> | undefined;
  const path = input?.file_path ?? input?.path;
  const pattern = input?.pattern;
  const command = input?.command;
  const target =
    (typeof path === "string" && path) ||
    (typeof command === "string" && command) ||
    (typeof pattern === "string" && pattern);
  return target ? `${entry.name} ${String(target)}` : entry.name;
}

/**
 * Collapsible journal of the agent's tool activity for one assistant turn
 * (Decision §1: transparency). Collapsed by default; shows a running count.
 */
export function ActionLog({ entries }: { entries: ActionLogEntry[] }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  return (
    <div className="mb-2 overflow-hidden rounded-md border bg-muted/40 text-data">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-muted-foreground hover:text-foreground"
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
          aria-hidden
        />
        <span className="font-medium">
          {entries.length} action{entries.length > 1 ? "s" : ""}
        </span>
      </button>
      {open ? (
        <ul className="border-t px-2.5 py-1.5">
          {entries.map((entry) => {
            const Icon = toolIcon(entry.name);
            const pending = entry.ok === undefined;
            return (
              <li
                key={entry.id}
                className="flex items-start gap-2 py-1 font-mono text-xs text-muted-foreground"
              >
                <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 break-words">
                  <span className="text-foreground">{describe(entry)}</span>
                  {entry.summary ? (
                    <span className="block truncate text-muted-foreground/80">{entry.summary}</span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "mt-0.5 shrink-0",
                    pending
                      ? "text-muted-foreground/60"
                      : entry.ok
                        ? "text-status-offer"
                        : "text-destructive",
                  )}
                  aria-hidden
                >
                  {pending ? "…" : entry.ok ? "✓" : "✕"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
