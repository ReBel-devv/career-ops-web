/**
 * Small pure cell-level parsers for tracker cells. Row/column mapping is NOT
 * done here — that is reused from the data repo's own `tracker-parse.mjs`
 * (see lib/data/tracker-module.ts). These only interpret individual cells.
 */

/** `4.2/5` (any precision) → 4.2; `N/A` / `DUP` / anything else → null. */
export function parseScoreCell(raw: string): number | null {
  const t = raw.replace(/\*\*/g, "").trim();
  const m = /^(\d+(?:\.\d+)?)\/5$/.exec(t);
  if (!m) return null;
  const value = Number.parseFloat(m[1]);
  return Number.isFinite(value) ? value : null;
}

/** PDF cell is `✅` or `❌` (tolerates other checkmark glyphs). */
export function parsePdfCell(raw: string): boolean {
  return /[✅✔☑]/u.test(raw);
}

export interface ReportLink {
  /** Link text, e.g. `028`. */
  label: string;
  /** Link target as written in the tracker (root- or tracker-relative). */
  path: string;
}

/** `[028](../reports/028-acme-2026-07-06.md)` → { label, path }. */
export function parseReportCell(raw: string): ReportLink | null {
  const m = /\[([^\]]+)\]\(([^)]+)\)/.exec(raw);
  if (!m) return null;
  return { label: m[1].trim(), path: m[2].trim() };
}

export type ScoreTier = "high" | "mid" | "low" | "none";

/** 3-step ramp around the 4.0/5 apply threshold (plan §6). */
export function scoreTier(score: number | null): ScoreTier {
  if (score === null) return "none";
  if (score >= 4.0) return "high";
  if (score >= 3.0) return "mid";
  return "low";
}
