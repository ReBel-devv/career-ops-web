"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportMarkdown } from "@/components/report/report-markdown";
import { ActionLog } from "./action-log";
import { PermissionCard } from "./permission-card";
import type {
  PermissionDecision,
  PermissionScope,
} from "./use-assistant-chat";
import type { ChatMessage as ChatMessageT, UsageLimitInfo } from "./types";

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

/** Three-dot typing indicator shown before the first token arrives. */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1" aria-label="Assistant is thinking">
      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40" />
    </div>
  );
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

  const showTyping = message.streaming && message.content.length === 0 && message.logs.length === 0;

  return (
    <div className="flex flex-col">
      <ActionLog entries={message.logs} />
      {message.content ? (
        <ReportMarkdown markdown={message.content} className="text-sm" />
      ) : showTyping ? (
        <TypingDots />
      ) : null}
      {message.permissions.map((request) => (
        <PermissionCard key={request.requestId} request={request} onRespond={onRespond} />
      ))}
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
