"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { History, Maximize2, Plus, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClientConfig } from "@/components/providers/app-providers";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AssistantLauncher } from "./assistant-launcher";
import { AssistantSettingsPopover } from "./assistant-settings";
import { AssistantSurface } from "./assistant-surface";
import { ConversationList } from "./conversation-list";
import { useAssistantChat } from "./use-assistant-chat";
import { useConversations } from "./use-conversations";

/**
 * Floating chat bubble (bottom-right, on every page) with an animated panel.
 * The panel stays mounted once opened so the conversation survives close/reopen;
 * `inert` + CSS opacity/scale drive an accessible enter/exit animation without a
 * motion library (consistent with the repo's Radix data-state animations).
 */
export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const chat = useAssistantChat();
  const convos = useConversations();
  const pathname = usePathname();
  const { assistantWritable } = useClientConfig();

  // The full-screen page already is the assistant — don't double up the bubble.
  const hidden = pathname === "/assistant";

  function toggle() {
    setOpen((v) => {
      const next = !v;
      if (next) setEverOpened(true);
      return next;
    });
  }

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (hidden) return null;

  return (
    // pointer-events-none: the wrapper's layout box spans the (closed) panel
    // area — without it, a ~400×560px dead zone floats over every page's
    // bottom-right corner and swallows clicks/drags (found via the /analytics
    // globe). Interactive children re-enable pointer events themselves.
    <div className="pointer-events-none fixed right-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-40 flex flex-col items-end gap-3 md:right-6 md:bottom-6">
      <div
        // React 19 `inert`: fully removes the closed panel from tab/a11y order.
        inert={!open}
        aria-hidden={!open}
        className={cn(
          "flex h-[70vh] max-h-[600px] w-[calc(100vw-2rem)] origin-bottom-right flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl transition-all duration-200 ease-out sm:h-[560px] sm:w-[400px]",
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-3 scale-95 opacity-0",
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b bg-card px-3 py-2.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"
            aria-hidden
          >
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Assistant</p>
            <p className="truncate text-[11px] text-muted-foreground">
              career-ops · {assistantWritable ? "edits need approval" : "read-only"}
            </p>
          </div>
          <AssistantSettingsPopover />
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  aria-label="History"
                  aria-pressed={showHistory}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-ring",
                    showHistory
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <History className="size-4" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>History</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    chat.reset();
                    setShowHistory(false);
                  }}
                  aria-label="New conversation"
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Plus className="size-4" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>New conversation</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/assistant"
                  onClick={() => setOpen(false)}
                  aria-label="Open full screen"
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Maximize2 className="size-4" aria-hidden />
                </Link>
              </TooltipTrigger>
              <TooltipContent>Open full screen</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {showHistory ? (
          <ConversationList
            conversations={convos.conversations}
            activeId={chat.activeId}
            onSelect={(id) => {
              void chat.load(id);
              setShowHistory(false);
            }}
            onNew={() => {
              chat.reset();
              setShowHistory(false);
            }}
            onRename={convos.rename}
            onDelete={(id) => {
              convos.remove(id);
              if (id === chat.activeId) chat.reset();
            }}
          />
        ) : everOpened ? (
          <AssistantSurface
            messages={chat.messages}
            status={chat.status}
            mode={chat.mode}
            onModeChange={chat.setMode}
            onSend={chat.send}
            onStop={chat.stop}
            onRespond={chat.respond}
            compact
            autoFocus={open}
          />
        ) : null}
      </div>

      {/* Launcher */}
      <AssistantLauncher open={open} onClick={toggle} />
    </div>
  );
}
