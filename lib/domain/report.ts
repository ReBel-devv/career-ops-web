import { z } from "zod";

/**
 * Evaluation report — `reports/{NNN}-{slug}-{YYYY-MM-DD}.md`.
 * Header key-values + `## Machine Summary` YAML block + `## Score Global`
 * table + Blocks A–G prose. Reports are French prose; the UI chrome stays
 * English (plan Decision 3). Everything degrades gracefully: a report with no
 * Machine Summary, no Score Global, or no lettered blocks still parses (F2 AC).
 * The parser itself lives in `lib/parsers/report.ts`.
 */

/** `## Machine Summary` fenced YAML. Fields vary per report → all optional,
 * unknown keys preserved (loose). */
export const machineSummarySchema = z.looseObject({
  company: z.string().optional(),
  role: z.string().optional(),
  location: z.string().optional(),
  comp: z.string().optional(),
  score: z.number().optional(),
  legitimacy_tier: z.string().optional(),
  archetype: z.string().optional(),
  final_decision: z.string().optional(),
  hard_stops: z.array(z.string()).default([]),
  soft_gaps: z.array(z.string()).default([]),
  top_strengths: z.array(z.string()).default([]),
  risk_level: z.string().optional(),
  confidence: z.string().optional(),
  next_action: z.string().optional(),
});

export type MachineSummary = z.infer<typeof machineSummarySchema>;

/** `**Key:** value` header lines between the title and the first `##`. Key
 * labels are accent/language-tolerant (Archetype / Arquetipo / Archétype …)
 * and normalized to these canonical fields; `extras` keeps the raw map. */
export const reportHeaderSchema = z.object({
  date: z.string().optional(),
  archetype: z.string().optional(),
  score: z.string().optional(),
  legitimacy: z.string().optional(),
  verification: z.string().optional(),
  url: z.string().optional(),
  pdf: z.string().optional(),
  batchId: z.string().optional(),
  /** Any header key we didn't map, keyed by its normalized (accent-stripped) label. */
  extras: z.record(z.string(), z.string()).default({}),
});

export type ReportHeader = z.infer<typeof reportHeaderSchema>;

/** One row of the `## Score Global` table. */
export const scoreRowSchema = z.object({
  dimension: z.string(),
  score: z.string(),
  comment: z.string(),
});

export type ScoreRow = z.infer<typeof scoreRowSchema>;

export const scoreGlobalSchema = z.object({
  rows: z.array(scoreRowSchema),
  /** The `**Global**` summary row, when present. */
  global: scoreRowSchema.nullable(),
});

export type ScoreGlobal = z.infer<typeof scoreGlobalSchema>;

/** A `## ` section of the report body (Machine Summary + Score Global are
 * lifted into their own fields and excluded here). `letter` is A–G (or a
 * range like `E-F`) when the heading is a lettered block, else null. */
export const reportBlockSchema = z.object({
  /** Detected block letter(s), e.g. `A`, `G`, `E-F`; null for unlettered sections. */
  letter: z.string().nullable(),
  /** Heading text without the leading `## `. */
  title: z.string(),
  /** Section markdown (heading line included) for rendering. */
  markdown: z.string(),
});

export type ReportBlock = z.infer<typeof reportBlockSchema>;

export const locationBucketSchema = z.enum(["EU", "US", "Remote", "Other"]);
export type LocationBucket = z.infer<typeof locationBucketSchema>;

export const reportSchema = z.object({
  num: z.number().int().nonnegative(),
  /** Path relative to the data repo root, e.g. `reports/028-acme-2026-07-06.md`. */
  path: z.string(),
  title: z.string(),
  header: reportHeaderSchema,
  /** Null when the report has no parseable Machine Summary (graceful fallback). */
  machineSummary: machineSummarySchema.nullable(),
  /** Null when the report has no parseable Score Global table. */
  scoreGlobal: scoreGlobalSchema.nullable(),
  /** Body sections (Blocks A–G + any other `## ` sections), in file order. */
  blocks: z.array(reportBlockSchema),
  /** Full raw markdown for a render fallback when block splitting finds nothing. */
  markdown: z.string(),
  /** ATS vendor derived from the posting URL host (Lever / Greenhouse / Ashby / …). */
  atsVendor: z.string().nullable(),
  /** Coarse location bucket derived from the Machine Summary / header. */
  locationBucket: locationBucketSchema.nullable(),
});

export type Report = z.infer<typeof reportSchema>;

/**
 * Lightweight per-application facets derived from a report, used to power the
 * archetype / ATS-vendor / location filters (F4) without shipping the whole
 * report body to the client. M5 reuses these for archetype/vendor aggregates.
 */
export const reportFacetSchema = z.object({
  num: z.number().int().nonnegative(),
  archetype: z.string().nullable(),
  atsVendor: z.string().nullable(),
  locationBucket: locationBucketSchema.nullable(),
  /** Raw free-text location (Machine Summary / header) — feeds the offer map's
   * city gazetteer (lib/geo.ts); the coarse bucket above stays the filter key. */
  location: z.string().nullable().default(null),
});

export type ReportFacet = z.infer<typeof reportFacetSchema>;
