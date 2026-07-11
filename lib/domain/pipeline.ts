import { z } from "zod";

/**
 * `data/pipeline.md` — inbox of pending job URLs plus a processed log.
 * Read surface (Discovery, plan §4.4). The dashboard can also APPEND a manual
 * `[!]` offer (an URL whose JD can't be auto-fetched — LinkedIn, Welcome to the
 * Jungle, …) whose pasted description is saved to `jds/` and referenced with a
 * `local:` cell; the CLI `pipeline` mode evaluates it from that local file.
 */

export const pipelineItemKindSchema = z.enum([
  "pending", // `- [ ] url | meta…`
  "done", // `- [x] #NNN | url | company | role | score | PDF`
  "dup", // `- [dup] …`
  "skip", // `- [skip] …`
  "screened", // `- [screened] batch-screen summary line`
  "manual", // `- [!] url | … | local:jds/…` — added by hand, JD not auto-fetchable
]);

export type PipelineItemKind = z.infer<typeof pipelineItemKindSchema>;

export const pipelineItemSchema = z.object({
  section: z.enum(["pending", "processed"]),
  kind: pipelineItemKindSchema,
  url: z.string().nullable(),
  company: z.string().nullable(),
  role: z.string().nullable(),
  /** Report number for processed `[x]` items. */
  reportNum: z.number().int().nullable(),
  scoreRaw: z.string().nullable(),
  /** Local JD file reference (`local:jds/…`) carried by manual `[!]` items. */
  localJd: z.string().nullable().default(null),
  /** Full original line — the parser must never lose information. */
  raw: z.string(),
});

export type PipelineItem = z.infer<typeof pipelineItemSchema>;

/**
 * Input for adding a manual offer from the dashboard: the original posting URL
 * (kept for reference/liveness) and the pasted job description (saved to `jds/`).
 */
export const addManualOfferInputSchema = z.object({
  url: z
    .string()
    .trim()
    .url("Enter a valid URL")
    .refine((u) => /^https?:\/\//i.test(u), "URL must start with http:// or https://"),
  jd: z.string().trim().min(1, "Paste the job description"),
});

export type AddManualOfferInput = z.infer<typeof addManualOfferInputSchema>;
