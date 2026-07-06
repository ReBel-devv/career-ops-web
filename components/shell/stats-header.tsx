import { AvatarMenu } from "./avatar-menu";

interface StatChip {
  label: string;
  value: string;
}

/**
 * Persistent stats-header slot. M0 shows placeholder chips; M2 (F3) wires the
 * real numbers, cross-checked against analyze-patterns / followup-cadence.
 */
const PLACEHOLDER_STATS: StatChip[] = [
  { label: "Applied", value: "—" },
  { label: "Avg score", value: "—" },
  { label: "Response rate", value: "—" },
  { label: "Follow-ups due", value: "—" },
];

export function StatsHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
      <div
        className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none]"
        aria-label="Pipeline stats"
      >
        {PLACEHOLDER_STATS.map((stat) => (
          <div
            key={stat.label}
            className="flex shrink-0 items-baseline gap-1.5 rounded-md border bg-card px-2.5 py-1"
          >
            <span className="font-mono text-data font-medium tabular-nums">{stat.value}</span>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </div>
      <AvatarMenu />
    </header>
  );
}
