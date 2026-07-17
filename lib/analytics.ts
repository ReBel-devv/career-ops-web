import type {
  Application,
  ArchetypePattern,
  ReportFacet,
  VendorAnalysis,
  VendorBreakdownEntry,
} from "@/lib/domain";
import { archetypeFamilies } from "@/lib/filters";
import { ADVANCED_STATUS_IDS, SUBMITTED_STATUS_IDS } from "@/lib/stats";

/**
 * Pure chart-data transforms for /analytics (F5). No React, no fetch —
 * unit-tested in tests/analytics-transforms.test.ts.
 *
 * Division of labor: outcome buckets, advance rates, and recommendations come
 * from analyze-patterns.mjs verbatim (never recomputed). What lives here is
 * only *arrangement*: turning the script's raw status counts into cumulative
 * funnel stages, binning tracker scores into a histogram, and building the
 * archetype/location/vendor breakdowns from the M3 report facets when the
 * script output lacks them (its report resolution currently yields "Unknown"
 * for every row on the real repo).
 */

// ---------------------------------------------------------------------------
// Funnel — cumulative "reached at least this stage" over the script's raw
// status counts. Stage membership matches lib/stats.ts (which itself mirrors
// analyze-patterns' SUBMITTED/ADVANCED sets), so the dashboard never
// contradicts the CLI.
// ---------------------------------------------------------------------------

export interface FunnelStage {
  id: string;
  label: string;
  /** Applications that reached at least this stage. */
  count: number;
  /** Conversion from the previous stage (rounded %), null for the first stage
   * and when the previous stage is empty. */
  pctOfPrev: number | null;
  /** Share of the first stage (rounded %), 0 when the funnel is empty. */
  pctOfTotal: number;
}

const INTERVIEW_PLUS: ReadonlySet<string> = new Set(["interview", "offer"]);
const OFFER_ONLY: ReadonlySet<string> = new Set(["offer"]);

const FUNNEL_STAGES: ReadonlyArray<{
  id: string;
  label: string;
  /** null = every tracked application (all statuses). */
  ids: ReadonlySet<string> | null;
}> = [
  { id: "evaluated", label: "Evaluated", ids: null },
  { id: "applied", label: "Applied", ids: SUBMITTED_STATUS_IDS },
  { id: "responded", label: "Responded", ids: ADVANCED_STATUS_IDS },
  { id: "interview", label: "Interview", ids: INTERVIEW_PLUS },
  { id: "offer", label: "Offer", ids: OFFER_ONLY },
];

/**
 * Rows dated within the trailing `days` window ([now - days, now]); rows with
 * unparseable dates are dropped. Used by the /analytics range filter — pure so
 * the cutoff math is testable (now injected).
 */
export function applicationsSince(
  applications: ReadonlyArray<Application>,
  days: number,
  now: number,
): Application[] {
  const cutoff = now - days * 86_400_000;
  return applications.filter((app) => {
    const t = Date.parse(`${app.date}T00:00:00`);
    return !Number.isNaN(t) && t >= cutoff && t <= now;
  });
}

/**
 * Client-side funnel counts for a FILTERED range — same status-id keying as
 * the script's own `funnel` map (rows with unresolvable statuses skipped).
 * Only used when a time range is active; the unfiltered view keeps the
 * script's counts verbatim (F5).
 */
export function statusCounts(
  applications: ReadonlyArray<Application>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const app of applications) {
    if (app.statusId === null) continue;
    counts[app.statusId] = (counts[app.statusId] ?? 0) + 1;
  }
  return counts;
}

/** Build cumulative funnel stages from the script's `funnel` status counts. */
export function funnelStages(funnel: Record<string, number>): FunnelStage[] {
  const stageCount = (ids: ReadonlySet<string> | null): number =>
    Object.entries(funnel).reduce(
      (sum, [status, count]) =>
        ids === null || ids.has(status) ? sum + count : sum,
      0,
    );

  const total = stageCount(null);
  let prev: number | null = null;
  return FUNNEL_STAGES.map(({ id, label, ids }) => {
    const count = stageCount(ids);
    const stage: FunnelStage = {
      id,
      label,
      count,
      pctOfPrev:
        prev === null || prev === 0 ? null : Math.round((count / prev) * 100),
      pctOfTotal: total > 0 ? Math.round((count / total) * 100) : 0,
    };
    prev = count;
    return stage;
  });
}

// ---------------------------------------------------------------------------
// Score histogram — binned from the tracker's own scores (the script only
// reports per-outcome avg/min/max, not a distribution).
// ---------------------------------------------------------------------------

export interface HistogramBin {
  /** Inclusive lower edge. */
  from: number;
  /** Exclusive upper edge (inclusive for the final 5.0 bin). */
  to: number;
  /** e.g. "3.0–3.5" */
  label: string;
  count: number;
}

/**
 * Fixed 0–5 domain in `binWidth` steps; N/A (null) and 0 scores are skipped
 * (0 is the tracker's "no score" sentinel); empty bins at both ends are
 * trimmed, interior gaps are kept so the shape doesn't lie.
 */
export function scoreHistogram(
  scores: ReadonlyArray<number | null>,
  binWidth = 0.5,
): HistogramBin[] {
  const valid = scores.filter((s): s is number => s !== null && s > 0 && s <= 5);
  if (valid.length === 0) return [];

  const binCount = Math.round(5 / binWidth);
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => {
    const from = i * binWidth;
    const to = from + binWidth;
    return { from, to, label: `${from.toFixed(1)}–${to.toFixed(1)}`, count: 0 };
  });
  for (const score of valid) {
    const index = Math.min(Math.floor(score / binWidth), binCount - 1);
    bins[index].count += 1;
  }

  // valid.length > 0 guarantees at least one non-empty bin.
  const first = bins.findIndex((b) => b.count > 0);
  let last = bins.length - 1;
  while (last > first && bins[last].count === 0) last -= 1;
  return bins.slice(first, last + 1);
}

// ---------------------------------------------------------------------------
// Activity series — tracker rows bucketed by ISO week (Monday start) or by
// day. The tracker Date column is the evaluation date until a row turns
// Applied, when it becomes the apply date (plan Decision 4) — so "tracked"
// counts every row dated in the bucket and "applied" the submitted ones.
// ---------------------------------------------------------------------------

export interface ActivityPoint {
  /** Bucket start (the Monday for weekly, the day itself for daily), YYYY-MM-DD. */
  date: string;
  /** Short axis label, e.g. "Jul 6". */
  label: string;
  /** Rows dated within the bucket (evaluations + applications). */
  tracked: number;
  /** Of those, rows that reached at least Applied. */
  applied: number;
}

const MS_PER_DAY = 86_400_000;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Monday 00:00 UTC of the date's ISO week. */
function mondayOf(date: string): number | null {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const day = new Date(t).getUTCDay(); // 0 = Sunday
  return t - ((day + 6) % 7) * MS_PER_DAY;
}

/** Midnight UTC of the date itself. */
function dayOf(date: string): number | null {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

function isoDate(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Per-bucket tracked/applied counts, gap-filled with zero buckets between the
 * first and last active one (interior gaps kept so the shape doesn't lie).
 * Rows with unparseable dates are skipped.
 */
function activitySeries(
  applications: ReadonlyArray<Application>,
  bucketOf: (date: string) => number | null,
  stepMs: number,
): ActivityPoint[] {
  const buckets = new Map<number, { tracked: number; applied: number }>();
  for (const app of applications) {
    const start = bucketOf(app.date);
    if (start === null) continue;
    const bucket = buckets.get(start) ?? { tracked: 0, applied: 0 };
    bucket.tracked += 1;
    if (app.statusId !== null && SUBMITTED_STATUS_IDS.has(app.statusId)) {
      bucket.applied += 1;
    }
    buckets.set(start, bucket);
  }
  if (buckets.size === 0) return [];

  const starts = [...buckets.keys()].sort((a, b) => a - b);
  const points: ActivityPoint[] = [];
  for (let t = starts[0]; t <= starts[starts.length - 1]; t += stepMs) {
    const bucket = buckets.get(t) ?? { tracked: 0, applied: 0 };
    const d = new Date(t);
    points.push({
      date: isoDate(t),
      label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`,
      tracked: bucket.tracked,
      applied: bucket.applied,
    });
  }
  return points;
}

/** Tracked/applied per ISO week (Monday start), zero weeks gap-filled. */
export function weeklyActivity(
  applications: ReadonlyArray<Application>,
): ActivityPoint[] {
  return activitySeries(applications, mondayOf, 7 * MS_PER_DAY);
}

/** Tracked/applied per day, zero days gap-filled. */
export function dailyActivity(
  applications: ReadonlyArray<Application>,
): ActivityPoint[] {
  return activitySeries(applications, dayOf, MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// Archetype / location breakdowns — from M3 report facets when the script's
// own breakdown is all "Unknown".
// ---------------------------------------------------------------------------

export interface BreakdownDatum {
  label: string;
  count: number;
}

/** True when the script actually resolved archetypes (anything besides the
 * "Unknown" bucket). On the real repo this is currently false → facets win. */
export function hasNamedArchetypes(
  breakdown: ReadonlyArray<ArchetypePattern>,
): boolean {
  return breakdown.some((b) => b.archetype !== "Unknown" && b.total > 0);
}

/** Fold everything past `max` labels into a single "Other" bucket (dataviz
 * rule: never more than ~8 categorical slots). Input must be sorted desc. */
export function foldTail(
  data: ReadonlyArray<BreakdownDatum>,
  max = 8,
): BreakdownDatum[] {
  if (data.length <= max) return [...data];
  const kept = data.slice(0, max - 1);
  const other = data
    .slice(max - 1)
    .reduce((sum, d) => sum + d.count, 0);
  return [...kept, { label: "Other", count: other }];
}

function countBy(labels: ReadonlyArray<string>): BreakdownDatum[] {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Reports per archetype family (a combined archetype counts toward each of
 * its families); reports with no archetype land in "Unknown". */
export function archetypeBreakdownFromFacets(
  facets: ReadonlyArray<ReportFacet>,
): BreakdownDatum[] {
  return foldTail(
    countBy(
      facets.flatMap((f) => {
        const families = archetypeFamilies(f.archetype);
        return families.length > 0 ? families : ["Unknown"];
      }),
    ),
  );
}

/** Reports per location bucket (EU/US/Remote/Other from M3's `bucketLocation`);
 * reports with no parsed location land in "Unknown". */
export function locationBreakdownFromFacets(
  facets: ReadonlyArray<ReportFacet>,
): BreakdownDatum[] {
  return foldTail(countBy(facets.map((f) => f.locationBucket ?? "Unknown")));
}

// ---------------------------------------------------------------------------
// Advance-rate breakdowns (score bands / archetype families) — same funnel
// sets as lib/stats.ts (mirroring analyze-patterns), same honesty rules as the
// vendor chart: low-n bars are grayed but never hidden, every rate carries n.
// ---------------------------------------------------------------------------

/** One advance-rate bar of a categorical breakdown. */
export interface RateDatum {
  label: string;
  /** Submitted applications in the bucket. */
  n: number;
  /** Of those, how many advanced past screening. */
  advanced: number;
  /** Rounded %, advanced / n. */
  rate: number;
  /** Low sample (n < minSample) — rendered gray, never hidden. */
  grayed: boolean;
}

function toRateData(
  buckets: ReadonlyArray<{ label: string; n: number; advanced: number }>,
  minSample: number,
): RateDatum[] {
  return buckets.map(({ label, n, advanced }) => ({
    label,
    n,
    advanced,
    rate: n > 0 ? Math.round((advanced / n) * 100) : 0,
    grayed: n < minSample,
  }));
}

/** Fixed score bands around the 3.5/4.0 decision thresholds. */
const SCORE_BANDS: ReadonlyArray<{
  label: string;
  min: number;
  max: number;
}> = [
  { label: "< 3.0", min: 0, max: 3 },
  { label: "3.0–3.4", min: 3, max: 3.5 },
  { label: "3.5–3.9", min: 3.5, max: 4 },
  { label: "≥ 4.0", min: 4, max: Infinity },
];

/**
 * Advance rate per score band, over SUBMITTED applications with a parseable
 * score — does the tracker's scoring actually predict responses? Empty bands
 * are kept so a hole in the middle stays visible.
 */
export function scoreOutcomeBands(
  applications: ReadonlyArray<Application>,
  minSample: number,
): RateDatum[] {
  const buckets = SCORE_BANDS.map((band) => ({
    label: band.label,
    n: 0,
    advanced: 0,
  }));
  let any = false;
  for (const app of applications) {
    if (app.statusId === null || !SUBMITTED_STATUS_IDS.has(app.statusId)) continue;
    if (app.score === null || app.score <= 0) continue;
    const index = SCORE_BANDS.findIndex(
      (band) => app.score! >= band.min && app.score! < band.max,
    );
    if (index === -1) continue;
    any = true;
    buckets[index].n += 1;
    if (ADVANCED_STATUS_IDS.has(app.statusId)) buckets[index].advanced += 1;
  }
  return any ? toRateData(buckets, minSample) : [];
}

/**
 * Advance rate per archetype family, from report facets + tracker statuses
 * (a combined archetype counts toward each family). Sorted by n desc so the
 * biggest bets read first; capped at 8 slots like every breakdown.
 */
export function archetypeYield(
  facets: ReadonlyArray<ReportFacet>,
  applications: ReadonlyArray<Application>,
  minSample: number,
): RateDatum[] {
  const archetypeByNum = new Map(facets.map((f) => [f.num, f.archetype]));
  const buckets = new Map<string, { n: number; advanced: number }>();
  for (const app of applications) {
    if (app.statusId === null || !SUBMITTED_STATUS_IDS.has(app.statusId)) continue;
    const families = archetypeFamilies(archetypeByNum.get(app.num) ?? null);
    for (const family of families) {
      const bucket = buckets.get(family) ?? { n: 0, advanced: 0 };
      bucket.n += 1;
      if (ADVANCED_STATUS_IDS.has(app.statusId)) bucket.advanced += 1;
      buckets.set(family, bucket);
    }
  }
  const sorted = [...buckets.entries()]
    .map(([label, { n, advanced }]) => ({ label, n, advanced }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, 8);
  return toRateData(sorted, minSample);
}

// ---------------------------------------------------------------------------
// Pipeline aging — submitted applications still waiting on a first reply
// (status exactly `applied`), bucketed by days since the apply date.
// ---------------------------------------------------------------------------

export interface AgingBucket {
  label: string;
  count: number;
  /** The "this is stale" bucket — the only one that may wear the negative color. */
  stale: boolean;
}

export interface PipelineAging {
  buckets: AgingBucket[];
  /** Total applications waiting on a reply. */
  waiting: number;
  /** Age in days of the oldest waiting application, null when none. */
  oldestDays: number | null;
}

const AGING_EDGES: ReadonlyArray<{ label: string; max: number }> = [
  { label: "≤ 7d", max: 7 },
  { label: "8–14d", max: 14 },
  { label: "15–21d", max: 21 },
  { label: "> 21d", max: Infinity },
];

/**
 * Waiting = status exactly `applied` (submitted, no reply yet — rejected and
 * advanced rows already got their answer). `now` is injected so the transform
 * stays pure/testable; rows with unparseable dates are skipped.
 */
export function pipelineAging(
  applications: ReadonlyArray<Application>,
  now: number,
): PipelineAging {
  const buckets = AGING_EDGES.map(({ label }, i) => ({
    label,
    count: 0,
    stale: i === AGING_EDGES.length - 1,
  }));
  let waiting = 0;
  let oldestDays: number | null = null;
  for (const app of applications) {
    if (app.statusId !== "applied") continue;
    const t = Date.parse(`${app.date}T00:00:00`);
    if (Number.isNaN(t)) continue;
    const days = Math.max(0, Math.floor((now - t) / 86_400_000));
    waiting += 1;
    oldestDays = oldestDays === null ? days : Math.max(oldestDays, days);
    buckets[AGING_EDGES.findIndex((e) => days <= e.max)].count += 1;
  }
  return { buckets, waiting, oldestDays };
}

// ---------------------------------------------------------------------------
// ATS vendor advance-rate bars (F5: gray out low-n, show counts alongside
// rates — small n = don't lie; every rate displays its n).
// ---------------------------------------------------------------------------

export interface VendorDatum {
  vendor: string;
  total: number;
  advanced: number;
  /** Rounded %, advanced / total. */
  advanceRate: number;
  /** Low sample (n < minSampleForClaim) — rendered gray, never hidden. */
  grayed: boolean;
}

export interface VendorChartData {
  /** "script" when analyze-patterns identified vendors; "facets" when its
   * breakdown is empty and we derive channel yield from report facets. */
  source: "script" | "facets";
  minSample: number;
  submitted: number;
  identified: number;
  data: VendorDatum[];
}

function fromScript(entries: ReadonlyArray<VendorBreakdownEntry>): VendorDatum[] {
  return entries.map((e) => ({
    vendor: e.vendor,
    total: e.total,
    advanced: e.advanced,
    advanceRate: e.advanceRate,
    grayed: !e.sufficientSample,
  }));
}

/**
 * Fallback: same channel-yield math over report facets + tracker statuses
 * (submitted = reached at least Applied; advanced = responded/interview/offer
 * — identical sets to analyze-patterns'). Only used when the script's own
 * breakdown is empty (its report-link resolution found no vendors).
 */
export function vendorBarsFromFacets(
  facets: ReadonlyArray<ReportFacet>,
  applications: ReadonlyArray<Application>,
  minSample: number,
): { data: VendorDatum[]; submitted: number; identified: number } {
  const vendorByNum = new Map(facets.map((f) => [f.num, f.atsVendor]));
  const submitted = applications.filter(
    (a) => a.statusId !== null && SUBMITTED_STATUS_IDS.has(a.statusId),
  );

  const buckets = new Map<string, { total: number; advanced: number }>();
  let identified = 0;
  for (const app of submitted) {
    const vendor = vendorByNum.get(app.num) ?? null;
    if (!vendor) continue;
    identified += 1;
    const bucket = buckets.get(vendor) ?? { total: 0, advanced: 0 };
    bucket.total += 1;
    if (app.statusId !== null && ADVANCED_STATUS_IDS.has(app.statusId)) {
      bucket.advanced += 1;
    }
    buckets.set(vendor, bucket);
  }

  const data = [...buckets.entries()]
    .map(([vendor, { total, advanced }]) => ({
      vendor,
      total,
      advanced,
      advanceRate: total > 0 ? Math.round((advanced / total) * 100) : 0,
      grayed: total < minSample,
    }))
    .sort((a, b) => b.total - a.total || a.vendor.localeCompare(b.vendor));
  return { data, submitted: submitted.length, identified };
}

/** Script breakdown when present; facet-derived channel yield otherwise. */
export function vendorChartData(
  analysis: VendorAnalysis,
  facets: ReadonlyArray<ReportFacet>,
  applications: ReadonlyArray<Application>,
): VendorChartData {
  if (analysis.breakdown.length > 0) {
    return {
      source: "script",
      minSample: analysis.minSampleForClaim,
      submitted: analysis.submitted,
      identified: analysis.identified,
      data: fromScript(analysis.breakdown),
    };
  }
  const fallback = vendorBarsFromFacets(
    facets,
    applications,
    analysis.minSampleForClaim,
  );
  return {
    source: "facets",
    minSample: analysis.minSampleForClaim,
    submitted: fallback.submitted,
    identified: fallback.identified,
    data: fallback.data,
  };
}
