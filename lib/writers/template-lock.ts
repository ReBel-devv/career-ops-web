import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Exclusive lock for the `templates/messages/` directory, modeled
 * byte-for-byte on the pipeline lock protocol (pipeline-lock.ts). One lock
 * covers the whole directory (current files + history) because a save touches
 * several files: two concurrent dashboard saves must not interleave version
 * numbers.
 *
 * - lock key = sha256(templatesDir).slice(0, 16), where templatesDir is
 *   `<realpath(repoPath)>/templates/messages`.
 * - lock dir = `${realpath(tmpdir())}/career-ops-templates-<key>.lock`.
 * - acquire  = atomic mkdir + owner.json {pid, token}; retry/backoff.
 * - stale    = dead-pid, or unreadable metadata older than staleMs, guarded by
 *              a `.recover` dir so two waiters can't both recover.
 * - release  = token-checked, idempotent.
 */

const TEMPLATE_LOCK_PREFIX = "career-ops-templates-";

export interface TemplateLockHandle {
  release(): void;
}

export interface TemplateLockOptions {
  timeoutMs?: number;
  retryMs?: number;
  staleMs?: number;
}

export class TemplateLockTimeoutError extends Error {
  constructor(lockDir: string) {
    super(`Timed out waiting for templates lock at ${lockDir}`);
    this.name = "TemplateLockTimeoutError";
  }
}

/** The message-templates directory this repo resolves to. Lives under
 * `templates/messages/` — the data repo's `templates/` root already holds
 * unrelated assets (CV/cover-letter HTML, states.yml, …). */
export function templatesDirFor(repoPath: string): string {
  let root: string;
  try {
    root = realpathSync(repoPath);
  } catch {
    root = path.resolve(repoPath);
  }
  return path.join(root, "templates", "messages");
}

/** The lock dir covering this templates directory. */
export function templateLockDirFor(templatesDir: string): string {
  const key = createHash("sha256").update(templatesDir).digest("hex").slice(0, 16);
  return path.join(realpathSync(tmpdir()), `${TEMPLATE_LOCK_PREFIX}${key}.lock`);
}

interface LockOwner {
  pid?: number;
  token?: string;
}

function readLockOwner(lockDir: string): LockOwner | null {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(path.join(lockDir, "owner.json"), "utf8"),
    );
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as LockOwner;
  } catch {
    return null;
  }
}

function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return (err as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

function lockCanRecover(lockDir: string, staleMs: number): boolean {
  const owner = readLockOwner(lockDir);
  if (owner?.pid) return !processIsAlive(owner.pid);
  try {
    return Date.now() - statSync(lockDir).mtimeMs > staleMs;
  } catch {
    return true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Acquire the exclusive templates lock covering read/modify/write/re-parse. */
export async function acquireTemplateLock(
  templatesDir: string,
  options: TemplateLockOptions = {},
): Promise<TemplateLockHandle> {
  const lockDir = templateLockDirFor(templatesDir);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const retryMs = options.retryMs ?? 75;
  const staleMs = options.staleMs ?? 10 * 60_000;
  const recoverGuardDir = `${lockDir}.recover`;
  const token = randomUUID();
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      mkdirSync(lockDir);
      writeFileSync(
        path.join(lockDir, "owner.json"),
        JSON.stringify(
          {
            pid: process.pid,
            token,
            startedAt: new Date().toISOString(),
            templates: templatesDir,
          },
          null,
          2,
        ),
      );

      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          const owner = readLockOwner(lockDir);
          if (owner?.token === token) {
            rmSync(lockDir, { recursive: true, force: true });
          }
        },
      };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") throw err;

      let hasRecoverGuard = false;
      try {
        mkdirSync(recoverGuardDir);
        hasRecoverGuard = true;
      } catch (guardErr: unknown) {
        if ((guardErr as NodeJS.ErrnoException)?.code !== "EEXIST") {
          throw guardErr;
        }
      }

      if (hasRecoverGuard) {
        try {
          if (lockCanRecover(lockDir, staleMs)) {
            rmSync(lockDir, { recursive: true, force: true });
            continue;
          }
        } finally {
          rmSync(recoverGuardDir, { recursive: true, force: true });
        }
      }

      await sleep(retryMs);
    }
  }

  throw new TemplateLockTimeoutError(lockDir);
}
