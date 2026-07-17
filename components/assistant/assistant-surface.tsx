"use client";

import { useEffect, useRef } from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClientConfig } from "@/components/providers/app-providers";
import { ChatComposer } from "./chat-composer";
import { ChatMessage } from "./chat-message";
import { EmptyState } from "./empty-state";
import type {
  PermissionDecision,
  PermissionScope,
} from "./use-assistant-chat";
import type {
  ChatMessage as ChatMessageT,
  ChatStatus,
} from "./types";
import type { AssistantMode } from "@/lib/assistant/types";

/** A compact accessible switch for toggling autonomous mode. */
function AutonomyToggle({
  mode,
  onModeChange,
}: {
  mode: AssistantMode;
  onModeChange: (m: AssistantMode) => void;
}) {
  const on = mode === "autonomous";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onModeChange(on ? "confirmation" : "autonomous")}
      className="flex shrink-0 items-center gap-1.5 rounded-full px-1 py-0.5 text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      title="Autonomous mode runs actions without asking (hard guardrails still apply)."
    >
      <Zap className={cn("size-3", on && "text-foreground")} aria-hidden />
      <span>Autonomous</span>
      <span
        className={cn(
          "relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors",
          on ? "bg-foreground" : "bg-border",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute size-2.5 rounded-full bg-background transition-transform",
            on ? "translate-x-[11px]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

/**
 * Presentational chat surface shared by the floating widget and the full-screen
 * page: a scrolling transcript (or the empty state) above a pinned composer.
 * When autonomous mode is on, a clear banner sits above the transcript and the
 * footer toggle reflects it. All conversation state is owned by the parent via
 * `useAssistantChat`.
 */
export function AssistantSurface({
  messages,
  status,
  mode,
  onModeChange,
  onSend,
  onStop,
  onRespond,
  compact = false,
  autoFocus = false,
}: {
  messages: ChatMessageT[];
  status: ChatStatus;
  mode: AssistantMode;
  onModeChange: (m: AssistantMode) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onRespond: (id: string, decision: PermissionDecision, scope: PermissionScope) => void;
  compact?: boolean;
  autoFocus?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Whether the viewport is pinned to the bottom. Kept in a ref (no re-render on
  // scroll); updated on every scroll event.
  const atBottomRef = useRef(true);
  const streaming = status === "streaming";
  const { assistantWritable } = useClientConfig();
  const autonomous = mode === "autonomous";

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // A small threshold so "essentially at the bottom" still counts as pinned.
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  // A new turn (the user sent, or a conversation was loaded) → jump to bottom.
  useEffect(() => {
    atBottomRef.current = true;
    scrollToBottom();
  }, [messages.length]);

  // While a turn streams, the last message grows in ways React re-render keys
  // can't fully anticipate: streamed text, tool logs, and especially permission
  // cards whose diff/command lay out to their real height a beat after mount.
  // A ResizeObserver on the content follows *any* height change and re-pins to
  // the bottom whenever the user is already there — so a card can never appear
  // with only its top edge visible. Scrolling up clears `atBottomRef`, so
  // reading earlier lines is never yanked back down.
  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (atBottomRef.current) scrollToBottom();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {autonomous ? (
        <div className="flex items-center gap-2 border-b bg-secondary px-3 py-2 text-xs text-secondary-foreground">
          <Zap className="size-3.5 shrink-0" aria-hidden />
          <span className="flex-1">
            <span className="font-medium">Autonomous mode.</span> Actions run without
            confirmation — hard guardrails still apply.
          </span>
          <button
            type="button"
            onClick={() => onModeChange("confirmation")}
            className="shrink-0 rounded px-1.5 py-0.5 font-medium hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-ring"
          >
            Turn off
          </button>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          compact ? "px-3 py-3" : "px-4 py-6",
        )}
      >
        <div
          ref={contentRef}
          className={cn("mx-auto w-full", compact ? "max-w-full" : "max-w-2xl")}
        >
          {isEmpty ? (
            <EmptyState onPick={onSend} compact={compact} />
          ) : (
            <div className={cn("flex flex-col", compact ? "gap-4" : "gap-6")}>
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} onRespond={onRespond} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={cn("border-t bg-background/80 backdrop-blur", compact ? "p-3" : "px-4 py-4")}>
        <div className={cn("mx-auto w-full", compact ? "max-w-full" : "max-w-2xl")}>
          <ChatComposer
            onSend={onSend}
            onStop={onStop}
            streaming={streaming}
            autoFocus={autoFocus}
          />
          <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
            <p className="text-[11px] text-muted-foreground">
              {assistantWritable
                ? autonomous
                  ? "Autonomous · actions run without asking."
                  : "Edits and commands need your approval."
                : "Read-only · grounded in your career-ops repo."}
            </p>
            {assistantWritable ? (
              <AutonomyToggle mode={mode} onModeChange={onModeChange} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
