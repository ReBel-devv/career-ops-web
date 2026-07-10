import { assignByRole, slugifyCompany, type AppRef } from "@/lib/parsers/documents";

/**
 * Pure interview-prep matching (mirror of the cover-letter heuristic). Files
 * live directly under `interview-prep/` as `{company}-{role}.md`. We match by
 * company slug, then disambiguate a file among several same-company roles by
 * role-token overlap — on a strict tie every tied sibling gets it (never hide a
 * real file). Shared/non-app files are excluded. The filesystem side (reading
 * the directory + file contents) lives in FsDataSource; this decides *which*
 * files belong to an application.
 */

/** Files under `interview-prep/` that are never application-specific. */
const EXCLUDED = new Set(["story-bank.md", "readme.md"]);

/** True for a plain, app-specific `.md` basename we may surface. */
export function isPrepCandidate(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(".md")) return false;
  if (lower.startsWith("_")) return false; // templates / partials
  if (EXCLUDED.has(lower)) return false;
  return true;
}

export interface MatchInterviewPrepInput {
  num: number;
  /** The application (company + role) for `num`. */
  app: { company: string; role: string };
  /** Same-company applications (including this one) for disambiguation. */
  siblings: AppRef[];
  /** Basenames present in `interview-prep/` (existence verified by the caller). */
  prepFiles: string[];
}

/**
 * Return the interview-prep filenames (basenames) that belong to `num`, sorted
 * for stable output. Empty when the company slug is blank or nothing matches.
 */
export function matchInterviewPrep({
  num,
  app,
  siblings,
  prepFiles,
}: MatchInterviewPrepInput): string[] {
  const companySlug = slugifyCompany(app.company);
  if (companySlug === "") return [];

  const sibs = (siblings.length > 0
    ? siblings
    : [{ num, company: app.company, role: app.role }]
  ).filter((s) => slugifyCompany(s.company) === companySlug);
  const pool = sibs.some((s) => s.num === num)
    ? sibs
    : [...sibs, { num, company: app.company, role: app.role }];

  const matched: string[] = [];
  for (const f of prepFiles) {
    if (!isPrepCandidate(f)) continue;
    const lower = f.toLowerCase();
    if (!lower.startsWith(`${companySlug}-`)) continue;
    const restSlug = lower.slice(companySlug.length + 1, -".md".length);
    if (assignByRole(restSlug, pool).has(num)) matched.push(f);
  }
  return matched.sort();
}
