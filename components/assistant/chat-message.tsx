"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/lib/client/use-reduced-motion";
import { ActionLog } from "./action-log";
import { PermissionCard } from "./permission-card";
import { SiriWave } from "./siri-wave";
import { StreamingMarkdown } from "./streaming-markdown";
import { ThinkingCard } from "./thinking-card";
import type {
  PermissionDecision,
  PermissionScope,
} from "./use-assistant-chat";
import type {
  ActionLogEntry,
  ChatMessage as ChatMessageT,
  PermissionRequestState,
  UsageLimitInfo,
} from "./types";

/** Format a usage-limit error into a clear, localized-ish sentence. */
function usageLimitText(limit: UsageLimitInfo): string {
  const scope =
    limit.kind === "session"
      ? "session usage limit"
      : limit.kind === "weekly"
        ? "weekly usage limit"
        : "usage limit";
  if (!limit.resetsAt) return `You've reached your ${scope}.`;
  const when = new Date(limit.resetsAt * 1000).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `You've reached your ${scope} — resets ${when}.`;
}

/** Three-dot typing indicator (reduced-motion fallback for the Siri orb). */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1" aria-label="Assistant is thinking">
      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40" />
    </div>
  );
}

/** Last path segment, for a compact activity label. */
function baseName(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

/** A short French label for the tool that is currently running. */
function toolGerund(entry: ActionLogEntry): string {
  const input = entry.input as Record<string, unknown> | undefined;
  const path = input?.file_path ?? input?.path;
  const name = typeof path === "string" && path ? baseName(path) : undefined;
  switch (entry.name) {
    case "Write":
      return name ? `Écriture de ${name}…` : "Écriture d'un fichier…";
    case "Edit":
      return name ? `Modification de ${name}…` : "Modification d'un fichier…";
    case "Read":
      return name ? `Lecture de ${name}…` : "Lecture…";
    case "Bash":
      return "Exécution d'une commande…";
    case "Grep":
      return "Recherche…";
    case "Glob":
      return "Recherche de fichiers…";
    default:
      return `${entry.name}…`;
  }
}

/**
 * Activity indicator shown while the agent is working but nothing is streaming
 * into view — before the first block, and during a tool call (with a label
 * naming the action) — so a long write never looks frozen.
 */
function WaitingIndicator({ label }: { label: string | null }) {
  const reduce = usePrefersReducedMotion();
  return (
    <div className="flex items-center gap-2 py-0.5" aria-label={label ?? "L'assistant travaille"}>
      {reduce ? (
        <TypingDots />
      ) : (
        <SiriWave
          variant="fluid-dots"
          size={88}
          renderScale={1}
          className="-my-4 -ml-3 shrink-0"
        />
      )}
      {label ? (
        <span className="animate-pulse text-xs text-muted-foreground motion-reduce:animate-none">
          {label}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Render an assistant turn's ordered blocks. Text renders as (typewriter-)
 * streamed markdown, reasoning as a thinking card, and runs of consecutive tool
 * calls collapse into a single action journal — all in the exact order the
 * agent produced them, so narration, a command, and the reply stay in place.
 */
function renderTurn(
  message: ChatMessageT,
  onRespond: (id: string, decision: PermissionDecision, scope: PermissionScope) => void,
): ReactNode[] {
  const streaming = !!message.streaming;

  // A permission card gates a specific tool — index them by that tool's `seq` so
  // each renders right after its command, not pinned to the bottom of the turn.
  const permsBySeq = new Map<number, PermissionRequestState[]>();
  const orphanPerms: PermissionRequestState[] = [];
  for (const perm of message.permissions) {
    if (typeof perm.seq === "number") {
      const arr = permsBySeq.get(perm.seq);
      if (arr) arr.push(perm);
      else permsBySeq.set(perm.seq, [perm]);
    } else {
      orphanPerms.push(perm);
    }
  }

  const out: ReactNode[] = [];
  let toolRun: ActionLogEntry[] = [];
  let runPerms: PermissionRequestState[] = [];

  // Flush the current run of consecutive tool calls (a single collapsed journal)
  // followed by any permission cards gating those calls.
  const flushTools = () => {
    if (toolRun.length > 0) {
      out.push(<ActionLog key={`log-${toolRun[0].id}`} entries={toolRun} />);
      toolRun = [];
    }
    for (const perm of runPerms) {
      out.push(<PermissionCard key={perm.requestId} request={perm} onRespond={onRespond} />);
    }
    runPerms = [];
  };

  for (const block of message.blocks) {
    if (block.kind === "tool") {
      toolRun.push(block);
      const perms = permsBySeq.get(block.seq);
      if (perms) runPerms.push(...perms);
      continue;
    }
    flushTools();
    if (block.kind === "text") {
      out.push(
        <StreamingMarkdown
          key={block.seq}
          markdown={block.text}
          animate={streaming && !block.done}
          className="text-sm"
        />,
      );
    } else {
      out.push(
        <ThinkingCard
          key={block.seq}
          text={block.text}
          active={streaming && !block.done}
        />,
      );
    }
  }
  flushTools();

  // Defensive fallback: a card whose tool block never arrived still shows (at the
  // end), so a confirmation can never be silently un-answerable.
  for (const perm of orphanPerms) {
    out.push(<PermissionCard key={perm.requestId} request={perm} onRespond={onRespond} />);
  }
  return out;
}

/** One chat turn — user bubble (right) or assistant block (left). */
export function ChatMessage({
  message,
  onRespond,
}: {
  message: ChatMessageT;
  onRespond: (id: string, decision: PermissionDecision, scope: PermissionScope) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-secondary px-3.5 py-2 text-sm whitespace-pre-wrap text-secondary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  // Show the activity indicator whenever the agent is busy but nothing is
  // streaming into the tail: before the first block, or while a tool runs.
  // A text/thinking block at the tail carries its own live rendering (typewriter
  // / thinking card), and a pending permission card awaits the user — neither
  // needs the orb.
  const lastBlock = message.blocks.at(-1);
  const pendingTool =
    lastBlock?.kind === "tool" && lastBlock.ok === undefined ? lastBlock : null;
  const pendingPermission = message.permissions.some((p) => p.status === "pending");
  const showWorking =
    !!message.streaming &&
    !pendingPermission &&
    (message.blocks.length === 0 || lastBlock?.kind === "tool");
  const workingLabel = pendingTool ? toolGerund(pendingTool) : null;

  return (
    <div className="flex flex-col gap-2">
      {renderTurn(message, onRespond)}
      {showWorking ? <WaitingIndicator label={workingLabel} /> : null}
      {message.error ? (
        <div
          className={cn(
            "mt-2 flex items-start gap-2 rounded-md border px-3 py-2 text-data",
            "border-destructive/30 bg-destructive/10 text-destructive",
          )}
          role="alert"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{message.error.limit ? usageLimitText(message.error.limit) : message.error.message}</span>
        </div>
      ) : null}
    </div>
  );
}
