import { z } from "zod";

/**
 * `data/pipeline.md` — inbox of pending job URLs plus a processed log.
 * Read-only surface (plan: Discovery, zero write affordances). Parser
 * completes in M5.
 */

export const pipelineItemKindSchema = z.enum([
  "pending", // `- [ ] url | meta…`
  "done", // `- [x] #NNN | url | company | role | score | PDF`
  "dup", // `- [dup] …`
  "skip", // `- [skip] …`
  "screened", // `- [screened] batch-screen summary line`
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
  /** Full original line — the parser must never lose information. */
  raw: z.string(),
});

export type PipelineItem = z.infer<typeof pipelineItemSchema>;
