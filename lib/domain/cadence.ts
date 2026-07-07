import { z } from "zod";

/**
 * `followup-cadence.mjs --json` output (plan §4.3). Cadence math is NEVER
 * recomputed in the web app — the script is the single source of truth. We
 * only zod-validate its JSON at the boundary and render it.
 *
 * Schemas are intentionally loose (unknown keys preserved) so a future field in
 * the script doesn't break the boundary — the dashboard reads what it needs.
 */

export const followUpUrgencySchema = z.enum([
  "urgent",
  "overdue",
  "waiting",
  "cold",
]);
export type FollowUpUrgency = z.infer<typeof followUpUrgencySchema>;

export const cadenceContactSchema = z.looseObject({
  email: z.string(),
  name: z.string().nullable().optional(),
});

export const cadenceEntrySchema = z.looseObject({
  num: z.number().int(),
  date: z.string(),
  appliedDate: z.string(),
  company: z.string(),
  role: z.string(),
  status: z.string(),
  score: z.string(),
  notes: z.string().optional().default(""),
  reportPath: z.string().nullable().optional(),
  contacts: z.array(cadenceContactSchema).default([]),
  daysSinceApplication: z.number().int(),
  daysSinceLastFollowup: z.number().int().nullable(),
  followupCount: z.number().int(),
  urgency: followUpUrgencySchema,
  nextFollowupDate: z.string().nullable(),
  nextOverride: z.string().nullable().optional(),
  daysUntilNext: z.number().int().nullable(),
});
export type CadenceEntry = z.infer<typeof cadenceEntrySchema>;

export const cadenceMetadataSchema = z.looseObject({
  analysisDate: z.string(),
  totalTracked: z.number().int(),
  actionable: z.number().int(),
  overdue: z.number().int(),
  urgent: z.number().int(),
  cold: z.number().int(),
  waiting: z.number().int(),
});
export type CadenceMetadata = z.infer<typeof cadenceMetadataSchema>;

export const cadenceConfigSchema = z.looseObject({
  applied_first: z.number().int(),
  applied_subsequent: z.number().int().optional(),
  applied_max_followups: z.number().int().optional(),
  responded_initial: z.number().int().optional(),
  responded_subsequent: z.number().int().optional(),
  interview_thankyou: z.number().int().optional(),
});
export type CadenceConfig = z.infer<typeof cadenceConfigSchema>;

/** The successful `followup-cadence.mjs --json` payload. */
export const followUpCadenceSchema = z.object({
  metadata: cadenceMetadataSchema,
  entries: z.array(cadenceEntrySchema),
  cadenceConfig: cadenceConfigSchema,
});
export type FollowUpCadence = z.infer<typeof followUpCadenceSchema>;

/** Empty-tracker sentinel returned when the script reports `{ error }`. */
export const EMPTY_CADENCE: FollowUpCadence = {
  metadata: {
    analysisDate: new Date().toISOString().slice(0, 10),
    totalTracked: 0,
    actionable: 0,
    overdue: 0,
    urgent: 0,
    cold: 0,
    waiting: 0,
  },
  entries: [],
  cadenceConfig: {
    applied_first: 7,
    applied_subsequent: 7,
    applied_max_followups: 2,
    responded_initial: 1,
    responded_subsequent: 3,
    interview_thankyou: 1,
  },
};

/**
 * Result of a follow-up write (reschedule / log-sent). Mirrors the
 * TrackerWriteError-style outcome so the API route can toast it.
 */
export interface FollowUpWriteResult {
  ok: true;
  /** The pin's next-follow-up date (reschedule) or the logged row date (log). */
  date: string;
  kind: "reschedule" | "log";
  /** The logged follow-up's own number (log only). */
  num?: number;
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

/** POST /api/follow-ups/[num]/reschedule body — the desired next-follow-up date. */
export const rescheduleFollowUpBodySchema = z.object({
  date: isoDate,
});
export type RescheduleFollowUpBody = z.infer<typeof rescheduleFollowUpBodySchema>;

/** POST /api/follow-ups/[num]/log body — records a follow-up that was sent. */
export const logFollowUpBodySchema = z.object({
  date: isoDate.optional(),
  channel: z.string().max(200).optional(),
  contact: z.string().max(400).optional(),
  notes: z.string().max(2000).optional(),
});
export type LogFollowUpBody = z.infer<typeof logFollowUpBodySchema>;

export interface RescheduleFollowUpInput {
  num: number;
  date: string;
}

export interface LogFollowUpInput {
  num: number;
  date?: string;
  channel?: string;
  contact?: string;
  notes?: string;
}
