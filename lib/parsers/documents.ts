import { documentSchema, type Document } from "@/lib/domain";

/**
 * Pure document-matching logic (plan §4.5). The filesystem side (reading
 * `data/pdf-index.tsv`, listing `output/`, resolving the report filename) lives
 * in FsDataSource; this module only decides *which* files belong to a report.
 *
 * Two sources, in order of trust:
 *   1. `data/pdf-index.tsv` — authoritative `report num → CV pdf` mapping,
 *      written by generate-pdf.mjs. Columns: `report, pdf, html, format, date`.
 *   2. `output/` filename convention — cover letters are `{slug}-…-cover.pdf`
 *      and are matched by the report's company slug (fuzzy prefix). CVs missing
 *      from the index fall back to a slug match too.
 *
 * When nothing matches, the caller shows an honest "No document found" (risk 7)
 * — heuristics never invent a file that isn't on disk.
 */

export interface PdfIndexEntry {
  /** Report number, or null for rows that only carry a cover-letter pdf. */
  report: number | null;
  /** `output/…pdf` path as written, or "" when absent. */
  pdf: string;
  html: string;
  format: string;
  date: string;
}

/** Parse `data/pdf-index.tsv` (tab-separated; first line is a `#` comment). */
export function parsePdfIndex(content: string): PdfIndexEntry[] {
  const entries: PdfIndexEntry[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (line.trim() === "" || line.startsWith("#")) continue;
    const cells = line.split("\t");
    const reportRaw = (cells[0] ?? "").trim();
    const report = /^\d+$/.test(reportRaw) ? Number.parseInt(reportRaw, 10) : null;
    entries.push({
      report,
      pdf: (cells[1] ?? "").trim(),
      html: (cells[2] ?? "").trim(),
      format: (cells[3] ?? "").trim(),
      date: (cells[4] ?? "").trim(),
    });
  }
  return entries;
}

/** `001-mistral-ai-2026-07-04.md` → `mistral-ai` (null when it doesn't match). */
export function companySlugFromReportFilename(filename: string): string | null {
  const m = /^\d+-(.+?)-\d{4}-\d{2}-\d{2}\.md$/.exec(filename);
  return m ? m[1] : null;
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

export interface MatchDocumentsInput {
  num: number;
  /** Report filename (basename), used to derive the company slug. */
  reportFilename: string | null;
  indexEntries: PdfIndexEntry[];
  /** Basenames present in `output/` (existence already verified by the caller). */
  outputFiles: string[];
}

/**
 * Resolve the documents for one application. Only returns files that are
 * actually present in `outputFiles`. CV first, then cover letters.
 */
export function matchDocuments({
  num,
  reportFilename,
  indexEntries,
  outputFiles,
}: MatchDocumentsInput): Document[] {
  const present = new Set(outputFiles);
  const slug = reportFilename ? companySlugFromReportFilename(reportFilename) : null;
  const docs: Document[] = [];
  const claimed = new Set<string>();

  const push = (kind: "cv" | "cover-letter", file: string) => {
    if (!present.has(file) || claimed.has(file)) return;
    claimed.add(file);
    docs.push(
      documentSchema.parse({
        kind,
        appNum: kind === "cv" ? num : null,
        fileName: file,
        path: `output/${file}`,
      }),
    );
  };

  // 1. CV from the index (authoritative num → pdf).
  const indexCv = indexEntries.find((e) => e.report === num && e.pdf !== "");
  if (indexCv) push("cv", basename(indexCv.pdf));

  // 2. CV fallback by slug when the index has no row for this num.
  if (docs.length === 0 && slug) {
    const cvFile = outputFiles.find(
      (f) => /^cv-.*\.pdf$/i.test(f) && f.includes(slug),
    );
    if (cvFile) push("cv", cvFile);
  }

  // 3. Cover letters by slug prefix (`{slug}-…-cover.pdf`).
  if (slug) {
    for (const f of outputFiles) {
      if (!/-cover\.pdf$/i.test(f)) continue;
      if (f.startsWith(`${slug}-`)) push("cover-letter", f);
    }
  }

  return docs;
}
