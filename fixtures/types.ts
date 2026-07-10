/**
 * Shared shapes for the DEMO fixture set (M7). Everything under `fixtures/` is
 * ENTIRELY FICTIONAL — invented companies, invented people, invented postings.
 * Nothing resembles the real career-ops tracker (a diff-check test proves zero
 * overlap when CAREER_OPS_PATH is set: see tests/demo-fixtures.test.ts).
 * These fixtures are the ONLY dataset the public Vercel demo ever serves
 * (DEMO_MODE=true).
 */

/** One fictional tracker row for the demo dataset. */
export interface DemoApp {
  num: number;
  /** Tracker Date column — apply date once Applied (plan Decision 4). */
  date: string;
  company: string;
  role: string;
  score: number | null;
  /** Canonical states.yml id. */
  statusId: string;
  hasPdf: boolean;
  notes: string;
  /** Report path (relative to a fictional data repo root) when a demo report
   * exists for this app, else null. */
  reportPath: string | null;
}

/** A demo report: its number, repo-relative path, and full markdown body. */
export interface DemoReport {
  num: number;
  path: string;
  content: string;
}

/**
 * Dynamic follow-up seed: `dueInDays` is relative to "today" at load, so the
 * demo calendar NEVER goes stale (negative = overdue, 0 = due today,
 * positive = upcoming).
 */
export interface DemoFollowUpSeed {
  appNum: number;
  dueInDays: number;
  /** Pre-logged follow-ups for this app (count drives followupCount). */
  loggedDaysAgo?: number[];
}
