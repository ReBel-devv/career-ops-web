/**
 * LinkedIn outreach tracker — NEW user-layer data at `data/outreach.yml`
 * (plan §4.6, Decision 2). Types only for M0; the zod schema + locked
 * read-modify-write writer land in M6.
 */

export const OUTREACH_STAGES = [
  "identified",
  "requested",
  "accepted",
  "messaged",
  "replied",
] as const;

export type OutreachStage = (typeof OUTREACH_STAGES)[number];

export const OUTREACH_CONTACT_KINDS = [
  "recruiter",
  "hiring-manager",
  "peer",
  "founder",
] as const;

export type OutreachContactKind = (typeof OUTREACH_CONTACT_KINDS)[number];

export interface OutreachContact {
  name: string;
  kind: OutreachContactKind;
  /** Current stage in the linear machine identified → … → replied. */
  stage: OutreachStage;
  /** Date (YYYY-MM-DD) each stage was reached. */
  stageDates: Partial<Record<OutreachStage, string>>;
  profileUrl?: string;
  notes?: string;
}

export interface OutreachRecord {
  /** Tracker application number the contacts belong to. */
  appNum: number;
  contacts: OutreachContact[];
}
