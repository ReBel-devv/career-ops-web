import { z } from "zod";

/**
 * LinkedIn outreach tracker — NEW user-layer data at `data/outreach.yml`
 * (plan §4.6, Decision 2). The file survives `update-system.mjs` and is the
 * future structured target for `contacto` mode.
 *
 * TS domain is camelCase; the on-disk YAML uses snake_case (idiomatic for the
 * data repo, human/CLI-friendly). `outreach-writer.ts` maps between the two so
 * both surfaces stay clean and the mapping is round-trip tested.
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

/** Current schema version written into every `data/outreach.yml`. */
export const OUTREACH_SCHEMA_VERSION = 1;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const outreachStageSchema = z.enum(OUTREACH_STAGES);
export const outreachContactKindSchema = z.enum(OUTREACH_CONTACT_KINDS);

/** A per-stage date map: only stages actually reached carry a date.
 * (zod v4: `z.record` with an enum key schema is exhaustive — `partialRecord`
 * gives the Partial<Record<…>> semantics we want.) */
export const outreachStageDatesSchema = z.partialRecord(
  outreachStageSchema,
  isoDate,
);
export type OutreachStageDates = Partial<Record<OutreachStage, string>>;

export const outreachContactSchema = z.object({
  /** Stable id used to address the contact in edit/delete calls. */
  id: z.string().min(1),
  kind: outreachContactKindSchema,
  name: z.string().min(1),
  /** LinkedIn (or other) profile URL. */
  linkedin: z.string().optional(),
  /** The contact's role at the company (e.g. "Engineering Manager"). */
  companyRole: z.string().optional(),
  /** Current stage in the machine identified → … → replied. */
  stage: outreachStageSchema,
  /** Date (YYYY-MM-DD) each stage was reached. */
  stageDates: outreachStageDatesSchema.default({}),
  notes: z.string().optional(),
});
export type OutreachContact = z.infer<typeof outreachContactSchema>;

export interface OutreachRecord {
  /** Tracker application number the contacts belong to. */
  appNum: number;
  contacts: OutreachContact[];
}

export const outreachRecordSchema: z.ZodType<OutreachRecord> = z.object({
  appNum: z.number().int().positive(),
  contacts: z.array(outreachContactSchema),
});

/** The whole `data/outreach.yml` document (camelCase, in-memory form). */
export const outreachDocSchema = z.object({
  version: z.number().int().positive(),
  /** Keyed by tracker application number (as a string). */
  applications: z.record(z.string(), z.array(outreachContactSchema)),
});
export type OutreachDoc = z.infer<typeof outreachDocSchema>;

/* ----------------------------------------------------------- API inputs --- */

/**
 * POST /api/outreach/[num] — add a contact. `stage` defaults to `identified`;
 * `date` stamps that initial stage (defaults to today).
 */
export const addOutreachContactBodySchema = z.object({
  kind: outreachContactKindSchema,
  name: z.string().min(1).max(200),
  linkedin: z.string().max(1000).optional(),
  companyRole: z.string().max(200).optional(),
  stage: outreachStageSchema.optional(),
  date: isoDate.optional(),
  notes: z.string().max(2000).optional(),
});
export type AddOutreachContactBody = z.infer<typeof addOutreachContactBodySchema>;

/**
 * PATCH /api/outreach/[num]/[contactId] — edit a contact and/or set its stage.
 * When `stage` is present, it becomes the current stage and `stageDates[stage]`
 * is stamped with `date` (defaults to today). Stage moves are unrestricted:
 * forward, skipping, or regressing are all allowed (Decision 5 spirit — no
 * illegal-move blocking). Nullable text fields clear the value when set to null.
 */
export const updateOutreachContactBodySchema = z
  .object({
    kind: outreachContactKindSchema.optional(),
    name: z.string().min(1).max(200).optional(),
    linkedin: z.string().max(1000).nullable().optional(),
    companyRole: z.string().max(200).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    stage: outreachStageSchema.optional(),
    date: isoDate.optional(),
  })
  .refine(
    (b) =>
      b.kind !== undefined ||
      b.name !== undefined ||
      b.linkedin !== undefined ||
      b.companyRole !== undefined ||
      b.notes !== undefined ||
      b.stage !== undefined,
    { message: "Provide at least one field to update." },
  );
export type UpdateOutreachContactBody = z.infer<
  typeof updateOutreachContactBodySchema
>;

export interface AddOutreachContactInput extends AddOutreachContactBody {
  appNum: number;
}

export interface UpdateOutreachContactInput extends UpdateOutreachContactBody {
  appNum: number;
  contactId: string;
}

export interface DeleteOutreachContactInput {
  appNum: number;
  contactId: string;
}

/** Result of an outreach mutation — the app's full contact list + the touched one. */
export interface OutreachMutationResult {
  appNum: number;
  contacts: OutreachContact[];
  /** The added/updated contact (absent on delete). */
  contact?: OutreachContact;
}
