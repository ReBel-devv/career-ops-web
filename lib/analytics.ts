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
