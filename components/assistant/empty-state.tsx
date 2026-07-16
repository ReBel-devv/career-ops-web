"use client";

import {
  CalendarClock,
  FileText,
  LayoutGrid,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useProfile } from "@/lib/client/queries";
import { cn } from "@/lib/utils";

interface Suggestion {
  title: string;
  description: string;
  prompt: string;
  icon: LucideIcon;
}

/** Read-only starter prompts — all answerable from the repo files. */
const SUGGESTIONS: Suggestion[] = [
  {
    title: "Pipeline overview",
    description: "How many applications you have and how they break down by status.",
    prompt: "Summarize my pipeline: how many applications in total, broken down by status.",
    icon: LayoutGrid,
  },
  {
    title: "In interview",
    description: "Which roles are currently in the interview stage.",
    prompt: "Which applications are currently in the Interview stage? List company and role.",
    icon: TrendingUp,
  },
  {
    title: "Follow-ups due",
    description: "What you should be following up on right now.",
    prompt: "What follow-ups are due or overdue right now, based on data/follow-ups.md?",
    icon: CalendarClock,
  },
  {
    title: "Recent evaluations",
    description: "A digest of your latest evaluation reports and scores.",
    prompt: "Summarize my most recent evaluation reports in reports/ with their scores.",
    icon: FileText,
  },
];

function firstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  return fullName.trim().split(/\s+/)[0] ?? null;
}

/**
 * Empty-state greeting + starter prompt cards, shown before the first message.
 * `compact` renders the widget-sized variant (fewer, tighter cards).
 */
export function EmptyState({
  onPick,
  compact = false,
}: {
  onPick: (prompt: string) => void;
  compact?: boolean;
}) {
  const { data } = useProfile();
  const name = firstName(data?.profile.candidate.fullName);
  const suggestions = compact ? SUGGESTIONS.slice(0, 3) : SUGGESTIONS;

  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "gap-4 py-6" : "gap-6 py-10",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl border bg-card text-foreground",
          compact ? "size-11" : "size-14",
        )}
        aria-hidden
      >
        <Sparkles className={compact ? "size-5" : "size-6"} />
      </div>

      <div className="space-y-1">
        <h2 className={cn("font-heading font-semibold", compact ? "text-lg" : "text-2xl")}>
          {name ? `Hi ${name}` : "Career Ops assistant"}
        </h2>
        <p className={cn("text-muted-foreground", compact ? "text-data" : "text-sm")}>
          Ask about your pipeline, applications, reports and follow-ups.
        </p>
      </div>

      <div
        className={cn(
          "grid w-full gap-2",
          compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2",
        )}
      >
        {suggestions.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.title}
              type="button"
              onClick={() => onPick(s.prompt)}
              className={cn(
                "group flex items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors",
                "hover:border-foreground/20 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring",
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-foreground">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{s.title}</span>
                {!compact ? (
                  <span className="block text-data text-muted-foreground">{s.description}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
