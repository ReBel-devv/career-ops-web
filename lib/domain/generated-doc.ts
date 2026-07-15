import { z } from "zod";
import { documentKindSchema } from "./document";

/**
 * A generated application document — a tailored CV or cover letter produced for
 * a specific posting. Aggregated across all applications for the library view
 * (searchable + sortable), it enriches the raw `output/` file with the linked
 * application (company / role / status) and the generation date from
 * `data/pdf-index.tsv`.
 */
export const generatedDocumentSchema = z.object({
  kind: documentKindSchema, // "cv" | "cover-letter"
  /** Plain basename in `output/` (also the /api/files/pdf/[name] key). */
  fileName: z.string().min(1),
  /** Path relative to the data repo, e.g. `output/cv-…-acme.pdf`. */
  path: z.string().min(1),
  /** Linked application/report number, when resolvable. */
  appNum: z.number().int().nullable(),
  company: z.string().nullable(),
  role: z.string().nullable(),
  /** Current pipeline status of the linked application, when known. */
  statusId: z.string().nullable(),
  statusLabel: z.string().nullable(),
  /** Generation date (YYYY-MM-DD) from the pdf index or the filename. */
  generatedDate: z.string().nullable(),
  sizeBytes: z.number(),
  /** Page format from the index (e.g. "a4"), when known. */
  format: z.string().nullable(),
});

export type GeneratedDocument = z.infer<typeof generatedDocumentSchema>;
