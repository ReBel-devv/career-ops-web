import { z } from "zod";

/**
 * One tracker row from `data/applications.md`, normalized for the UI.
 * Raw cell values are kept alongside parsed ones so nothing is lost and
 * write-back (M1) can be surgical.
 */
export const applicationSchema = z.object({
  num: z.number().int().nonnegative(),
  /** Tracker Date column, `YYYY-MM-DD`. By convention (plan Decision 4) this
   * is the apply date once the row turns Applied. */
  date: z.string(),
  company: z.string().min(1),
  role: z.string().min(1),
  /** Raw Score cell (`4.2/5`, `N/A`, `DUP`). */
  scoreRaw: z.string(),
  /** Parsed score, null for N/A / DUP / unparseable. */
  score: z.number().min(0).max(5).nullable(),
  /** Raw Status cell exactly as written. */
  statusRaw: z.string(),
  /** Canonical state id (states.yml), null when unresolvable. */
  statusId: z.string().nullable(),
  /** Canonical state label, null when unresolvable. */
  statusLabel: z.string().nullable(),
  /** states.yml dashboard_group, null when unresolvable. */
  dashboardGroup: z.string().nullable(),
  hasPdf: z.boolean(),
  /** Report link target as written in the tracker, null when absent. */
  reportPath: z.string().nullable(),
  notes: z.string(),
  /** Optional custom Location column (header-aware layouts). */
  location: z.string().nullable(),
});

export type Application = z.infer<typeof applicationSchema>;
