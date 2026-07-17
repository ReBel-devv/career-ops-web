"use client";

/**
 * Time-range segmented control for /analytics — trailing windows over the
 * tracker Date column. "All" keeps every script-computed number verbatim
 * (F5); any window switches the derived charts to client-side math over the
 * filtered rows (each card's subtitle stays honest about its source).
 */

export type RangeKey = "all" | "90d" | "30d" | "7d";

export const RANGE_OPTIONS: ReadonlyArray<{
  key: RangeKey;
  label: string;
  /** Trailing window size; null = no filter. */
  days: number | null;
}> = [
  { key: "all", label: "All", days: null },
  { key: "90d", label: "90d", days: 90 },
  { key: "30d", label: "30d", days: 30 },
  { key: "7d", label: "7d", days: 7 },
];

/** Generic segmented control — the /analytics toggle idiom (range,
 * activity granularity): bordered pill group, mono labels, muted active fill. */
export function SegmentedControl<K extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: ReadonlyArray<{ key: K; label: string }>;
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-md border bg-card p-0.5"
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.key)}
            className={`cursor-pointer rounded-sm px-2.5 py-1 font-mono text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
              active
                ? "bg-muted font-semibold text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function RangeControl({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (key: RangeKey) => void;
}) {
  return (
    <SegmentedControl
      ariaLabel="Time range"
      options={RANGE_OPTIONS}
      value={value}
      onChange={onChange}
    />
  );
}
