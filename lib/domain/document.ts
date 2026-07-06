import { z } from "zod";

/**
 * Generated documents (CV PDFs, cover letters) — `data/pdf-index.tsv` +
 * `output/` filename conventions. Matching heuristics + file streaming route
 * land in M3; the contract is fixed here.
 */

export const documentKindSchema = z.enum(["cv", "cover-letter"]);

export type DocumentKind = z.infer<typeof documentKindSchema>;

export const documentSchema = z.object({
  kind: documentKindSchema,
  /** Application/report number the document belongs to, when known. */
  appNum: z.number().int().nullable(),
  fileName: z.string().min(1),
  /** Path relative to the data repo root, e.g. `output/cv-acme.pdf`. */
  path: z.string().min(1),
});

export type Document = z.infer<typeof documentSchema>;
