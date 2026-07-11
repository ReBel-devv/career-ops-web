import { randomUUID } from "node:crypto";
import { renameSync, rmSync, writeFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  addManualOfferInputSchema,
  type AddManualOfferInput,
  type PipelineItem,
} from "@/lib/domain";
import { parsePipeline } from "@/lib/parsers/pipeline";
import {
  acquirePipelineLock,
  PipelineLockTimeoutError,
  pipelinePathFor,
  type PipelineLockOptions,
} from "./pipeline-lock";

/**
 * Append-only writer for `data/pipeline.md` — adds a MANUAL `[!]` offer whose
 * JD can't be auto-fetched (LinkedIn, Welcome to the Jungle, …). Per add, under
 * the pipeline lock:
 *
 *  1. Save the pasted JD to `jds/{NNN}-{slug}.md` (NNN = next free jds number,
 *     slug derived from the URL) — atomic temp+rename.
 *  2. Insert a `- [!] {url} | local:jds/{NNN}-{slug}.md | note: …` line at the
 *     top of the `## Pending` section — backup + atomic temp+rename.
 *  3. Re-parse gate: the new line must parse back as a `manual` item carrying
 *     the same local ref; otherwise restore pipeline.md and delete the JD file.
 *
 * The CLI `pipeline` mode then evaluates it from the local JD (`local:` prefix),
 * writes the report, and merges the tracker. This writer never evaluates.
 */

export type PipelineWriteErrorCode =
  | "INVALID_INPUT"
  | "READ_ONLY"
  | "LOCK_TIMEOUT"
  | "PARSE_FAILED";

export class PipelineWriteError extends Error {
  constructor(
    readonly code: PipelineWriteErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "PipelineWriteError";
  }
}

const DEFAULT_PIPELINE = `# Pipeline — Pending URLs

Paste job URLs below as \`- [ ] {url}\` then run \`/career-ops pipeline\`.

## Pending

## Processed
`;

/** Same-directory temp file + rename — mirrors the other writers. */
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

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A filesystem-safe slug (lowercase, ascii, hyphens), capped for sane names. */
function sanitizeSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Derive a JD file slug from the posting URL: `{host-brand}-{last-path-seg}`. */
export function slugFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, "").split(".")[0] ?? "";
    const seg = u.pathname.split("/").filter(Boolean).pop() ?? "";
    return sanitizeSlug(`${host}-${seg}`) || sanitizeSlug(host) || "offer";
  } catch {
    return "offer";
  }
}

/** Next free `NNN-` number in `jds/` (max existing + 1; empty/absent → 1). */
async function nextJdNumber(repoPath: string): Promise<number> {
  const jdsDir = path.join(repoPath, "jds");
  let names: string[];
  try {
    names = await fs.readdir(jdsDir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return 1;
    throw err;
  }
  let max = 0;
  for (const name of names) {
    const m = /^(\d+)-/.exec(name);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return max + 1;
}

/** Insert `line` at the top of the `## Pending` section (create it if absent). */
export function insertPendingLine(content: string, line: string): string {
  const lines = content.split("\n");
  const headingIdx = lines.findIndex((l) => /^##\s+pending\b/i.test(l.trim()));
  if (headingIdx !== -1) {
    lines.splice(headingIdx + 1, 0, line);
    return lines.join("\n");
  }
  const processedIdx = lines.findIndex((l) => /^##\s+processed\b/i.test(l.trim()));
  if (processedIdx !== -1) {
    lines.splice(processedIdx, 0, "## Pending", line, "");
    return lines.join("\n");
  }
  const trimmed = content.replace(/\s*$/, "");
  return `${trimmed}\n\n## Pending\n${line}\n`;
}

/**
 * Add a manual offer: writes the JD file and appends the pipeline line. Returns
 * the created `PipelineItem` (re-parsed from the line actually written).
 */
export async function addManualOffer(
  repoPath: string,
  rawInput: AddManualOfferInput,
  lockOptions?: PipelineLockOptions,
): Promise<PipelineItem> {
  const parsed = addManualOfferInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new PipelineWriteError(
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Invalid manual offer input.",
    );
  }
  const { url, jd } = parsed.data;
  const pipelinePath = pipelinePathFor(repoPath);

  let lock;
  try {
    lock = await acquirePipelineLock(pipelinePath, lockOptions);
  } catch (err: unknown) {
    if (err instanceof PipelineLockTimeoutError) {
      throw new PipelineWriteError("LOCK_TIMEOUT", err.message);
    }
    throw err;
  }

  let jdPath: string | null = null;
  try {
    // Read pipeline.md (or start from the default skeleton).
    let original: string | null;
    try {
      original = await fs.readFile(pipelinePath, "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") original = null;
      else throw err;
    }
    const pipelineContent = original ?? DEFAULT_PIPELINE;

    // Compute the JD file path and write it FIRST so the `local:` ref is valid.
    const num = await nextJdNumber(repoPath);
    const slug = slugFromUrl(url);
    const jdRel = `jds/${String(num).padStart(3, "0")}-${slug}.md`;
    jdPath = path.join(repoPath, jdRel);
    const date = todayStr();
    const jdFile = `<!-- Source: ${url} -->\n<!-- Added via the dashboard on ${date}. JD not auto-fetchable — pasted by the user. -->\n\n${jd.trim()}\n`;
    await fs.mkdir(path.dirname(jdPath), { recursive: true });
    writeFileAtomic(jdPath, jdFile);

    // Build + insert the pending line.
    const line = `- [!] ${url} | local:${jdRel} | note: manual — JD pasted via dashboard ${date}`;
    const updated = insertPendingLine(pipelineContent, line);

    // Backup (only when the file already existed) then atomic write.
    let backupPath: string | null = null;
    if (original !== null) {
      backupPath = path.join(
        path.dirname(pipelinePath),
        `.pipeline.md.backup.${process.pid}.${Date.now()}.${randomUUID()}`,
      );
      writeFileSync(backupPath, original);
    }
    await fs.mkdir(path.dirname(pipelinePath), { recursive: true });
    writeFileAtomic(pipelinePath, updated);

    // Re-parse gate: the new line must parse back as a manual item with our ref.
    const item =
      parsePipeline(updated).find(
        (i) => i.kind === "manual" && i.url === url && i.localJd === jdRel,
      ) ?? null;
    if (!item) {
      if (original !== null) writeFileAtomic(pipelinePath, original);
      else await fs.rm(pipelinePath, { force: true });
      await fs.rm(jdPath, { force: true });
      if (backupPath) rmSync(backupPath, { force: true });
      throw new PipelineWriteError(
        "PARSE_FAILED",
        "pipeline.md did not round-trip the new offer — the change was rolled back.",
      );
    }
    if (backupPath) rmSync(backupPath, { force: true });
    return item;
  } catch (err) {
    // Best-effort orphan cleanup if we failed after writing the JD file.
    if (jdPath && !(err instanceof PipelineWriteError && err.code === "PARSE_FAILED")) {
      await fs.rm(jdPath, { force: true }).catch(() => {});
    }
    throw err;
  } finally {
    lock.release();
  }
}
