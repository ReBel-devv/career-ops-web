/**
 * Notes-cell sanitization, per the tracker's own convention (`cell()` in
 * merge-tracker.mjs): newlines collapse to a single space and `|` becomes
 * ` / ` (every tracker reader splits rows on a raw `|`, so an un-escaped pipe
 * would break the table). Pure and dependency-free so BOTH the server writer
 * (authoritative) and the client notes editor (exact-cell preview) share one
 * implementation — no drift between what the UI previews and what gets written.
 */
export function sanitizeNotes(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s*\|\s*/g, " / ")
    .trim();
}
