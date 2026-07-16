"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Message input: auto-growing textarea, Enter to send (Shift+Enter for a
 * newline), and a send button that becomes a Stop button while streaming.
 */
export function ChatComposer({
  onSend,
  onStop,
  streaming,
  placeholder = "Ask about your pipeline…",
  autoFocus,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function grow() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || streaming) return;
    onSend(trimmed);
    setValue("");
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex items-end gap-2 rounded-2xl border bg-card p-2",
        "focus-within:border-foreground/25 focus-within:ring-[3px] focus-within:ring-foreground/10",
      )}
    >
      <textarea
        ref={textareaRef}
        value={value}
        rows={1}
        autoFocus={autoFocus}
        onChange={(e) => {
          setValue(e.target.value);
          grow();
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Message the assistant"
        className={cn(
          "max-h-[200px] min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none",
          "placeholder:text-muted-foreground",
        )}
      />
      {streaming ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Square className="size-4 fill-current" aria-hidden />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!value.trim()}
          aria-label="Send"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-[transform,opacity] hover:enabled:scale-105 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
      )}
    </form>
  );
}
