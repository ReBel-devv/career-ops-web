import { z } from "zod";

/**
 * Interview-prep files — company-specific markdown notes the career-ops
 * `interview` modes write to `interview-prep/{company}-{role}.md`. They are
 * matched to an application by company slug (+ role disambiguation) and their
 * markdown is rendered read-only in the detail view. Non-app-specific files
 * (`story-bank.md`, `README.md`, `_*`) are never surfaced here.
 */
export const interviewPrepFileSchema = z.object({
  fileName: z.string().min(1),
  markdown: z.string(),
});

export type InterviewPrepFile = z.infer<typeof interviewPrepFileSchema>;
