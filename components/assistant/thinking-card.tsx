"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/lib/client/use-reduced-motion";

/**
 * The agent's extended-thinking (reasoning) for one turn, streamed into its own
 * card so it reads as distinct from the spoken answer. While `active` the card
 * shows a live, auto-scrolling, fading view of the reasoning with a spinner and
 * an elapsed timer; once the reasoning block ends it collapses to
 * "Réfléchi pendant Xs", expandable to re-read the full reasoning.
 *
 * This is genuine reasoning (a `thinking` content block), told apart from spoken
 * text by kind — not by language.
 */
export function ThinkingCard({ text, active }: { text: string; active: boolean }) {
  const reduce = usePrefersReducedMotion();
  const [elapsed, setElapsed] = useState(0);
  const [open, setOpen] = useState(false);
  const startRef = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Record the start on mount (outside render — Date.now is impure).
  useEffect(() => {
    startRef.current = Date.now();
  }, []);

  // Count up while the reasoning streams. When it ends the interval is cleared
  // and `elapsed` keeps its last value — the frozen duration. A block loaded
  // from history already `done` never ticks, so `elapsed` stays 0 and no
  // duration is shown.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (startRef.current != null) {
        setElapsed(Math.round((Date.now() - startRef.current) / 1000));
      }
    }, 250);
    return () => clearInterval(id);
  }, [active]);

  // Keep the live view pinned to the newest reasoning.
  useEffect(() => {
    if (active && !reduce && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [text, active, reduce]);

  const seconds = elapsed;
  const hasDuration = elapsed > 0;
  const showBox = active || open;

  return (
    <div className="my-1 overflow-hidden rounded-lg border bg-muted/30 text-data">
      <button
        type="button"
        onClick={() => !active && setOpen((v) => !v)}
        aria-expanded={active ? undefined : open}
        disabled={active}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground",
          !active && "hover:text-foreground",
        )}
      >
        {active ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <ChevronRight
            className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
            aria-hidden
          />
        )}
        {active ? (
          <>
            <span className="animate-pulse font-medium motion-reduce:animate-none">
              Réflexion…
            </span>
            <span className="ml-auto tabular-nums text-muted-foreground/70">{seconds}s</span>
          </>
        ) : (
          <>
            <Brain className="size-3.5 shrink-0" aria-hidden />
            <span className="font-medium">
              {hasDuration ? `Réfléchi pendant ${seconds}s` : "Raisonnement"}
            </span>
          </>
        )}
      </button>

      {showBox ? (
        <div className="relative border-t">
          {active ? (
            <>
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-muted/60 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-gradient-to-t from-muted/60 to-transparent" />
            </>
          ) : null}
          <div
            ref={contentRef}
            className={cn(
              "overflow-y-auto px-3 py-2 text-xs leading-relaxed text-muted-foreground",
              active ? "max-h-32" : "max-h-64",
            )}
            style={active ? { scrollBehavior: reduce ? "auto" : "smooth" } : undefined}
          >
            <p className="whitespace-pre-wrap">{text}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
