import type { Application, Patterns, ReportFacet } from "@/lib/domain";
import { vendorBarsFromFacets } from "@/lib/analytics";
import { ADVANCED_STATUS_IDS, SUBMITTED_STATUS_IDS } from "@/lib/stats";

/**
 * Demo analytics — DERIVED from the fixture applications + report facets at
 * request time (never hand-written numbers), using the same outcome-bucket and
 * channel-yield conventions as `analyze-patterns.mjs` (SUBMITTED/ADVANCED sets
 * come from lib/stats which mirrors the script; vendor bars reuse the exact
 * `vendorBarsFromFacets` math from lib/analytics). If the fixtures change, the
 * analytics stay consistent automatically, and `patternsSchema` validation in
 * DemoDataSource makes any drift fail loudly in tests.
 *
 * minSampleForClaim is 3 (vs the CLI's 8) so the demo shows BOTH the accented
 * and the grayed low-n vendor bars.
 */

const MIN_SAMPLE_FOR_CLAIM = 3;

type Outcome = "positive" | "negative" | "self_filtered" | "pending";

/** Outcome bucket per status id — mirrors analyze-patterns' mapping. */
function outcomeOf(statusId: string | null): Outcome {
  if (statusId === null) return "pending";
  if (ADVANCED_STATUS_IDS.has(statusId)) return "positive";
  if (statusId === "rejected") return "negative";
  if (statusId === "skip" || statusId === "discarded") return "self_filtered";
  return "pending"; // evaluated, applied (no reply yet)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface OutcomeCountsMut {
  positive: number;
  negative: number;
  self_filtered: number;
  pending: number;
}

function emptyOutcomes(): OutcomeCountsMut {
  return { positive: 0, negative: 0, self_filtered: 0, pending: 0 };
}

function scoreStats(scores: number[]): {
  avg: number;
  min: number;
  max: number;
  count: number;
} {
  if (scores.length === 0) return { avg: 0, min: 0, max: 0, count: 0 };
  const sum = scores.reduce((a, b) => a + b, 0);
  return {
    avg: round1(sum / scores.length),
    min: Math.min(...scores),
    max: Math.max(...scores),
    count: scores.length,
  };
}

export function buildDemoPatterns(
  apps: Application[],
  facets: ReportFacet[],
  analysisDate: string,
): Patterns {
  // ---- outcome buckets -----------------------------------------------------
  const byOutcome = emptyOutcomes();
  const scoresByOutcome: Record<Outcome, number[]> = {
    positive: [],
    negative: [],
    self_filtered: [],
    pending: [],
  };
  const funnel: Record<string, number> = {};
  for (const app of apps) {
    const outcome = outcomeOf(app.statusId);
    byOutcome[outcome] += 1;
    if (app.score !== null && app.score > 0) scoresByOutcome[outcome].push(app.score);
    const key = app.statusId ?? "unknown";
    funnel[key] = (funnel[key] ?? 0) + 1;
  }

  // ---- archetype breakdown (facets joined to app outcomes) ------------------
  const facetByNum = new Map(facets.map((f) => [f.num, f]));
  const archetypes = new Map<string, OutcomeCountsMut & { total: number }>();
  for (const app of apps) {
    const archetype = facetByNum.get(app.num)?.archetype;
    if (!archetype) continue;
    const bucket =
      archetypes.get(archetype) ?? { ...emptyOutcomes(), total: 0 };
    bucket.total += 1;
    bucket[outcomeOf(app.statusId)] += 1;
    archetypes.set(archetype, bucket);
  }
  const archetypeBreakdown = [...archetypes.entries()]
    .map(([archetype, b]) => ({
      archetype,
      total: b.total,
      positive: b.positive,
      negative: b.negative,
      self_filtered: b.self_filtered,
      pending: b.pending,
      conversionRate: b.total > 0 ? Math.round((b.positive / b.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total || a.archetype.localeCompare(b.archetype));

  // ---- remote policy (facet location buckets) --------------------------------
  const policies = new Map<string, OutcomeCountsMut & { total: number }>();
  for (const app of apps) {
    const bucket = facetByNum.get(app.num)?.locationBucket;
    if (!bucket) continue;
    const policy = bucket === "Remote" ? "remote" : "hybrid/onsite";
    const entry = policies.get(policy) ?? { ...emptyOutcomes(), total: 0 };
    entry.total += 1;
    entry[outcomeOf(app.statusId)] += 1;
    policies.set(policy, entry);
  }
  const remotePolicy = [...policies.entries()].map(([policy, b]) => ({
    policy,
    total: b.total,
    positive: b.positive,
    negative: b.negative,
    self_filtered: b.self_filtered,
    pending: b.pending,
    conversionRate: b.total > 0 ? Math.round((b.positive / b.total) * 100) : 0,
  }));

  // ---- vendor channel yield (same math as the dashboard's facet fallback) ---
  const submittedApps = apps.filter(
    (a) => a.statusId !== null && SUBMITTED_STATUS_IDS.has(a.statusId),
  );
  const advancedCount = submittedApps.filter(
    (a) => a.statusId !== null && ADVANCED_STATUS_IDS.has(a.statusId),
  ).length;
  const vendor = vendorBarsFromFacets(facets, apps, MIN_SAMPLE_FOR_CLAIM);
  const vendorAnalysis = {
    scope: ["greenhouse", "lever", "ashby", "workday"],
    minSampleForClaim: MIN_SAMPLE_FOR_CLAIM,
    submitted: vendor.submitted,
    identified: vendor.identified,
    coveragePct:
      vendor.submitted > 0
        ? Math.round((vendor.identified / vendor.submitted) * 100)
        : 0,
    overallAdvanceRate:
      submittedApps.length > 0
        ? Math.round((advancedCount / submittedApps.length) * 100)
        : 0,
    breakdown: vendor.data.map((d) => ({
      vendor: d.vendor,
      total: d.total,
      advanced: d.advanced,
      advanceRate: d.advanceRate,
      sharePct:
        vendor.identified > 0
          ? Math.round((d.total / vendor.identified) * 100)
          : 0,
      sufficientSample: !d.grayed,
    })),
    citation:
      "Bommasani et al., Algorithmic Monocultures in Hiring, FAccT 2026",
  };

  // ---- score threshold (lowest positive-outcome score) -----------------------
  const positiveScores = scoresByOutcome.positive;
  const recommended =
    positiveScores.length > 0 ? Math.min(...positiveScores) : 3.5;
  const scoreThreshold = {
    recommended,
    reasoning: `Lowest score among positive outcomes is ${recommended.toFixed(1)}. Applications below this score have not led to progress in this (fictional) demo dataset.`,
    positiveRange:
      positiveScores.length > 0
        ? `${Math.min(...positiveScores).toFixed(1)} - ${Math.max(...positiveScores).toFixed(1)}`
        : "n/a",
  };

  // ---- narrative extras (consistent with the fixture reports) ---------------
  const blockerAnalysis = [
    { blocker: "seniority-bar", frequency: 2, percentage: Math.round((2 / apps.length) * 100) },
    { blocker: "work-authorization", frequency: 1, percentage: Math.round((1 / apps.length) * 100) },
    { blocker: "required-skill-gap", frequency: 1, percentage: Math.round((1 / apps.length) * 100) },
  ];
  const techStackGaps = [
    { skill: "D3 (canvas-level)", frequency: 1 },
    { skill: "CRDT / collaborative editing", frequency: 1 },
    { skill: "Monorepo tooling", frequency: 1 },
  ];

  const bestArchetype = archetypeBreakdown.find((a) => a.conversionRate > 0);
  const recommendations = [
    {
      action: `Set a minimum score threshold of ${recommended.toFixed(1)}/5 before applying`,
      reasoning: scoreThreshold.reasoning,
      impact: "medium",
    },
    ...(bestArchetype
      ? [
          {
            action: `Double down on "${bestArchetype.archetype}" roles (${bestArchetype.conversionRate}% conversion)`,
            reasoning: `${bestArchetype.positive} of ${bestArchetype.total} applications in this archetype advanced past screening.`,
            impact: "medium",
          },
        ]
      : []),
  ];

  const dates = apps.map((a) => a.date).filter(Boolean).sort();
  return {
    metadata: {
      total: apps.length,
      dateRange: { from: dates[0], to: dates[dates.length - 1] },
      analysisDate,
      byOutcome: { ...byOutcome },
    },
    funnel,
    scoreComparison: {
      positive: scoreStats(scoresByOutcome.positive),
      negative: scoreStats(scoresByOutcome.negative),
      self_filtered: scoreStats(scoresByOutcome.self_filtered),
      pending: scoreStats(scoresByOutcome.pending),
    },
    archetypeBreakdown,
    blockerAnalysis,
    remotePolicy,
    companySizeBreakdown: [
      {
        size: "unknown",
        total: apps.length,
        conversionRate: Math.round((byOutcome.positive / apps.length) * 100),
      },
    ],
    vendorAnalysis,
    scoreThreshold,
    techStackGaps,
    recommendations,
  };
}
