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

/** `001-nimbus-labs-2026-06-02.md` → `nimbus-labs` (null when it doesn't match). */
export function companySlugFromReportFilename(filename: string): string | null {
  const m = /^\d+-(.+?)-\d{4}-\d{2}-\d{2}\.md$/.exec(filename);
  return m ? m[1] : null;
}

/**
 * Slugify a company name the exact way `generate-cover-letter.mjs` names its
 * output files (`company.toLowerCase().replace(/[^a-z0-9]+/g,'-')`), plus a
 * trim of edge hyphens. This is the authoritative company slug shared by cover
 * letters AND interview-prep files, so both matchers can key on it.
 */
export function slugifyCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Role → set of slug tokens (same slugification), for fuzzy role matching. */
function roleTokens(role: string): Set<string> {
  return new Set(slugifyCompany(role).split("-").filter((t) => t.length > 0));
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n;
}

/**
 * Decide which same-company application(s) a company-slug-prefixed file belongs
 * to. `restSlug` is the filename portion after `{companySlug}-` and before the
 * trailing marker (e.g. `design-engineer` for `quayside-design-engineer-cover`).
 * The winner is the sibling whose role tokens overlap `restSlug` the most; on a
 * strict tie every tied sibling wins (never hide a real file). Returns the set
 * of application numbers the file should surface under.
 */
export function assignByRole(
  restSlug: string,
  siblings: AppRef[],
): Set<number> {
  const restTokens = new Set(restSlug.split("-").filter((t) => t.length > 0));
  let best = -1;
  const scored = siblings.map((s) => {
    const score = tokenOverlap(roleTokens(s.role), restTokens);
    if (score > best) best = score;
    return { num: s.num, score };
  });
  return new Set(scored.filter((s) => s.score === best).map((s) => s.num));
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

/** Minimal application shape needed to key documents by company + role. */
export interface AppRef {
  num: number;
  company: string;
  role: string;
}

export interface MatchDocumentsInput {
  num: number;
  /** Report filename (basename), used to derive the company slug. */
  reportFilename: string | null;
  indexEntries: PdfIndexEntry[];
  /** Basenames present in `output/` (existence already verified by the caller). */
  outputFiles: string[];
  /**
   * The application (company + role) for `num`. When provided, cover letters
   * are matched by the authoritative **company slug** (the field cover files
   * are actually named after) instead of the report's company+role slug, which
   * is often longer/different and made covers silently disappear. Omit to keep
   * the legacy report-slug behavior.
   */
  app?: { company: string; role: string };
  /**
   * All applications sharing this app's company (including it), used to
   * disambiguate a cover among several same-company roles. Defaults to just the
   * current app when omitted.
   */
  siblings?: AppRef[];
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
  app,
  siblings,
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

  // 3. Cover letters.
  if (app) {
    // Preferred path: match by the authoritative company slug (what cover files
    // are named after), then disambiguate among same-company roles by role
    // tokens. Fixes covers that never matched because the report slug
    // (company+role) was longer/different than the file's company prefix.
    const companySlug = slugifyCompany(app.company);
    const sibs = (siblings && siblings.length > 0
      ? siblings
      : [{ num, company: app.company, role: app.role }]
    ).filter((s) => slugifyCompany(s.company) === companySlug);
    const pool = sibs.some((s) => s.num === num)
      ? sibs
      : [...sibs, { num, company: app.company, role: app.role }];

    if (companySlug !== "") {
      for (const f of outputFiles) {
        const lower = f.toLowerCase();
        if (!lower.endsWith("-cover.pdf")) continue;
        if (!lower.startsWith(`${companySlug}-`)) continue;
        const restSlug = lower.slice(companySlug.length + 1, -"-cover.pdf".length);
        if (assignByRole(restSlug, pool).has(num)) push("cover-letter", f);
      }
    }
  } else if (slug) {
    // Legacy path (no app context): report-slug prefix match.
    for (const f of outputFiles) {
      if (!/-cover\.pdf$/i.test(f)) continue;
      if (f.startsWith(`${slug}-`)) push("cover-letter", f);
    }
  }

  return docs;
}
