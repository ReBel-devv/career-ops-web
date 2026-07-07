import path from "node:path";

/**
 * Path-traversal guard for the local PDF streaming route (plan §4.5, risk 7).
 * Files are served ONLY from `<repo>/output/` and ONLY when the request names a
 * plain `.pdf` basename. Everything else is rejected before any filesystem
 * access. Pure so it is exhaustively unit-testable.
 */

/** A plain PDF basename: alphanumerics, dot, underscore, hyphen; `.pdf` suffix. */
export const PDF_NAME_RE = /^[A-Za-z0-9._-]+\.pdf$/;

/**
 * Resolve `name` inside `outputDir`, or return null if it is not a safe plain
 * `.pdf` basename that stays inside `outputDir`. Rejects any `/`, `\`, `..`,
 * absolute paths, and anything that resolves outside the directory.
 */
export function safePdfPath(outputDir: string, name: string): string | null {
  if (typeof name !== "string" || name === "") return null;
  if (!PDF_NAME_RE.test(name)) return null; // also rejects `/`, `\`, spaces
  if (name.includes("..")) return null;
  const dir = path.resolve(outputDir);
  const resolved = path.resolve(dir, name);
  // Must be a direct child of the output dir (no nesting, no escape).
  if (resolved !== path.join(dir, name)) return null;
  if (!resolved.startsWith(dir + path.sep)) return null;
  return resolved;
}
