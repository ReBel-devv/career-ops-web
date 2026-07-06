import { z } from "zod";

/**
 * One row of `data/scan-history.tsv` (portal scanner dedup history).
 * Columns: url, first_seen, portal, title, company, status, location.
 */
export const scanRecordSchema = z.object({
  url: z.string().min(1),
  firstSeen: z.string(),
  portal: z.string(),
  title: z.string(),
  company: z.string(),
  status: z.string(),
  location: z.string().default(""),
});

export type ScanRecord = z.infer<typeof scanRecordSchema>;
