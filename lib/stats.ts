import type { Application } from "@/lib/domain";

/**
 * Pipeline stat math for the F3 stats header.
 *
 * The funnel conventions here mirror `analyze-patterns.mjs` in the data repo so
 * the dashboard never contradicts the CLI's own numbers:
 *
 * - "submitted" = an application we actually sent (reached at least Applied).
 *   Matches analyze-patterns' `SUBMITTED_STATUSES` — everything except
 *   `evaluated` (never applied) and `skip` (self-filtered).
 * - "advanced" = the company engaged past screening. Matches
 *   analyze-patterns' `ADVANCED_STATUSES` — STRICTER than a bare `applied`
 *   (submitted, no reply yet does NOT count as a response).
 * - "response rate" = advanced / submitted, i.e. analyze-patterns'
 *   `overallAdvanceRate`.
 *
 * Statuses are matched by canonical id (states.yml), so aliases already
 * resolved upstream (`aplicado` → `applied`) count correctly.
 */

/** Applications actually submitted (analyze-patterns `SUBMITTED_STATUSES`). */
export const SUBMITTED_STATUS_IDS: ReadonlySet<string> = new Set([
  "applied",
  "responded",
  "interview",
  "offer",
  "rejected",
  "discarded",
]);

/** Advanced past screening (analyze-patterns `ADVANCED_STATUSES`). */
export const ADVANCED_STATUS_IDS: ReadonlySet<string> = new Set([
  "responded",
  "interview",
  "offer",
]);

export interface FollowUpStats {
  /** Follow-ups due today or in the window. Null until M4 wires cadence. */
  due: number | null;
  /** Follow-ups already past their pinned date. Null until M4. */
  overdue: number | null;
}

export interface PipelineStats {
  /** Applications submitted (reached at least Applied). */
  applied: number;
  /** Same value, named for the funnel denominator. */
  submitted: number;
  /** Submitted applications the company engaged with (responded+). */
  advanced: number;
  /** advanced / submitted as a 0–100 percentage; null when nothing submitted. */
  responseRate: number | null;
  /** Mean of parseable positive scores across the whole tracker; null when none. */
  avgScore: number | null;
  /** How many tracker rows carried a parseable score (avgScore's n). */
  scoredCount: number;
  /** Follow-up cadence — seam for M4 (null values render as "—"). */
  followUps: FollowUpStats;
}

/**
 * Compute the persistent header stats over ALL tracker rows (unfiltered — the
 * header reflects the whole pipeline, not the current view).
 *
 * `followUps` is left null: M4 wires `followup-cadence.mjs`. The shape is typed
 * now so the header and its consumers don't change when M4 lands.
 */
export function computePipelineStats(applications: Application[]): PipelineStats {
  let submitted = 0;
  let advanced = 0;
  let scoreSum = 0;
  let scoredCount = 0;

  for (const app of applications) {
    if (app.statusId !== null && SUBMITTED_STATUS_IDS.has(app.statusId)) {
      submitted += 1;
      if (ADVANCED_STATUS_IDS.has(app.statusId)) advanced += 1;
    }
    // analyze-patterns averages only strictly-positive scores.
    if (app.score !== null && app.score > 0) {
      scoreSum += app.score;
      scoredCount += 1;
    }
  }

  return {
    applied: submitted,
    submitted,
    advanced,
    responseRate: submitted > 0 ? Math.round((advanced / submitted) * 100) : null,
    avgScore: scoredCount > 0 ? scoreSum / scoredCount : null,
    scoredCount,
    followUps: { due: null, overdue: null },
  };
}
