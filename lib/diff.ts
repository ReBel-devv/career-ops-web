/**
 * Minimal line diff (LCS) for the template approval flow — no dependency,
 * unit-tested in tests/diff.test.ts. Output is a flat list of ops in display
 * order; the UI renders removed lines red-tinted and added lines green-tinted
 * (state colors — exactly what red/green are reserved for).
 */

export interface DiffLine {
  kind: "same" | "removed" | "added";
  text: string;
}

/** Longest-common-subsequence table over the two line arrays. */
function lcsTable(a: string[], b: string[]): Int32Array {
  const width = b.length + 1;
  const table = new Int32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  return table;
}

/** Line-level diff from `before` to `after` (removed before added on change). */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  // Fast path — identical documents produce a plain "same" listing.
  if (before === after) return a.map((text) => ({ kind: "same", text }));

  const width = b.length + 1;
  const table = lcsTable(a, b);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      out.push({ kind: "removed", text: a[i] });
      i += 1;
    } else {
      out.push({ kind: "added", text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) {
    out.push({ kind: "removed", text: a[i] });
    i += 1;
  }
  while (j < b.length) {
    out.push({ kind: "added", text: b[j] });
    j += 1;
  }
  return out;
}

/** True when the diff contains at least one change. */
export function hasChanges(diff: ReadonlyArray<DiffLine>): boolean {
  return diff.some((line) => line.kind !== "same");
}
