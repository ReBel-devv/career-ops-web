import type { DemoFollowUpSeed } from "./types";

/**
 * Dynamic follow-up seeds for every actionable demo app (applied / responded /
 * interview). `dueInDays` is an offset from "today" computed at request time,
 * so the demo calendar shows a live mix of overdue, due-today, and upcoming
 * follow-ups no matter when it is visited (plan §7 — the demo never goes
 * stale). `loggedDaysAgo` pre-seeds sent-follow-up log rows.
 */
export const DEMO_FOLLOW_UP_SEEDS: DemoFollowUpSeed[] = [
  // Interview track
  { appNum: 1, dueInDays: 1, loggedDaysAgo: [6] }, // thank-you sent, next nudge tomorrow
  { appNum: 20, dueInDays: -1 }, // overdue — pairing-round thank-you slipped
  { appNum: 26, dueInDays: 3 },
  // Responded track
  { appNum: 7, dueInDays: 0 }, // due today — book the screening call
  { appNum: 14, dueInDays: -3, loggedDaysAgo: [8] }, // overdue despite one nudge
  { appNum: 17, dueInDays: 2 },
  // Applied track
  { appNum: 2, dueInDays: -4, loggedDaysAgo: [11] }, // clearly overdue
  { appNum: 10, dueInDays: 0 }, // due today
  { appNum: 12, dueInDays: 4 },
  { appNum: 22, dueInDays: 5 },
  { appNum: 27, dueInDays: 6 },
  { appNum: 29, dueInDays: 7 },
];

/** Demo cadence config (mirrors the CLI's shape; applied_first drives pins). */
export const DEMO_CADENCE_CONFIG = {
  applied_first: 7,
  applied_subsequent: 7,
  applied_max_followups: 2,
  responded_initial: 1,
  responded_subsequent: 3,
  interview_thankyou: 1,
};
