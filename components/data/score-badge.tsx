import { scoreTier, type ScoreTier } from "@/lib/domain/parse";
import { cn } from "@/lib/utils";

const TIER_CLASSES: Record<ScoreTier, string> = {
  high: "text-score-high border-score-high/35 bg-score-high/10",
  mid: "text-score-mid border-score-mid/35 bg-score-mid/10",
  low: "text-score-low border-score-low/35 bg-score-low/10",
  none: "text-muted-foreground border-border bg-muted",
};

/** Score chip on the 3-step ramp around the 4.0/5 apply threshold. */
export function ScoreBadge({
  raw,
  score,
  className,
}: {
  raw: string;
  score: number | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-data leading-none font-medium tabular-nums",
        TIER_CLASSES[scoreTier(score)],
        className,
      )}
    >
      {raw.trim() === "" ? "—" : raw}
    </span>
  );
}
