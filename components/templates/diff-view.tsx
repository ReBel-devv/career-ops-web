"use client";

import { useMemo } from "react";
import { diffLines, hasChanges } from "@/lib/diff";

/**
 * Line diff for the approval flow (agent revisions, version restores).
 * Red/green tints are STATE colors here — removed vs added — exactly what the
 * site reserves them for. Text stays foreground for AA; the ±  marker and the
 * tint carry the change together (never color alone).
 */
export function DiffView({
  before,
  after,
  maxHeightClass = "max-h-80",
}: {
  before: string;
  after: string;
  maxHeightClass?: string;
}) {
  const diff = useMemo(() => diffLines(before, after), [before, after]);

  if (!hasChanges(diff)) {
    return (
      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        No changes — the proposal matches the current text.
      </p>
    );
  }

  return (
    <div
      className={`scrollbar-subtle overflow-auto rounded-md border font-mono text-xs leading-5 ${maxHeightClass}`}
    >
      <pre className="min-w-max px-0 py-1">
        {diff.map((line, i) => (
          <div
            key={i}
            className="grid grid-cols-[1.25rem_1fr] px-2"
            style={
              line.kind === "added"
                ? { background: "color-mix(in oklab, var(--score-high) 12%, transparent)" }
                : line.kind === "removed"
                  ? { background: "color-mix(in oklab, var(--score-low) 12%, transparent)" }
                  : undefined
            }
          >
            <span
              aria-hidden
              className="select-none"
              style={{
                color:
                  line.kind === "added"
                    ? "var(--score-high)"
                    : line.kind === "removed"
                      ? "var(--score-low)"
                      : "var(--muted-foreground)",
              }}
            >
              {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
            </span>
            <span className="whitespace-pre-wrap">{line.text || " "}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
