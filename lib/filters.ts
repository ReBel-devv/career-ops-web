import type { Application, ReportFacet } from "@/lib/domain";

/**
 * Shared search / filter / sort state (F4). Lives in the URL search params so
 * it composes across the Board and the Applications table and survives reload
 * and sharing. All filters compose with AND.
 *
 * Archetype and ATS-vendor facets (added in M3) come from report data the
 * tracker row doesn't carry: callers pass a `FacetIndex` (built from
 * `GET /api/report-facets`) into `matchesFilters` / `filterApplications`.
 * When those filters are active, rows WITHOUT a report never match.
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
  /** Archetype families to include (see `archetypeFamilies`); empty = all. */
  archetypes: string[];
  /** ATS vendor names to include (report URL host); empty = all. */
  vendors: string[];
}

/** Per-application report facets, keyed by application num. */
export type FacetIndex = Map<number, ReportFacet>;

export function buildFacetIndex(facets: ReportFacet[]): FacetIndex {
  return new Map(facets.map((f) => [f.num, f]));
}

/**
 * Reduce a raw archetype string to short, filterable families:
 * `"Frontend Engineer (React/Next.js) + Design Engineer (UI/Motion)"` →
 * `["Frontend Engineer", "Design Engineer"]`. Raw archetypes are free prose
 * (parentheticals, em-dash qualifiers, `+` combinations), so exact-match
 * filtering on them would explode the option list.
 */
export function archetypeFamilies(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/\s*\+\s*(?![^(]*\))/) // split `+` combinations, not inside parens
    .map((part) =>
      part
        .replace(/\([^)]*\)/g, " ") // drop parentheticals
        .replace(/\[[^\]]*\]/g, " ") // drop bracketed qualifiers
        .split(/\s*(?:—|--|:|,)\s*/)[0] // drop qualifiers after dash/colon
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((s) => s.length > 1);
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
  archetypes: [],
  vendors: [],
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
    f.dateTo !== null ||
    f.archetypes.length > 0 ||
    f.vendors.length > 0
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

function parseList(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** URL search params → typed filters. Tolerant of missing / malformed values. */
export function parseFilters(params: URLSearchParams): AppFilters {
  return {
    q: params.get("q") ?? "",
    statuses: parseList(params.get("status")),
    scoreMin: parseNumber(params.get("smin")),
    scoreMax: parseNumber(params.get("smax")),
    dateFrom: parseDate(params.get("from")),
    dateTo: parseDate(params.get("to")),
    archived: params.get("archived") === "1",
    archetypes: parseList(params.get("arch")),
    vendors: parseList(params.get("vendor")),
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
  set("arch", f.archetypes.length > 0 ? f.archetypes.join(",") : null);
  set("vendor", f.vendors.length > 0 ? f.vendors.join(",") : null);
  return next;
}

/** AND-composed predicate. `archived` hides Rejected/Discarded/SKIP unless on.
 * `facets` powers the archetype/vendor filters; when one of those is active
 * and the app has no report facet, the app does not match. */
export function matchesFilters(
  app: Application,
  f: AppFilters,
  facets?: FacetIndex,
): boolean {
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

  if (f.archetypes.length > 0) {
    const families = archetypeFamilies(facets?.get(app.num)?.archetype ?? null);
    if (!families.some((fam) => f.archetypes.includes(fam))) return false;
  }

  if (f.vendors.length > 0) {
    const vendor = facets?.get(app.num)?.atsVendor ?? null;
    if (vendor === null || !f.vendors.includes(vendor)) return false;
  }

  return true;
}

/** Apply all filters (AND). Preserves input order. */
export function filterApplications(
  applications: Application[],
  f: AppFilters,
  facets?: FacetIndex,
): Application[] {
  return applications.filter((app) => matchesFilters(app, f, facets));
}
