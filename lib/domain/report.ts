import { z } from "zod";

/**
 * Evaluation report — `reports/{NNN}-{slug}-{YYYY-MM-DD}.md`.
 * Header key-values + `## Machine Summary` YAML block + Blocks A–G prose.
 * Full parser lands in M3; the contract is fixed here.
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

/** `**Key:** value` header lines between the title and the first `##`. */
export const reportHeaderSchema = z.object({
  date: z.string().optional(),
  archetype: z.string().optional(),
  score: z.string().optional(),
  legitimacy: z.string().optional(),
  verification: z.string().optional(),
  url: z.string().optional(),
  pdf: z.string().optional(),
});

export type ReportHeader = z.infer<typeof reportHeaderSchema>;

export const reportSchema = z.object({
  num: z.number().int().nonnegative(),
  /** Path relative to the data repo root, e.g. `reports/028-acme-2026-07-06.md`. */
  path: z.string(),
  title: z.string(),
  header: reportHeaderSchema,
  /** Null when the report has no parseable Machine Summary (graceful fallback). */
  machineSummary: machineSummarySchema.nullable(),
  /** Full raw markdown (Blocks A–G) for client-side rendering. */
  markdown: z.string(),
});

export type Report = z.infer<typeof reportSchema>;
