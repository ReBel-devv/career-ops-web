import {
  OUTREACH_STAGES,
  type OutreachRecord,
  type OutreachStage,
} from "@/lib/domain";

/**
 * Pure outreach arrangement logic (no React) — unit-tested in
 * tests/outreach-view.test.ts. Mirrors lib/follow-ups-view.ts: the components
 * stay thin, the derivations live here.
 */

/** 0-based position of a stage in the linear machine. */
export function stageIndex(stage: OutreachStage): number {
  return OUTREACH_STAGES.indexOf(stage);
}

/** Human label for a stage (UI chrome is English). */
export const STAGE_LABELS: Record<OutreachStage, string> = {
  identified: "Identified",
  requested: "Requested",
  accepted: "Accepted",
  messaged: "Messaged",
  replied: "Replied",
};

export const KIND_LABELS: Record<string, string> = {
  recruiter: "Recruiter",
  "hiring-manager": "Hiring manager",
  peer: "Peer",
  founder: "Founder",
};

export interface OutreachCardHint {
  /** Number of contacts tracked for the application. */
  count: number;
  /** The furthest stage reached across the app's contacts. */
  topStage: OutreachStage;
}

/**
 * Per-application card hint (board/table indicator): contact count + the
 * furthest current stage across contacts. Apps without contacts are absent.
 */
export function outreachHints(
  records: OutreachRecord[],
): Map<number, OutreachCardHint> {
  const hints = new Map<number, OutreachCardHint>();
  for (const record of records) {
    if (record.contacts.length === 0) continue;
    let top: OutreachStage = "identified";
    for (const contact of record.contacts) {
      if (stageIndex(contact.stage) > stageIndex(top)) top = contact.stage;
    }
    hints.set(record.appNum, { count: record.contacts.length, topStage: top });
  }
  return hints;
}
