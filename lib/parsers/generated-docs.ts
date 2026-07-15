import type { GeneratedDocument } from "@/lib/domain";
import { slugifyCompany, type PdfIndexEntry } from "./documents";

/**
 * Pure aggregation of generated CVs + cover letters across all applications.
 * The filesystem side (reading pdf-index.tsv, listing output/, loading apps)
 * lives in FsDataSource; this module only decides, for each `output/*.pdf`,
 * what kind it is and which application it belongs to.
 *
 * Resolution order (most trusted first):
 *   1. `data/pdf-index.tsv` — a CV row carries the report number → the app.
 *   2. filename ↔ company-slug match against the tracker (covers, and CVs
 *      missing from the index). Longest matching slug wins.
 * When nothing resolves, the document still shows with a company parsed from
 * its filename — the library never hides a file that's on disk.
 */

export interface OutputFile {
  /** Basename in `output/`. */
  name: string;
  sizeBytes: number;
  mtimeMs: number;
}

export interface AppLite {
  num: number;
  company: string;
  role: string;
  statusId: string | null;
  statusLabel: string | null;
}

const DATE_RE = /(\d{4}-\d{2}-\d{2})/;

function extractDate(name: string): string | null {
  const m = DATE_RE.exec(name);
  return m ? m[1] : null;
}

/** `dhl-ecommerce` → `Dhl Ecommerce` (last-resort company label). */
function titleizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function basename(pathOrName: string): string {
  const parts = pathOrName.split("/");
  return parts[parts.length - 1] ?? pathOrName;
}

function isCover(name: string): boolean {
  return /-cover\.pdf$/i.test(name);
}

/** Strip the `cv-…-` prefix and trailing date, leaving the company-slug tail. */
function cvCompanyTail(name: string): string {
  return name
    .replace(/\.pdf$/i, "")
    .replace(/-\d{4}-\d{2}-\d{2}$/, "");
}

export function buildGeneratedDocuments(input: {
  indexEntries: PdfIndexEntry[];
  outputFiles: OutputFile[];
  apps: AppLite[];
}): GeneratedDocument[] {
  const { indexEntries, outputFiles, apps } = input;

  const appByNum = new Map<number, AppLite>();
  for (const app of apps) appByNum.set(app.num, app);

  // Company slugs, longest first, for greedy prefix/suffix matching.
  const appSlugs = apps
    .map((app) => ({ app, slug: slugifyCompany(app.company) }))
    .filter((e) => e.slug.length > 0)
    .sort((a, b) => b.slug.length - a.slug.length);

  const sizeByName = new Map<string, OutputFile>();
  for (const f of outputFiles) sizeByName.set(f.name, f);

  // Index rows keyed by pdf basename (for report/date/format lookup).
  const indexByName = new Map<string, PdfIndexEntry>();
  for (const e of indexEntries) {
    if (e.pdf) indexByName.set(basename(e.pdf), e);
  }

  // The universe of PDFs = every .pdf in output/ (index rows may reference a
  // file that was cleaned up; a file may exist without an index row).
  const pdfNames = outputFiles
    .map((f) => f.name)
    .filter((n) => n.toLowerCase().endsWith(".pdf"));

  const resolveByCover = (name: string): AppLite | null => {
    const base = name.replace(/-cover\.pdf$/i, "");
    for (const { app, slug } of appSlugs) {
      if (base === slug || base.startsWith(`${slug}-`)) return app;
    }
    return null;
  };

  const resolveByCv = (name: string): AppLite | null => {
    const tail = cvCompanyTail(name);
    for (const { app, slug } of appSlugs) {
      if (tail === slug || tail.endsWith(`-${slug}`)) return app;
    }
    return null;
  };

  const docs: GeneratedDocument[] = [];
  for (const name of pdfNames) {
    const cover = isCover(name);
    const entry = indexByName.get(name) ?? null;

    let app: AppLite | null = null;
    if (entry?.report != null) app = appByNum.get(entry.report) ?? null;
    if (!app) app = cover ? resolveByCover(name) : resolveByCv(name);

    // Company fallback parsed from the filename slug.
    let companyFallback: string | null = null;
    if (!app) {
      const slug = cover
        ? name.replace(/-cover\.pdf$/i, "").split("-").slice(0, 2).join("-")
        : cvCompanyTail(name).replace(/^cv-/, "");
      companyFallback = slug ? titleizeSlug(slug) : null;
    }

    const file = sizeByName.get(name);
    docs.push({
      kind: cover ? "cover-letter" : "cv",
      fileName: name,
      path: `output/${name}`,
      appNum: app?.num ?? null,
      company: app?.company ?? companyFallback,
      role: app?.role ?? null,
      statusId: app?.statusId ?? null,
      statusLabel: app?.statusLabel ?? null,
      generatedDate: entry?.date || extractDate(name) || null,
      sizeBytes: file?.sizeBytes ?? 0,
      format: entry?.format || null,
    });
  }

  // Newest first by default (undated sinks to the bottom, then by company).
  return docs.sort((a, b) => {
    const da = a.generatedDate ?? "";
    const db = b.generatedDate ?? "";
    if (da !== db) return db.localeCompare(da);
    return (a.company ?? "").localeCompare(b.company ?? "");
  });
}
