import { randomUUID } from "node:crypto";
import { renameSync, rmSync, writeFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parseFollowUps } from "@/lib/parsers/follow-ups";
import { sanitizeNotes } from "@/lib/notes";
import {
  acquireFollowUpsLock,
  FollowUpsLockTimeoutError,
  followUpsPathFor,
  type FollowUpsLockOptions,
} from "./followups-lock";

/**
 * Append-only writer for `data/follow-ups.md` — the "log sent" affordance
 * (plan §3 F6). Appends ONE table row recording that a follow-up was sent.
 * NEVER edits existing lines (byte-prefix preserved) and re-parses the file
 * after the write; a parse failure restores the backup (F6 AC).
 *
 * The lock is the SAME one followup-seed.mjs takes (followups-lock.ts), so a
 * concurrent reschedule (via followup-seed) and log-sent can't corrupt the file.
 */

/** Canonical header written when data/follow-ups.md doesn't exist yet —
 * byte-identical to followup-seed.mjs's FOLLOWUPS_HEADER. */
const FOLLOWUPS_HEADER = [
  "# Follow-ups",
  "",
  "| num | appNum | date | company | role | channel | contact | notes |",
  "|---|---|---|---|---|---|---|---|",
].join("\n");

export type FollowUpWriteErrorCode =
  | "INVALID_INPUT"
  | "READ_ONLY"
  | "LOCK_TIMEOUT"
  | "PARSE_FAILED";

export class FollowUpWriteError extends Error {
  constructor(
    readonly code: FollowUpWriteErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "FollowUpWriteError";
  }
}

export interface AppendFollowUpLogInput {
  repoPath: string;
  appNum: number;
  /** Company/role for the row — the caller resolves them from the tracker. */
  company: string;
  role: string;
  /** Log date (YYYY-MM-DD). Defaults to today. */
  date?: string;
  /** Channel used (email / linkedin / phone …). Defaults to "email". */
  channel?: string;
  contact?: string;
  notes?: string;
  lock?: FollowUpsLockOptions;
}

export interface AppendFollowUpLogResult {
  /** The follow-up's own sequential number (max existing + 1). */
  num: number;
  /** The logged date actually written. */
  date: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidCalendarDate(str: string): boolean {
  if (!DATE_RE.test(str)) return false;
  const d = new Date(`${str}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

/** Same-directory temp file + rename — mirrors the CLI's writeFileAtomic. */
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

export async function appendFollowUpLog(
  input: AppendFollowUpLogInput,
): Promise<AppendFollowUpLogResult> {
  const { repoPath, appNum } = input;
  if (!Number.isInteger(appNum) || appNum <= 0) {
    throw new FollowUpWriteError(
      "INVALID_INPUT",
      `Invalid application num: ${appNum}`,
    );
  }
  const date = input.date ?? todayStr();
  if (!isValidCalendarDate(date)) {
    throw new FollowUpWriteError(
      "INVALID_INPUT",
      `Log date must be a real calendar date (YYYY-MM-DD): ${date}`,
    );
  }

  // Every reader splits rows on a raw `|`, so each cell must be pipe/newline
  // safe (same convention as the tracker's notes cell).
  const company = sanitizeNotes(input.company);
  const role = sanitizeNotes(input.role);
  const channel = sanitizeNotes(input.channel ?? "email") || "email";
  const contact = sanitizeNotes(input.contact ?? "");
  const notes = sanitizeNotes(input.notes ?? "");

  const followupsPath = followUpsPathFor(repoPath);

  let lock;
  try {
    lock = await acquireFollowUpsLock(followupsPath, input.lock);
  } catch (err: unknown) {
    if (err instanceof FollowUpsLockTimeoutError) {
      throw new FollowUpWriteError("LOCK_TIMEOUT", err.message);
    }
    throw err;
  }

  try {
    let original: string | null;
    try {
      original = await fs.readFile(followupsPath, "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") original = null;
      else throw err;
    }

    // Next follow-up number = max existing log `num` + 1 (min 1).
    const existing = original ? parseFollowUps(original) : { logs: [], pins: [] };
    const maxNum = existing.logs.reduce((m, l) => Math.max(m, l.num), 0);
    const num = maxNum + 1;

    const row = `| ${num} | ${appNum} | ${date} | ${company} | ${role} | ${channel} | ${contact} | ${notes} |`;

    const next =
      original == null
        ? `${FOLLOWUPS_HEADER}\n${row}\n`
        : original + (original.endsWith("\n") ? "" : "\n") + row + "\n";

    await fs.mkdir(path.dirname(followupsPath), { recursive: true });
    writeFileAtomic(followupsPath, next);

    // Re-parse gate (F6 AC): the file must still parse AND carry the new row.
    let parsedOk = false;
    try {
      const reparsed = parseFollowUps(next);
      parsedOk = reparsed.logs.some(
        (l) => l.num === num && l.appNum === appNum && l.date === date,
      );
    } catch {
      parsedOk = false;
    }
    if (!parsedOk) {
      // Restore: rewrite the original (or remove the file we created).
      if (original == null) {
        await fs.rm(followupsPath, { force: true });
      } else {
        writeFileAtomic(followupsPath, original);
      }
      throw new FollowUpWriteError(
        "PARSE_FAILED",
        "follow-ups.md no longer parses after the append — the file was restored.",
      );
    }

    return { num, date };
  } finally {
    lock.release();
  }
}
