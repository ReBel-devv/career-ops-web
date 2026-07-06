import { cn } from "@/lib/utils";

/**
 * Status color token lookup, keyed by states.yml `dashboard_group`.
 * Literal class names so Tailwind can see them (tokens defined in globals.css).
 */
export const STATUS_DOT_CLASS: Record<string, string> = {
  evaluated: "bg-status-evaluated",
  applied: "bg-status-applied",
  responded: "bg-status-responded",
  interview: "bg-status-interview",
  offer: "bg-status-offer",
  rejected: "bg-status-rejected",
  discarded: "bg-status-discarded",
  skip: "bg-status-skip",
};

export const STATUS_BORDER_CLASS: Record<string, string> = {
  evaluated: "border-l-status-evaluated",
  applied: "border-l-status-applied",
  responded: "border-l-status-responded",
  interview: "border-l-status-interview",
  offer: "border-l-status-offer",
  rejected: "border-l-status-rejected",
  discarded: "border-l-status-discarded",
  skip: "border-l-status-skip",
};

/** Muted dot + label — the canonical status rendering (dot + left-border style). */
export function StatusIndicator({
  group,
  label,
  className,
}: {
  /** states.yml dashboard_group, null when the raw status didn't resolve. */
  group: string | null;
  label: string;
  className?: string;
}) {
  const dot = group ? STATUS_DOT_CLASS[group] : undefined;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-data", className)}>
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", dot ?? "bg-muted-foreground/40")}
      />
      {label}
    </span>
  );
}
