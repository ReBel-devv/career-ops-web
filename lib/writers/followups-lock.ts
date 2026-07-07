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
 * Port of the follow-ups lock-dir protocol from the data repo's
 * `followup-seed.mjs`. The dashboard's log-sent append-writer MUST take the
 * exact same lock `followup-seed.mjs` takes, or the two could write
 * `data/follow-ups.md` concurrently (a reschedule via followup-seed and a
 * log-sent via the append-writer) and corrupt the file.
 *
 * Derivation mirrors the CLI exactly (see followup-seed.mjs):
 * - lock key = sha256(followupsPath).slice(0, 16) — the CLI hashes the resolved
 *   followups PATH STRING (not realpath'd), where that path is
 *   `<CAREER_OPS>/data/follow-ups.md` and `CAREER_OPS = dirname(realpath(script))`.
 *   Since node realpaths the main module, and the script sits at the repo root,
 *   that resolves to `<realpath(repoPath)>/data/follow-ups.md`.
 * - lock dir = `${realpath(tmpdir())}/career-ops-followups-<key>.lock`.
 * - acquire: atomic mkdir + owner.json {pid, token}; retry/backoff.
 * - stale recovery: dead-pid or (unreadable metadata AND older than staleMs),
 *   guarded by a `.recover` dir so two waiters can't both recover.
 * - release: token-checked, idempotent.
 *
 * The CAREER_OPS_FOLLOWUPS* env overrides are irrelevant here: runRepoScript
 * strips all CAREER_OPS_* vars before spawning the .mjs, so the CLI always uses
 * the default path/lock — which is what we reproduce.
 */

const FOLLOWUPS_LOCK_PREFIX = "career-ops-followups-";

export interface FollowUpsLockHandle {
  release(): void;
}

export interface FollowUpsLockOptions {
  timeoutMs?: number;
  retryMs?: number;
  staleMs?: number;
}

export class FollowUpsLockTimeoutError extends Error {
  constructor(lockDir: string) {
    super(`Timed out waiting for follow-ups lock at ${lockDir}`);
    this.name = "FollowUpsLockTimeoutError";
  }
}

/** The follow-ups.md path the CLI scripts resolve to for this repo. */
export function followUpsPathFor(repoPath: string): string {
  let root: string;
  try {
    root = realpathSync(repoPath);
  } catch {
    root = path.resolve(repoPath);
  }
  return path.join(root, "data", "follow-ups.md");
}

/** The exact lock dir followup-seed.mjs would use for this follow-ups file. */
export function followUpsLockDirFor(followupsPath: string): string {
  const key = createHash("sha256")
    .update(followupsPath)
    .digest("hex")
    .slice(0, 16);
  return path.join(
    realpathSync(tmpdir()),
    `${FOLLOWUPS_LOCK_PREFIX}${key}.lock`,
  );
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

/** Acquire the exclusive follow-ups lock covering read/append/re-parse. */
export async function acquireFollowUpsLock(
  followupsPath: string,
  options: FollowUpsLockOptions = {},
): Promise<FollowUpsLockHandle> {
  const lockDir = followUpsLockDirFor(followupsPath);
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
            followups: followupsPath,
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

  throw new FollowUpsLockTimeoutError(lockDir);
}
