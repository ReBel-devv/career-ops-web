"use client";

import { useState, type KeyboardEvent } from "react";
import { Check, MessageSquarePlus, Pencil, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "./types";

/** Compact relative time: "now", "5m", "3h", "2d", else a short date. */
function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** One history row: select, inline rename, and a two-step delete confirm. */
function Row({
  conversation,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  conversation: ConversationSummary;
  active: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [mode, setMode] = useState<"idle" | "rename" | "confirm">("idle");
  const [draft, setDraft] = useState(conversation.title);

  function commitRename() {
    const next = draft.trim();
    if (next && next !== conversation.title) onRename(conversation.id, next);
    setMode("idle");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      setDraft(conversation.title);
      setMode("idle");
    }
  }

  if (mode === "rename") {
    return (
      <div className="flex items-center gap-1 rounded-md border border-foreground/25 bg-card px-2 py-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commitRename}
          aria-label="Rename conversation"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={commitRename}
          aria-label="Save name"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <Check className="size-3.5" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md px-2 py-1.5 text-left transition-colors",
        active ? "bg-secondary" : "hover:bg-muted",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-ring"
        title={conversation.title}
      >
        <span className="block truncate text-sm">{conversation.title}</span>
      </button>

      {mode === "confirm" ? (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onDelete(conversation.id)}
            className="rounded px-1.5 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setMode("idle")}
            aria-label="Cancel delete"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <span className="mr-1 text-[10px] tabular-nums text-muted-foreground">
            {relativeTime(conversation.updatedAt)}
          </span>
          <button
            type="button"
            onClick={() => {
              setDraft(conversation.title);
              setMode("rename");
            }}
            aria-label="Rename"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setMode("confirm")}
            aria-label="Delete"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </span>
      )}
    </div>
  );
}

/**
 * History list for the assistant: a "New chat" action plus stored conversations
 * (rename inline, two-step delete). Monochrome; the active row uses `secondary`.
 */
export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="p-2">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <MessageSquarePlus className="size-4" aria-hidden />
          New chat
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No saved conversations yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {conversations.map((c) => (
              <li key={c.id}>
                <Row
                  conversation={c}
                  active={c.id === activeId}
                  onSelect={onSelect}
                  onRename={onRename}
                  onDelete={onDelete}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
