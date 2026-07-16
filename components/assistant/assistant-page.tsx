"use client";

import { useState } from "react";
import { History, Plus, Sparkles, X } from "lucide-react";
import { useClientConfig } from "@/components/providers/app-providers";
import { AssistantSurface } from "./assistant-surface";
import { ConversationList } from "./conversation-list";
import { useAssistantChat } from "./use-assistant-chat";
import { useConversations } from "./use-conversations";

/**
 * Full-screen assistant surface for `/assistant`: a history sidebar (persistent
 * on desktop, a drawer on mobile) beside the transcript + composer.
 */
export function AssistantPage() {
  const chat = useAssistantChat();
  const convos = useConversations();
  const { assistantWritable } = useClientConfig();
  const [historyOpen, setHistoryOpen] = useState(false);

  const select = (id: string) => {
    void chat.load(id);
    setHistoryOpen(false);
  };
  const newChat = () => {
    chat.reset();
    setHistoryOpen(false);
  };
  const del = (id: string) => {
    convos.remove(id);
    if (id === chat.activeId) chat.reset();
  };

  const list = (
    <ConversationList
      conversations={convos.conversations}
      activeId={chat.activeId}
      onSelect={select}
      onNew={newChat}
      onRename={convos.rename}
      onDelete={del}
    />
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem-4rem)] md:h-[calc(100dvh-3.5rem)]">
      {/* Sidebar — persistent on desktop */}
      <aside className="hidden w-64 shrink-0 border-r md:flex md:flex-col">{list}</aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2.5 border-b px-4 py-2.5 md:px-6">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label="Open history"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring md:hidden"
          >
            <History className="size-4" aria-hidden />
          </button>
          <span
            className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground sm:flex"
            aria-hidden
          >
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">Assistant</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              Operates on your career-ops repo · {assistantWritable ? "edits need approval" : "read-only"}
            </p>
          </div>
          <button
            type="button"
            onClick={newChat}
            className="flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-data text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Plus className="size-3.5" aria-hidden />
            New chat
          </button>
        </div>

        <AssistantSurface
          messages={chat.messages}
          status={chat.status}
          mode={chat.mode}
          onModeChange={chat.setMode}
          onSend={chat.send}
          onStop={chat.stop}
          onRespond={chat.respond}
        />
      </div>

      {/* History drawer — mobile */}
      {historyOpen ? (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button
            type="button"
            aria-label="Close history"
            onClick={() => setHistoryOpen(false)}
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
          />
          <div className="relative flex w-72 max-w-[80vw] flex-col border-r bg-background shadow-xl">
            <div className="flex items-center justify-between border-b px-3 py-2.5">
              <span className="text-sm font-semibold">History</span>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            {list}
          </div>
        </div>
      ) : null}
    </div>
  );
}
