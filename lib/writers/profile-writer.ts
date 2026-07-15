import { randomUUID } from "node:crypto";
import { renameSync, rmSync, writeFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import {
  PROFILE_UPLOAD_EXTS,
  PROFILE_UPLOAD_MAX_BYTES,
  profileDocumentKind,
  updateProfileFieldInputSchema,
  type ProfileDocument,
  type UpdateProfileFieldInput,
} from "@/lib/domain";
import { parseProfile } from "@/lib/parsers/profile";
import type { Profile } from "@/lib/domain";
import {
  acquireProfileLock,
  ProfileLockTimeoutError,
  profilePathFor,
  type ProfileLockOptions,
} from "./profile-lock";

/**
 * Writers for the candidate profile:
 *
 *  - `setProfileField` — surgical single-scalar edit of `config/profile.yml`.
 *    Under the profile lock: read → optimistic-concurrency check (expected) →
 *    replace exactly one `parent.child` value line (comments/structure
 *    preserved) → whole-file YAML re-parse gate → backup + atomic temp-rename →
 *    restore on any failure. Never touches lists or other fields.
 *
 *  - `addProfileDocument` — save an uploaded source document to `sources/`
 *    (atomic temp-rename, name de-duplicated), the profile-feed store described
 *    in sources/README.md. Never overwrites an existing file.
 */

export type ProfileWriteErrorCode =
  | "INVALID_INPUT"
  | "READ_ONLY"
  | "NOT_FOUND"
  | "STALE_FIELD"
  | "LOCK_TIMEOUT"
  | "PARSE_FAILED";

export class ProfileWriteError extends Error {
  constructor(
    readonly code: ProfileWriteErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ProfileWriteError";
  }
}

/** Same-directory temp file + rename — mirrors the other writers. */
function writeFileAtomic(filePath: string, content: string | Uint8Array): void {
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

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Double-quote a scalar, escaping backslashes and quotes (single-line only). */
function serializeScalar(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Replace `parent.child`'s value in YAML text, preserving indentation, comments
 * and every other line. Returns the new text, or null when the `parent:` block
 * or the `child:` line can't be found. Only the value token is rewritten.
 */
export function setYamlScalar(
  content: string,
  parentKey: string,
  childKey: string,
  newValue: string,
): string | null {
  const lines = content.split("\n");
  const parentRe = new RegExp(`^${escapeRe(parentKey)}:\\s*(#.*)?$`);
  const parentIdx = lines.findIndex((l) => parentRe.test(l));
  if (parentIdx === -1) return null;

  const childRe = new RegExp(`^(\\s+)${escapeRe(childKey)}:\\s*(.*)$`);
  for (let i = parentIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop at the next top-level key (unindented, non-comment, non-blank).
    if (/^\S/.test(line) && !/^\s*#/.test(line) && line.trim() !== "") break;
    const m = childRe.exec(line);
    if (m) {
      lines[i] = `${m[1]}${childKey}: ${serializeScalar(newValue)}`;
      return lines.join("\n");
    }
  }
  return null;
}

/** Read the current scalar at `parent.child` from YAML text ("" when absent). */
function currentScalar(
  content: string,
  parentKey: string,
  childKey: string,
): string {
  const doc = loadYaml(content);
  if (typeof doc !== "object" || doc === null) return "";
  const parent = (doc as Record<string, unknown>)[parentKey];
  if (typeof parent !== "object" || parent === null) return "";
  const value = (parent as Record<string, unknown>)[childKey];
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Edit one scalar field of `config/profile.yml`. Returns the freshly re-parsed
 * {@link Profile}. Throws {@link ProfileWriteError} on failure.
 */
export async function setProfileField(
  repoPath: string,
  rawInput: UpdateProfileFieldInput,
  lockOptions?: ProfileLockOptions,
): Promise<Profile> {
  const parsed = updateProfileFieldInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ProfileWriteError(
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Invalid profile edit.",
    );
  }
  const { field, value, expected } = parsed.data;
  const [parentKey, childKey] = field.split(".");
  const profilePath = profilePathFor(repoPath);

  let lock;
  try {
    lock = await acquireProfileLock(profilePath, lockOptions);
  } catch (err: unknown) {
    if (err instanceof ProfileLockTimeoutError) {
      throw new ProfileWriteError("LOCK_TIMEOUT", err.message);
    }
    throw err;
  }

  try {
    let original: string;
    try {
      original = await fs.readFile(profilePath, "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        throw new ProfileWriteError(
          "NOT_FOUND",
          "config/profile.yml was not found in the data repo.",
        );
      }
      throw err;
    }

    // Optimistic concurrency: only enforced when the client sent a baseline.
    if (typeof expected === "string") {
      const current = currentScalar(original, parentKey, childKey);
      if (current !== expected.trim()) {
        throw new ProfileWriteError(
          "STALE_FIELD",
          "This field changed since you loaded it — reload and try again.",
          `expected="${expected.trim()}" current="${current}"`,
        );
      }
    }

    const updated = setYamlScalar(original, parentKey, childKey, value);
    if (updated === null) {
      throw new ProfileWriteError(
        "NOT_FOUND",
        `Could not locate "${field}" in profile.yml — the file layout is unexpected.`,
      );
    }

    // Re-parse gate #1: the whole file must still be valid YAML and the edited
    // path must round-trip to exactly the new value.
    let roundTripped: string;
    try {
      roundTripped = currentScalar(updated, parentKey, childKey);
    } catch (err: unknown) {
      throw new ProfileWriteError(
        "PARSE_FAILED",
        "The edit would have broken profile.yml — nothing was written.",
        err instanceof Error ? err.message : undefined,
      );
    }
    if (roundTripped !== value.trim()) {
      throw new ProfileWriteError(
        "PARSE_FAILED",
        "profile.yml did not round-trip the edit — nothing was written.",
      );
    }

    // Backup + atomic write, then re-parse gate #2 against the file on disk.
    const backupPath = path.join(
      path.dirname(profilePath),
      `.profile.yml.backup.${process.pid}.${Date.now()}.${randomUUID()}`,
    );
    writeFileSync(backupPath, original);
    try {
      writeFileAtomic(profilePath, updated);
      const readBack = await fs.readFile(profilePath, "utf8");
      const profile = parseProfile(readBack); // throws if the file is broken
      rmSync(backupPath, { force: true });
      return profile;
    } catch (err) {
      // Restore the pre-edit file on any post-write failure.
      writeFileAtomic(profilePath, original);
      rmSync(backupPath, { force: true });
      if (err instanceof ProfileWriteError) throw err;
      throw new ProfileWriteError(
        "PARSE_FAILED",
        "profile.yml failed to re-parse after the edit — it was restored.",
        err instanceof Error ? err.message : undefined,
      );
    }
  } finally {
    lock.release();
  }
}

/* ------------------------------------------------- document uploads --- */

/** True when the string contains an ASCII control character (0x00–0x1F/0x7F). */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Strip a path to a safe basename; keep spaces/accents, drop separators. */
function safeBasename(filename: string): string {
  const base = path.basename(filename).replace(/[\\/]/g, "").trim();
  // No traversal, no leading dot (hidden), no control chars. Spaces and accents
  // are allowed — the existing source docs use both.
  if (
    base === "" ||
    base.startsWith(".") ||
    base.includes("..") ||
    hasControlChar(base)
  ) {
    return "";
  }
  return base.slice(0, 200);
}

/** Split a basename into `{ stem, ext }` (ext lowercased, without the dot). */
function splitExt(base: string): { stem: string; ext: string } {
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return { stem: base, ext: "" };
  return { stem: base.slice(0, dot), ext: base.slice(dot + 1).toLowerCase() };
}

/** First free `name (n).ext` given the names already present in the directory. */
function dedupeName(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  const { stem, ext } = splitExt(base);
  const suffix = ext ? `.${ext}` : "";
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem} (${n})${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${stem} (${randomUUID().slice(0, 8)})${suffix}`;
}

/**
 * Save an uploaded document into `sources/`. Validates extension + size, never
 * overwrites (de-duplicates the name), and returns the created descriptor.
 */
export async function addProfileDocument(
  repoPath: string,
  filename: string,
  bytes: Uint8Array,
): Promise<ProfileDocument> {
  const base = safeBasename(filename);
  if (base === "") {
    throw new ProfileWriteError("INVALID_INPUT", "Invalid file name.");
  }
  const { ext } = splitExt(base);
  if (!(PROFILE_UPLOAD_EXTS as readonly string[]).includes(ext)) {
    throw new ProfileWriteError(
      "INVALID_INPUT",
      `Unsupported file type ".${ext}". Allowed: ${PROFILE_UPLOAD_EXTS.join(", ")}.`,
    );
  }
  if (bytes.byteLength === 0) {
    throw new ProfileWriteError("INVALID_INPUT", "The file is empty.");
  }
  if (bytes.byteLength > PROFILE_UPLOAD_MAX_BYTES) {
    throw new ProfileWriteError(
      "INVALID_INPUT",
      `File is too large (max ${Math.floor(PROFILE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB).`,
    );
  }

  const sourcesDir = path.join(repoPath, "sources");
  await fs.mkdir(sourcesDir, { recursive: true });

  let existing: string[];
  try {
    existing = await fs.readdir(sourcesDir);
  } catch {
    existing = [];
  }
  const name = dedupeName(base, new Set(existing));
  const target = path.join(sourcesDir, name);

  // Guard: the resolved target must stay directly inside sources/.
  if (path.dirname(path.resolve(target)) !== path.resolve(sourcesDir)) {
    throw new ProfileWriteError("INVALID_INPUT", "Invalid file name.");
  }

  writeFileAtomic(target, bytes);
  const stat = await fs.stat(target);
  return {
    name,
    ext,
    kind: profileDocumentKind(ext),
    sizeBytes: stat.size,
    modifiedMs: stat.mtimeMs,
  };
}
