import { randomUUID } from "node:crypto";
import { renameSync, rmSync, writeFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  CreateTemplateInput,
  SaveTemplateInput,
  Template,
  TemplateDetail,
  TemplateSource,
  TemplateSummary,
  TemplateVersion,
} from "@/lib/domain";
import { parseTemplateFile, serializeTemplateFile } from "@/lib/parsers/template";
import {
  acquireTemplateLock,
  TemplateLockTimeoutError,
  templatesDirFor,
  type TemplateLockOptions,
} from "./template-lock";

/**
 * Versioned writer for `templates/messages/` — reusable outreach texts:
 *
 *   templates/messages/{slug}.md                        ← current (hand-editable)
 *   templates/messages/history/{slug}/{NNN}-{source}.md ← immutable versions
 *
 * Every dashboard save appends a history file THEN atomically rewrites the
 * current file. If the current file was hand-edited since the last dashboard
 * save (content differs from the newest history entry), it is snapshotted
 * into history first — a save can overwrite, but never lose, hand edits.
 * Optimistic concurrency: the caller sends the `saved_at` it loaded; a
 * mismatch is a STALE_TEMPLATE (409), like every other writer in the repo.
 */

export type TemplateWriteErrorCode =
  | "INVALID_INPUT"
  | "READ_ONLY"
  | "NOT_FOUND"
  | "STALE_TEMPLATE"
  | "LOCK_TIMEOUT"
  | "PARSE_FAILED";

export class TemplateWriteError extends Error {
  constructor(
    readonly code: TemplateWriteErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "TemplateWriteError";
  }
}

/** Slug/segment guard — template slugs are directory names (no traversal). */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function isValidTemplateSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length <= 80;
}

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

/** A filesystem-safe slug (lowercase, ascii, hyphens) from a free-text title. */
export function templateSlugFromTitle(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "template"
  );
}

function historyDirFor(templatesDir: string, slug: string): string {
  return path.join(templatesDir, "history", slug);
}

function currentPathFor(templatesDir: string, slug: string): string {
  return path.join(templatesDir, `${slug}.md`);
}

async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw err;
  }
}

interface HistoryEntry extends TemplateVersion {
  filename: string;
}

/** Parse `NNN-source.md` history filenames, sorted by version asc. */
async function listHistory(
  templatesDir: string,
  slug: string,
): Promise<HistoryEntry[]> {
  let names: string[];
  try {
    names = await fs.readdir(historyDirFor(templatesDir, slug));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw err;
  }
  const entries: HistoryEntry[] = [];
  for (const name of names) {
    const m = /^(\d{3,})-([a-z]+)\.md$/.exec(name);
    if (!m) continue;
    const content = await readFileOrNull(
      path.join(historyDirFor(templatesDir, slug), name),
    );
    if (content === null) continue;
    const { meta } = parseTemplateFile(content);
    entries.push({
      filename: name,
      version: Number.parseInt(m[1], 10),
      savedAt: meta.savedAt ?? "",
      source: meta.source,
      note: meta.note,
    });
  }
  return entries.sort((a, b) => a.version - b.version);
}

/** Build the `Template` view of a current file's content. */
function toTemplate(slug: string, content: string): Template {
  const { meta, body } = parseTemplateFile(content);
  return {
    slug,
    title: meta.title ?? slug,
    type: meta.type,
    savedAt: meta.savedAt ?? "",
    source: meta.source,
    note: meta.note,
    body,
  };
}

/* -------------------------------------------------------------- reads --- */

/** All templates (current files only), newest saved first. */
export async function listTemplates(repoPath: string): Promise<TemplateSummary[]> {
  const templatesDir = templatesDirFor(repoPath);
  let names: string[];
  try {
    names = await fs.readdir(templatesDir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw err;
  }
  const summaries: TemplateSummary[] = [];
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    const slug = name.slice(0, -3);
    if (!isValidTemplateSlug(slug)) continue;
    const content = await readFileOrNull(path.join(templatesDir, name));
    if (content === null) continue;
    const template = toTemplate(slug, content);
    const versions = await listHistory(templatesDir, slug);
    const firstLine =
      template.body
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0) ?? "";
    summaries.push({
      slug,
      title: template.title,
      type: template.type,
      savedAt: template.savedAt,
      versionCount: versions.length,
      excerpt: firstLine.length > 140 ? `${firstLine.slice(0, 139)}…` : firstLine,
      body: template.body,
    });
  }
  return summaries.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** One template + its version history (newest first), null when absent. */
export async function readTemplate(
  repoPath: string,
  slug: string,
): Promise<TemplateDetail | null> {
  if (!isValidTemplateSlug(slug)) return null;
  const templatesDir = templatesDirFor(repoPath);
  const content = await readFileOrNull(currentPathFor(templatesDir, slug));
  if (content === null) return null;
  const versions = await listHistory(templatesDir, slug);
  return {
    template: toTemplate(slug, content),
    versions: versions
      .map(({ filename: _filename, ...v }) => v)
      .sort((a, b) => b.version - a.version),
  };
}

/** One archived version's full content, null when absent. */
export async function readTemplateVersion(
  repoPath: string,
  slug: string,
  version: number,
): Promise<(TemplateVersion & { body: string }) | null> {
  if (!isValidTemplateSlug(slug) || !Number.isInteger(version) || version <= 0) {
    return null;
  }
  const templatesDir = templatesDirFor(repoPath);
  const entries = await listHistory(templatesDir, slug);
  const entry = entries.find((e) => e.version === version);
  if (!entry) return null;
  const content = await readFileOrNull(
    path.join(historyDirFor(templatesDir, slug), entry.filename),
  );
  if (content === null) return null;
  const { body } = parseTemplateFile(content);
  return {
    version: entry.version,
    savedAt: entry.savedAt,
    source: entry.source,
    note: entry.note,
    body,
  };
}

/* ------------------------------------------------------------- writes --- */

function historyFilename(version: number, source: TemplateSource): string {
  return `${String(version).padStart(3, "0")}-${source}.md`;
}

/** Append one version file (never overwrites an existing one). */
async function appendHistory(
  templatesDir: string,
  slug: string,
  version: number,
  serialized: string,
  source: TemplateSource,
): Promise<void> {
  const dir = historyDirFor(templatesDir, slug);
  await fs.mkdir(dir, { recursive: true });
  writeFileAtomic(path.join(dir, historyFilename(version, source)), serialized);
}

interface WriteVersionArgs {
  templatesDir: string;
  slug: string;
  title: string;
  type: string | null;
  body: string;
  source: TemplateSource;
  note: string | null;
}

/**
 * Core save (caller holds the lock): snapshot a hand-edited current file if
 * needed, then append the new version and rewrite the current file. The
 * re-parse gate guards the serialization round-trip.
 */
async function writeVersion(args: WriteVersionArgs): Promise<TemplateDetail> {
  const { templatesDir, slug } = args;
  const currentPath = currentPathFor(templatesDir, slug);
  const existing = await readFileOrNull(currentPath);
  const history = await listHistory(templatesDir, slug);
  let nextVersion = (history[history.length - 1]?.version ?? 0) + 1;

  // Hand edits that bypassed the dashboard: archive them before overwriting.
  if (existing !== null && history.length > 0) {
    const latest = history[history.length - 1];
    const latestContent = await readFileOrNull(
      path.join(historyDirFor(templatesDir, slug), latest.filename),
    );
    if (latestContent !== null && latestContent !== existing) {
      const parsed = parseTemplateFile(existing);
      await appendHistory(
        templatesDir,
        slug,
        nextVersion,
        serializeTemplateFile({
          title: parsed.meta.title ?? args.title,
          type: parsed.meta.type,
          savedAt: new Date().toISOString(),
          source: "snapshot",
          note: "hand-edited outside the dashboard",
          body: parsed.body,
        }),
        "snapshot",
      );
      nextVersion += 1;
    }
  }

  const savedAt = new Date().toISOString();
  const serialized = serializeTemplateFile({
    title: args.title,
    type: args.type,
    savedAt,
    source: args.source,
    note: args.note,
    body: args.body,
  });

  // Re-parse gate BEFORE touching the disk with the new content.
  const roundTrip = parseTemplateFile(serialized);
  if (
    roundTrip.meta.title !== args.title ||
    roundTrip.body !== args.body.trimEnd() ||
    roundTrip.meta.savedAt !== savedAt
  ) {
    throw new TemplateWriteError(
      "PARSE_FAILED",
      "The template did not round-trip through the file format — nothing was written.",
    );
  }

  await appendHistory(templatesDir, slug, nextVersion, serialized, args.source);
  await fs.mkdir(path.dirname(currentPath), { recursive: true });
  writeFileAtomic(currentPath, serialized);

  const detail = await readTemplateFromDir(templatesDir, slug);
  if (!detail) {
    throw new TemplateWriteError(
      "PARSE_FAILED",
      "The written template could not be read back.",
    );
  }
  return detail;
}

/** readTemplate against an already-resolved templates dir (lock-internal). */
async function readTemplateFromDir(
  templatesDir: string,
  slug: string,
): Promise<TemplateDetail | null> {
  const content = await readFileOrNull(currentPathFor(templatesDir, slug));
  if (content === null) return null;
  const versions = await listHistory(templatesDir, slug);
  return {
    template: toTemplate(slug, content),
    versions: versions
      .map(({ filename: _filename, ...v }) => v)
      .sort((a, b) => b.version - a.version),
  };
}

async function withTemplateLock<T>(
  repoPath: string,
  lockOptions: TemplateLockOptions | undefined,
  fn: (templatesDir: string) => Promise<T>,
): Promise<T> {
  const templatesDir = templatesDirFor(repoPath);
  let lock;
  try {
    lock = await acquireTemplateLock(templatesDir, lockOptions);
  } catch (err: unknown) {
    if (err instanceof TemplateLockTimeoutError) {
      throw new TemplateWriteError("LOCK_TIMEOUT", err.message);
    }
    throw err;
  }
  try {
    return await fn(templatesDir);
  } finally {
    lock.release();
  }
}

/** Create a new template (v1). The slug derives from the title, deduped. */
export async function createTemplate(
  repoPath: string,
  input: CreateTemplateInput,
  lockOptions?: TemplateLockOptions,
): Promise<TemplateDetail> {
  return withTemplateLock(repoPath, lockOptions, async (templatesDir) => {
    const base = templateSlugFromTitle(input.title);
    let slug = base;
    for (let i = 2; (await readFileOrNull(currentPathFor(templatesDir, slug))) !== null; i += 1) {
      if (i > 50) {
        throw new TemplateWriteError(
          "INVALID_INPUT",
          `Could not find a free slug for "${input.title}".`,
        );
      }
      slug = `${base}-${i}`;
    }
    return writeVersion({
      templatesDir,
      slug,
      title: input.title,
      type: input.type ?? null,
      body: input.body,
      source: input.source,
      note: input.note ?? null,
    });
  });
}

/** Save a new version of an existing template (optimistic concurrency). */
export async function saveTemplate(
  repoPath: string,
  input: SaveTemplateInput,
  lockOptions?: TemplateLockOptions,
): Promise<TemplateDetail> {
  if (!isValidTemplateSlug(input.slug)) {
    throw new TemplateWriteError("INVALID_INPUT", `Invalid template slug: ${input.slug}`);
  }
  return withTemplateLock(repoPath, lockOptions, async (templatesDir) => {
    const existing = await readFileOrNull(currentPathFor(templatesDir, input.slug));
    if (existing === null) {
      throw new TemplateWriteError(
        "NOT_FOUND",
        `Template "${input.slug}" not found.`,
      );
    }
    const { meta } = parseTemplateFile(existing);
    // Hand-written files may carry no saved_at — then there is nothing to be
    // stale against (the snapshot pass still archives their content).
    if (meta.savedAt !== null && meta.savedAt !== input.expectedSavedAt) {
      throw new TemplateWriteError(
        "STALE_TEMPLATE",
        "The template changed since it was loaded. Reload and retry.",
        `expected saved_at ${input.expectedSavedAt}, found ${meta.savedAt}`,
      );
    }
    return writeVersion({
      templatesDir,
      slug: input.slug,
      title: input.title,
      type: input.type ?? null,
      body: input.body,
      source: input.source,
      note: input.note ?? null,
    });
  });
}
