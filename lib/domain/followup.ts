import { z } from "zod";

/**
 * `data/follow-ups.md` — a markdown table of logged follow-ups plus pin lines
 * of the form `- next #N YYYY-MM-DD (set YYYY-MM-DD)` (last pin per app wins).
 * Cadence math is NEVER computed here — M4 consumes `followup-cadence.mjs --json`.
 */

export const followUpLogSchema = z.object({
  num: z.number().int().nonnegative(),
  appNum: z.number().int().nonnegative(),
  date: z.string(),
  company: z.string(),
  role: z.string(),
  channel: z.string(),
  contact: z.string(),
  notes: z.string(),
});

export type FollowUpLog = z.infer<typeof followUpLogSchema>;

export const followUpPinSchema = z.object({
  appNum: z.number().int().nonnegative(),
  /** Pinned next follow-up date, YYYY-MM-DD. */
  date: z.string(),
  /** Date the pin was set, YYYY-MM-DD. */
  setDate: z.string(),
});

export type FollowUpPin = z.infer<typeof followUpPinSchema>;

export const followUpDataSchema = z.object({
  logs: z.array(followUpLogSchema),
  /** All pins in file order; consumers apply last-wins per appNum. */
  pins: z.array(followUpPinSchema),
});

export type FollowUpData = z.infer<typeof followUpDataSchema>;
