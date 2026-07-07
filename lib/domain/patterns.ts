import { z } from "zod";

/**
 * `analyze-patterns.mjs --json` output (plan §3 F5). Pattern math is NEVER
 * recomputed in the web app — the script is the single source of truth for
 * funnel counts, outcome buckets, vendor advance rates, and recommendations.
 * We zod-validate its JSON at the boundary and render it.
 *
 * Schemas are intentionally loose (unknown keys preserved, M4 pattern) so a
 * new field in the script doesn't break the boundary — the dashboard reads
 * what it needs.
 *
 * Shape observed against the real repo (2026-07-07): top-level keys
 * `metadata, funnel, scoreComparison, archetypeBreakdown, blockerAnalysis,
 * remotePolicy, companySizeBreakdown, vendorAnalysis, scoreThreshold,
 * techStackGaps, recommendations`. On a too-small tracker the script instead
 * prints `{ error, current, threshold }` — a valid state, not a failure.
 */

/** Outcome buckets used across metadata and every breakdown. */
export const outcomeCountsSchema = z.looseObject({
  positive: z.number(),
  negative: z.number(),
  self_filtered: z.number(),
  pending: z.number(),
});
export type OutcomeCounts = z.infer<typeof outcomeCountsSchema>;

export const patternsMetadataSchema = z.looseObject({
  total: z.number().int(),
  // `from`/`to` are omitted from the JSON when the tracker has no dates.
  dateRange: z
    .looseObject({ from: z.string().optional(), to: z.string().optional() })
    .optional(),
  analysisDate: z.string(),
  byOutcome: outcomeCountsSchema,
});
export type PatternsMetadata = z.infer<typeof patternsMetadataSchema>;

/** Score stats per outcome bucket (all zeros when the bucket is empty). */
export const scoreStatsSchema = z.looseObject({
  avg: z.number(),
  min: z.number(),
  max: z.number(),
  count: z.number().int(),
});
export type ScoreStats = z.infer<typeof scoreStatsSchema>;

export const scoreComparisonSchema = z.looseObject({
  positive: scoreStatsSchema,
  negative: scoreStatsSchema,
  self_filtered: scoreStatsSchema,
  pending: scoreStatsSchema,
});
export type ScoreComparison = z.infer<typeof scoreComparisonSchema>;

/** One archetype bucket. `archetype` is `"Unknown"` when the script could not
 * resolve the report (the real repo currently yields a single Unknown bucket —
 * the UI falls back to report facets for named archetypes). */
export const archetypePatternSchema = z.looseObject({
  archetype: z.string(),
  total: z.number().int(),
  positive: z.number().int(),
  negative: z.number().int(),
  self_filtered: z.number().int(),
  pending: z.number().int(),
  conversionRate: z.number(),
});
export type ArchetypePattern = z.infer<typeof archetypePatternSchema>;

export const remotePolicyPatternSchema = z.looseObject({
  policy: z.string(),
  total: z.number().int(),
  positive: z.number().int(),
  negative: z.number().int(),
  self_filtered: z.number().int(),
  pending: z.number().int(),
  conversionRate: z.number(),
});
export type RemotePolicyPattern = z.infer<typeof remotePolicyPatternSchema>;

export const companySizePatternSchema = z.looseObject({
  size: z.string(),
  total: z.number().int(),
  conversionRate: z.number(),
});

export const blockerPatternSchema = z.looseObject({
  blocker: z.string(),
  frequency: z.number().int(),
  percentage: z.number(),
});

/** One ATS vendor bucket of the channel-yield analysis. `sufficientSample`
 * (total >= minSampleForClaim) is the script's own low-n flag — the UI grays
 * the bar but still SHOWS it with its n (F5: small n = don't lie). */
export const vendorBreakdownEntrySchema = z.looseObject({
  vendor: z.string(),
  total: z.number().int(),
  advanced: z.number().int(),
  advanceRate: z.number(),
  sharePct: z.number(),
  sufficientSample: z.boolean(),
});
export type VendorBreakdownEntry = z.infer<typeof vendorBreakdownEntrySchema>;

export const vendorAnalysisSchema = z.looseObject({
  scope: z.array(z.string()).default([]),
  minSampleForClaim: z.number().int(),
  submitted: z.number().int(),
  identified: z.number().int(),
  coveragePct: z.number(),
  overallAdvanceRate: z.number(),
  breakdown: z.array(vendorBreakdownEntrySchema).default([]),
  citation: z.string().optional(),
});
export type VendorAnalysis = z.infer<typeof vendorAnalysisSchema>;

export const scoreThresholdSchema = z.looseObject({
  recommended: z.number(),
  reasoning: z.string(),
  positiveRange: z.string(),
});

/** Rendered verbatim in the recommendations card (F5 AC). */
export const recommendationSchema = z.looseObject({
  action: z.string(),
  reasoning: z.string(),
  impact: z.string(),
});
export type Recommendation = z.infer<typeof recommendationSchema>;

export const techStackGapSchema = z.looseObject({
  skill: z.string(),
  frequency: z.number().int(),
});

/** The successful `analyze-patterns.mjs --json` payload. */
export const patternsSchema = z.looseObject({
  metadata: patternsMetadataSchema,
  /** Raw counts keyed by normalized status id (dynamic keys — the script only
   * emits statuses that occur). Stage math lives in `lib/analytics.ts`. */
  funnel: z.record(z.string(), z.number().int()),
  scoreComparison: scoreComparisonSchema,
  archetypeBreakdown: z.array(archetypePatternSchema).default([]),
  blockerAnalysis: z.array(blockerPatternSchema).default([]),
  remotePolicy: z.array(remotePolicyPatternSchema).default([]),
  companySizeBreakdown: z.array(companySizePatternSchema).default([]),
  vendorAnalysis: vendorAnalysisSchema,
  scoreThreshold: scoreThresholdSchema,
  techStackGaps: z.array(techStackGapSchema).default([]),
  recommendations: z.array(recommendationSchema).default([]),
});
export type Patterns = z.infer<typeof patternsSchema>;

/**
 * What the DataSource returns: either the full analysis or the script's own
 * "not enough data yet" sentinel (`{ error, current, threshold }` on exit 1) —
 * a valid, renderable state, never an exception.
 */
export const patternsResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ok"), patterns: patternsSchema }),
  z.object({
    kind: z.literal("insufficient"),
    current: z.number().int(),
    threshold: z.number().int(),
    message: z.string(),
  }),
]);
export type PatternsResult = z.infer<typeof patternsResultSchema>;
