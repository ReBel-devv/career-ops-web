import { z } from "zod";

/**
 * Candidate profile — the single source of truth for personal data across all
 * modes, stored at `config/profile.yml` in the data repo. The web dashboard
 * surfaces it read-mostly and lets the user edit the simple scalar fields in
 * place (identity, narrative text, compensation, location); the richer lists
 * (target roles, superpowers, proof points) stay read-only for now.
 *
 * On-disk YAML is snake_case (human/CLI-friendly, idiomatic for the data repo);
 * the TS domain here is camelCase. `lib/parsers/profile.ts` maps YAML → domain,
 * and `lib/writers/profile-writer.ts` writes ONE scalar YAML field per call
 * (surgical, comment-preserving) using the snake_case paths in
 * `EDITABLE_PROFILE_FIELDS`.
 *
 * Every field is optional/nullable on purpose: profile.yml is user-authored and
 * may omit sections. The UI renders what exists and hides the rest.
 */

const trimmedString = z.string().transform((s) => s.trim());

export const profileCandidateSchema = z.object({
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  linkedin: z.string().nullable(),
  portfolioUrl: z.string().nullable(),
  github: z.string().nullable(),
  photo: z.string().nullable(),
});
export type ProfileCandidate = z.infer<typeof profileCandidateSchema>;

export const profileArchetypeSchema = z.object({
  name: z.string(),
  level: z.string().nullable(),
  fit: z.string().nullable(),
  note: z.string().nullable(),
});
export type ProfileArchetype = z.infer<typeof profileArchetypeSchema>;

export const profileTargetRolesSchema = z.object({
  primary: z.array(z.string()),
  archetypes: z.array(profileArchetypeSchema),
});
export type ProfileTargetRoles = z.infer<typeof profileTargetRolesSchema>;

export const profileProofPointSchema = z.object({
  name: z.string(),
  url: z.string().nullable(),
  heroMetric: z.string().nullable(),
});
export type ProfileProofPoint = z.infer<typeof profileProofPointSchema>;

export const profileNarrativeSchema = z.object({
  headline: z.string().nullable(),
  exitStory: z.string().nullable(),
  superpowers: z.array(z.string()),
  proofPoints: z.array(profileProofPointSchema),
});
export type ProfileNarrative = z.infer<typeof profileNarrativeSchema>;

export const profileCompensationSchema = z.object({
  targetRange: z.string().nullable(),
  currency: z.string().nullable(),
  minimum: z.string().nullable(),
  locationFlexibility: z.string().nullable(),
});
export type ProfileCompensation = z.infer<typeof profileCompensationSchema>;

export const profileLocationSchema = z.object({
  country: z.string().nullable(),
  city: z.string().nullable(),
  timezone: z.string().nullable(),
  visaStatus: z.string().nullable(),
});
export type ProfileLocation = z.infer<typeof profileLocationSchema>;

export const profileCoverLetterSchema = z.object({
  primaryDomain: z.string().nullable(),
  noticePeriodDays: z.number().nullable(),
});
export type ProfileCoverLetter = z.infer<typeof profileCoverLetterSchema>;

export const profileSchema = z.object({
  candidate: profileCandidateSchema,
  targetRoles: profileTargetRolesSchema,
  narrative: profileNarrativeSchema,
  compensation: profileCompensationSchema,
  location: profileLocationSchema,
  coverLetter: profileCoverLetterSchema,
});
export type Profile = z.infer<typeof profileSchema>;

/* ------------------------------------------------- source documents --- */

export const PROFILE_DOCUMENT_KINDS = [
  "pdf",
  "markdown",
  "text",
  "doc",
  "other",
] as const;
export type ProfileDocumentKind = (typeof PROFILE_DOCUMENT_KINDS)[number];

export const profileDocumentSchema = z.object({
  /** Plain basename inside `sources/` (never a path). */
  name: z.string(),
  /** Lowercased extension without the dot, e.g. `"pdf"`. */
  ext: z.string(),
  kind: z.enum(PROFILE_DOCUMENT_KINDS),
  sizeBytes: z.number(),
  modifiedMs: z.number(),
});
export type ProfileDocument = z.infer<typeof profileDocumentSchema>;

/** Accepted upload extensions (mirrors sources/README.md). */
export const PROFILE_UPLOAD_EXTS = ["pdf", "docx", "doc", "md", "txt"] as const;
export const PROFILE_UPLOAD_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/** Map a lowercase extension to a display kind. */
export function profileDocumentKind(ext: string): ProfileDocumentKind {
  const e = ext.toLowerCase();
  if (e === "pdf") return "pdf";
  if (e === "md" || e === "markdown") return "markdown";
  if (e === "txt") return "text";
  if (e === "doc" || e === "docx") return "doc";
  return "other";
}

/* ------------------------------------------------- profile-feed texts --- */

export const profileWritingSampleSchema = z.object({
  name: z.string(),
  markdown: z.string(),
});
export type ProfileWritingSample = z.infer<typeof profileWritingSampleSchema>;

/** Long-form markdown that feeds the profile (rendered, not edited here). */
export const profileTextsSchema = z.object({
  /** The full CV markdown (`cv.md`), null when absent. */
  cv: z.string().nullable(),
  /** The digest extracted from `sources/` (`article-digest.md`). */
  articleDigest: z.string().nullable(),
  /** Writing voice (`voice-dna.md`). */
  voiceDna: z.string().nullable(),
  writingSamples: z.array(profileWritingSampleSchema),
});
export type ProfileTexts = z.infer<typeof profileTextsSchema>;

/** Full GET /api/profile payload. */
export const profileDataSchema = z.object({
  profile: profileSchema,
  documents: z.array(profileDocumentSchema),
  texts: profileTextsSchema,
});
export type ProfileData = z.infer<typeof profileDataSchema>;

/* ------------------------------------------------- single-field edit --- */

/**
 * The scalar fields editable from the dashboard, keyed by their on-disk YAML
 * path (`parent.child`, snake_case). The writer edits exactly one of these per
 * call, surgically, preserving comments and structure. Rich lists are omitted
 * on purpose (read-only for now).
 */
export const EDITABLE_PROFILE_FIELDS = [
  "candidate.full_name",
  "candidate.email",
  "candidate.phone",
  "candidate.location",
  "candidate.linkedin",
  "candidate.portfolio_url",
  "candidate.github",
  "narrative.headline",
  "narrative.exit_story",
  "compensation.target_range",
  "compensation.currency",
  "compensation.minimum",
  "compensation.location_flexibility",
  "location.country",
  "location.city",
  "location.timezone",
  "location.visa_status",
  "cover_letter.primary_domain",
] as const;
export type EditableProfileField = (typeof EDITABLE_PROFILE_FIELDS)[number];

export const editableProfileFieldSchema = z.enum(EDITABLE_PROFILE_FIELDS);

export const updateProfileFieldInputSchema = z.object({
  field: editableProfileFieldSchema,
  // Single-line scalar values only. Long-form prose (exit_story) is allowed but
  // newlines are not — those fields live on one YAML line.
  value: trimmedString.pipe(
    z.string().max(2000).refine((v) => !/[\r\n]/.test(v), {
      message: "Value must be a single line.",
    }),
  ),
  /** Optimistic concurrency: the value the client last saw (null when unset). */
  expected: z.string().nullable().optional(),
});
export type UpdateProfileFieldInput = z.infer<
  typeof updateProfileFieldInputSchema
>;

export const addProfileDocumentInputSchema = z.object({
  filename: z.string().min(1),
  /** Raw file bytes. */
  bytes: z.instanceof(Uint8Array),
});
export type AddProfileDocumentInput = z.infer<
  typeof addProfileDocumentInputSchema
>;
