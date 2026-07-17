import { z } from "zod";

/**
 * Message templates — reusable outreach texts (emails, LinkedIn messages, …)
 * stored as hand-editable markdown in the data repo (under
 * `templates/messages/` — the `templates/` root already holds the CV/cover
 * HTML assets):
 *
 *   templates/messages/{slug}.md                        ← current version
 *   templates/messages/history/{slug}/{NNN}-{source}.md ← one file per version
 *
 * Every dashboard save archives a new history file; the current file is a
 * plain markdown document so it stays editable in any editor. Hand edits that
 * bypassed the dashboard are snapshotted into history before the next
 * dashboard save overwrites them — nothing is ever lost.
 */

/** How a version came to exist. */
export const TEMPLATE_SOURCES = [
  /** Saved from the dashboard editor. */
  "manual",
  /** An agent revision the user approved. */
  "agent",
  /** Created from a prompt (AI generation) and approved. */
  "generated",
  /** An older version restored as the new current. */
  "restore",
  /** A hand-edited current file snapshotted before a dashboard save. */
  "snapshot",
] as const;
export const templateSourceSchema = z.enum(TEMPLATE_SOURCES);
export type TemplateSource = z.infer<typeof templateSourceSchema>;

/** One archived version's metadata (body fetched on demand). */
export const templateVersionSchema = z.object({
  /** 1-based, monotonically increasing. */
  version: z.number().int().positive(),
  /** ISO datetime of the save. */
  savedAt: z.string(),
  source: templateSourceSchema,
  /** Optional context — e.g. the prompt that produced an agent revision. */
  note: z.string().nullable(),
});
export type TemplateVersion = z.infer<typeof templateVersionSchema>;

/** The current state of a template. */
export const templateSchema = z.object({
  /** Directory-safe identity — filenames derive from it, title is free text. */
  slug: z.string().min(1),
  title: z.string().min(1),
  /** Free-form kind ("email", "linkedin", …) — drives the type chip. */
  type: z.string().nullable(),
  /** ISO datetime of the last save (frontmatter `saved_at`). */
  savedAt: z.string(),
  source: templateSourceSchema,
  note: z.string().nullable(),
  body: z.string(),
});
export type Template = z.infer<typeof templateSchema>;

/** List-view projection (no full body — excerpt only). */
export const templateSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  type: z.string().nullable(),
  savedAt: z.string(),
  versionCount: z.number().int().nonnegative(),
  excerpt: z.string(),
  /** Full body so the list's copy button works without a second fetch. */
  body: z.string(),
});
export type TemplateSummary = z.infer<typeof templateSummarySchema>;

/** Detail = current template + its version history (newest first). */
export const templateDetailSchema = z.object({
  template: templateSchema,
  versions: z.array(templateVersionSchema),
});
export type TemplateDetail = z.infer<typeof templateDetailSchema>;

/* --------------------------------------------------------- API bodies --- */

const templateTypeField = z
  .string()
  .trim()
  .max(40)
  .transform((s) => (s.length === 0 ? null : s.toLowerCase()))
  .nullable()
  .optional();

/** POST /api/templates — create (blank editor or an approved generation). */
export const createTemplateBodySchema = z.object({
  title: z.string().trim().min(1, "title is required").max(120),
  type: templateTypeField,
  body: z.string().max(50_000),
  source: z.enum(["manual", "generated"]).default("manual"),
  /** e.g. the generation prompt, kept in the version history. */
  note: z.string().trim().max(500).optional(),
});
export type CreateTemplateBody = z.infer<typeof createTemplateBodySchema>;

/** PATCH /api/templates/[slug] — save a new version of an existing template. */
export const saveTemplateBodySchema = z.object({
  title: z.string().trim().min(1, "title is required").max(120),
  type: templateTypeField,
  body: z.string().max(50_000),
  source: z.enum(["manual", "agent", "restore"]).default("manual"),
  note: z.string().trim().max(500).optional(),
  /** Optimistic concurrency: the `savedAt` of the version the client loaded. */
  expectedSavedAt: z.string(),
});
export type SaveTemplateBody = z.infer<typeof saveTemplateBodySchema>;

/** POST /api/templates/assist — propose text, never write (diff-to-approve). */
export const templateAssistBodySchema = z.object({
  prompt: z.string().trim().min(1, "prompt is required").max(4_000),
  /** Present when revising an existing template; absent when generating. */
  current: z
    .object({
      title: z.string(),
      type: z.string().nullable().optional(),
      body: z.string().max(50_000),
    })
    .optional(),
});
export type TemplateAssistBody = z.infer<typeof templateAssistBodySchema>;

/** The assist proposal the client turns into a diff for approval. */
export const templateAssistResultSchema = z.object({
  title: z.string(),
  type: z.string().nullable(),
  body: z.string(),
});
export type TemplateAssistResult = z.infer<typeof templateAssistResultSchema>;

/** Inputs the DataSource mutation methods take (validated at the route). */
export type CreateTemplateInput = CreateTemplateBody;
export type SaveTemplateInput = SaveTemplateBody & { slug: string };
