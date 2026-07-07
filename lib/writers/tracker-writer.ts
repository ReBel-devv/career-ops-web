import { randomUUID } from "node:crypto";
import { renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildStatusResolver,
  type CanonicalState,
} from "@/lib/domain";
import { readStatesFile } from "@/lib/data/states-file";
import {
  loadTrackerParse,
  loadTrackerUtils,
  type TrackerRow,
} from "@/lib/data/tracker-module";
import { runVerifyPipeline } from "@/lib/scripts";
import {
  acquireTrackerLock,
  TrackerLockTimeoutError,
  type TrackerLockOptions,
} from "./tracker-lock";

/**
 * Surgical writer for `data/applications.md` — plan §4.1.
 *
 * Mutation surface: exactly ONE cell (Status or Notes) of exactly ONE
 * existing row. Never adds or deletes rows; every other byte of the file is
 * preserved. Protocol per write:
 *
 *  1. Validate input (canonical status label per states.yml; notes
 *     sanitized pipe/newline-safe, matching merge-tracker.mjs's `cell()`).
 *  2. Acquire the SAME lock-dir merge-tracker.mjs uses (tracker-lock.ts).
 *  3. Re-read the tracker inside the lock; locate the row by `num`; verify
 *     company+role still match what the client saw (409 on mismatch).
 *  4. Rebuild only the target row with the data repo's own `rebuildRow`.
 *  5. Pre-write backup (os tmpdir) → atomic write (same-dir temp + rename).
 *  6. Post-write gate: `node verify-pipeline.mjs`; on non-zero exit restore
 *     the original content and fail with the verify output.
 */

export type TrackerWriteErrorCode =
  | "INVALID_INPUT"
  | "INVALID_STATUS"
  | "NOT_FOUND"
  | "STALE_ROW"
  | "LOCK_TIMEOUT"
  | "VERIFY_FAILED"
  | "READ_ONLY";

export class TrackerWriteError extends Error {
  constructor(
    readonly code: TrackerWriteErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "TrackerWriteError";
  }
}

export interface TrackerWriteInput {
  repoPath: string;
  num: number;
  /** Optimistic concurrency: the row as the client last saw it. */
  expected: { company: string; role: string };
  /** New Status cell — canonical label or id from states.yml. */
  status?: string;
  /** New Notes cell — sanitized pipe/newline-safe before writing. */
  notes?: string;
  lock?: TrackerLockOptions;
}

export interface TrackerWriteResult {
  /** The mutated row, re-parsed from the line actually written. */
  row: TrackerRow;
  /** Canonical state id of the Status cell before the write (null = unresolvable). */
  previousStatusId: string | null;
  /** Canonical state id after the write (null when only notes changed). */
  newStatusId: string | null;
  /** True when a status write transitioned the row INTO Applied. */
  transitionedToApplied: boolean;
  /** True when the notes were altered by sanitization. */
  notesSanitized: boolean;
  states: CanonicalState[];
}

const DATE_IN_STATUS_RE = /\d{4}-\d{2}-\d{2}/;

/**
 * Neutralize characters that would corrupt the markdown table — the exact
 * convention of `cell()` in merge-tracker.mjs: newlines collapse to a space,
 * literal pipes become " / " (backslash-escaping would still split on the
 * inner pipe because every reader uses a raw `line.split('|')`).
 */
export function sanitizeNotes(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s*\|\s*/g, " / ")
    .trim();
}

/**
 * Strict write-side status validation. Reads are alias-tolerant, but writes
 * are write-canonical: the input must name a canonical state by its exact
 * label or id (case-insensitive) and the CANONICAL LABEL is what gets
 * written. Bold markers, dates, aliases, and any extra text are rejected —
 * the same properties verify-pipeline enforces after the fact.
 */
export function resolveWritableStatus(
  input: string,
  states: readonly CanonicalState[],
): CanonicalState {
  const raw = input.trim();
  if (raw.includes("**")) {
    throw new TrackerWriteError(
      "INVALID_STATUS",
      `Status must not contain markdown bold: "${input}"`,
    );
  }
  if (DATE_IN_STATUS_RE.test(raw)) {
    throw new TrackerWriteError(
      "INVALID_STATUS",
      `Status must not contain a date (dates go in the date column): "${input}"`,
    );
  }
  const key = raw.toLowerCase();
  const state = states.find(
    (s) => s.label.toLowerCase() === key || s.id.toLowerCase() === key,
  );
  if (!state) {
    throw new TrackerWriteError(
      "INVALID_STATUS",
      `Status must be a canonical label from states.yml (${states
        .map((s) => s.label)
        .join(", ")}): "${input}"`,
    );
  }
  return state;
}

/** Same-directory temp file + rename, mirroring writeFileAtomic in the CLI scripts. */
function writeFileAtomic(filePath: string, content: string): void {
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`,
  );
  try {
    writeFileSync(tmpPath, content);
    renameSync(tmpPath, filePath);
  } catch (err) {
    rmSync(tmpPath, { force: true });
    throw err;
  }
}

export async function writeTrackerCell(
  input: TrackerWriteInput,
): Promise<TrackerWriteResult> {
  const { repoPath, num, expected } = input;
  if (input.status === undefined && input.notes === undefined) {
    throw new TrackerWriteError(
      "INVALID_INPUT",
      "Nothing to write: provide status or notes.",
    );
  }
  if (input.status !== undefined && input.notes !== undefined) {
    throw new TrackerWriteError(
      "INVALID_INPUT",
      "Write one cell at a time: provide status OR notes, not both.",
    );
  }
  if (!Number.isInteger(num) || num <= 0) {
    throw new TrackerWriteError("INVALID_INPUT", `Invalid application num: ${num}`);
  }

  const [trackerParse, trackerUtils, states] = await Promise.all([
    loadTrackerParse(repoPath),
    loadTrackerUtils(repoPath),
    readStatesFile(repoPath),
  ]);

  // Validate BEFORE taking the lock — rejects never contend.
  const newState =
    input.status !== undefined
      ? resolveWritableStatus(input.status, states)
      : null;
  const cleanNotes =
    input.notes !== undefined ? sanitizeNotes(input.notes) : null;
  const notesSanitized = input.notes !== undefined && cleanNotes !== input.notes;

  const trackerPath = path.join(repoPath, "data", "applications.md");

  let lock;
  try {
    lock = await acquireTrackerLock(trackerPath, input.lock);
  } catch (err: unknown) {
    if (err instanceof TrackerLockTimeoutError) {
      throw new TrackerWriteError("LOCK_TIMEOUT", err.message);
    }
    throw err;
  }

  try {
    // Re-read inside the lock — the client's snapshot may be stale.
    const original = await fs.readFile(trackerPath, "utf8");
    const lines = original.split("\n");
    const colmap = trackerParse.resolveColumns(lines);

    const candidates: { index: number; row: TrackerRow }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const row = trackerParse.parseTrackerRow(lines[i], colmap);
      if (row && row.num === num) candidates.push({ index: i, row });
    }
    if (candidates.length === 0) {
      throw new TrackerWriteError(
        "NOT_FOUND",
        `Application #${num} not found in the tracker.`,
      );
    }
    const target = candidates.find(
      ({ row }) => row.company === expected.company && row.role === expected.role,
    );
    if (!target) {
      const found = candidates[0].row;
      throw new TrackerWriteError(
        "STALE_ROW",
        `Row #${num} changed since it was loaded (expected "${expected.company} — ${expected.role}", found "${found.company} — ${found.role}"). Reload and retry.`,
      );
    }

    const resolveStatus = buildStatusResolver(states);
    const previousStatusId = resolveStatus(target.row.status)?.id ?? null;

    // Mutate ONLY the target cell, rebuild the row with the repo's own helper.
    const parts = lines[target.index].split("|").map((s) => s.trim());
    if (newState) {
      parts[colmap.status] = newState.label;
    } else if (cleanNotes !== null) {
      if (colmap.notes == null) {
        throw new TrackerWriteError(
          "INVALID_INPUT",
          "This tracker layout has no Notes column.",
        );
      }
      parts[colmap.notes] = cleanNotes;
    }
    const newLine = trackerUtils.rebuildRow(parts);

    const updatedRow = trackerParse.parseTrackerRow(newLine, colmap);
    if (!updatedRow || updatedRow.num !== num) {
      throw new TrackerWriteError(
        "INVALID_INPUT",
        "Rebuilt row no longer parses as a tracker row — refusing to write.",
      );
    }

    if (newLine !== lines[target.index]) {
      // Pre-write backup outside the data repo (crash safety; the in-memory
      // `original` drives the verify-gate restore).
      const backupPath = path.join(
        tmpdir(),
        `career-ops-web-tracker-backup-${Date.now()}-${randomUUID()}.md`,
      );
      writeFileSync(backupPath, original);

      const updated = [...lines];
      updated[target.index] = newLine;
      writeFileAtomic(trackerPath, updated.join("\n"));

      // Post-write gate, still under the lock so restore-on-failure is atomic
      // with respect to other writers.
      const verify = await runVerifyPipeline(repoPath);
      if (!verify.ok) {
        writeFileAtomic(trackerPath, original);
        throw new TrackerWriteError(
          "VERIFY_FAILED",
          `verify-pipeline.mjs failed after the write — the tracker was restored (backup kept at ${backupPath}).`,
          verify.output,
        );
      }
      try {
        unlinkSync(backupPath);
      } catch {
        // Backup cleanup is best-effort.
      }
    }

    const newStatusId = newState?.id ?? null;
    return {
      row: updatedRow,
      previousStatusId,
      newStatusId,
      transitionedToApplied:
        newStatusId === "applied" && previousStatusId !== "applied",
      notesSanitized,
      states,
    };
  } finally {
    lock.release();
  }
}
