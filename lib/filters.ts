import type { Application } from "@/lib/domain";

/**
 * Shared search / filter / sort state (F4). Lives in the URL search params so
 * it composes across the Board and the Applications table and survives reload
 * and sharing. All filters compose with AND.
 *
 * Archetype and ATS-vendor filters (plan §3 F4) are intentionally NOT here yet:
 * both are derived from report data (Machine Summary archetype, report URL
 * host) that the tracker row doesn't carry — `Application` has no such field.
 * Report parsing lands in M3, so those two facets are deferred to M3. Every
 * other F4 facet (search, status, score range, date range, archived) is live.
 */

export interface AppFilters {
  /** Free-text query over company / role / notes (case-insensitive). */
  q: string;
  /** Canonical status ids to include; empty = all statuses. */
  statuses: string[];
  /** Inclusive score bounds (0–5); null = unbounded on that side. */
  scoreMin: number | null;
  scoreMax: number | null;
  /** Inclusive `YYYY-MM-DD` date bounds; null = unbounded. */
  dateFrom: string | null;
  dateTo: string | null;
  /** Show archived rows (Rejected / Discarded / SKIP). Default off (Decision 8). */
  archived: boolean;
}

/** Canonical dashboard groups hidden by default on the board (Decision 8). */
export const ARCHIVED_GROUPS: ReadonlySet<string> = new Set([
  "rejected",
  "discarded",
  "skip",
]);

export const EMPTY_FILTERS: AppFilters = {
  q: "",
  statuses: [],
  scoreMin: null,
  scoreMax: null,
  dateFrom: null,
  dateTo: null,
  archived: false,
};

/** An app is archived when its canonical group is Rejected / Discarded / SKIP. */
export function isArchived(app: Application): boolean {
  return app.dashboardGroup !== null && ARCHIVED_GROUPS.has(app.dashboardGroup);
}

/** True when any user-facing filter (ignoring the archived toggle) is active. */
export function hasActiveFilters(f: AppFilters): boolean {
  return (
    f.q.trim() !== "" ||
    f.statuses.length > 0 ||
    f.scoreMin !== null ||
    f.scoreMax !== null ||
    f.dateFrom !== null ||
    f.dateTo !== null
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseNumber(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function parseDate(value: string | null): string | null {
  if (value === null) return null;
  const t = value.trim();
  return DATE_RE.test(t) ? t : null;
}

/** URL search params → typed filters. Tolerant of missing / malformed values. */
export function parseFilters(params: URLSearchParams): AppFilters {
  const statuses = (params.get("status") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    q: params.get("q") ?? "",
    statuses,
    scoreMin: parseNumber(params.get("smin")),
    scoreMax: parseNumber(params.get("smax")),
    dateFrom: parseDate(params.get("from")),
    dateTo: parseDate(params.get("to")),
    archived: params.get("archived") === "1",
  };
}

/**
 * Serialize filters back onto a URLSearchParams, preserving any unrelated keys
 * already present. Empty / default values are removed so URLs stay clean.
 */
export function applyFiltersToParams(
  params: URLSearchParams,
  f: AppFilters,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | null) => {
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  };
  set("q", f.q.trim() || null);
  set("status", f.statuses.length > 0 ? f.statuses.join(",") : null);
  set("smin", f.scoreMin !== null ? String(f.scoreMin) : null);
  set("smax", f.scoreMax !== null ? String(f.scoreMax) : null);
  set("from", f.dateFrom);
  set("to", f.dateTo);
  set("archived", f.archived ? "1" : null);
  return next;
}

/** AND-composed predicate. `archived` hides Rejected/Discarded/SKIP unless on. */
export function matchesFilters(app: Application, f: AppFilters): boolean {
  if (!f.archived && isArchived(app)) return false;

  if (f.q.trim() !== "") {
    const q = f.q.trim().toLowerCase();
    const haystack = `${app.company} ${app.role} ${app.notes}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  if (f.statuses.length > 0) {
    if (app.statusId === null || !f.statuses.includes(app.statusId)) return false;
  }

  if (f.scoreMin !== null || f.scoreMax !== null) {
    if (app.score === null) return false;
    if (f.scoreMin !== null && app.score < f.scoreMin) return false;
    if (f.scoreMax !== null && app.score > f.scoreMax) return false;
  }

  if (f.dateFrom !== null && app.date < f.dateFrom) return false;
  if (f.dateTo !== null && app.date > f.dateTo) return false;

  return true;
}

/** Apply all filters (AND). Preserves input order. */
export function filterApplications(
  applications: Application[],
  f: AppFilters,
): Application[] {
  return applications.filter((app) => matchesFilters(app, f));
}
