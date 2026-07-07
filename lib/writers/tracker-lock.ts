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
 * Port of the tracker lock-dir protocol from the data repo's
 * `merge-tracker.mjs`. The dashboard MUST take the exact same lock the CLI
 * scripts take, or the two could write `data/applications.md` concurrently
 * and lose updates. Everything here mirrors the CLI implementation:
 *
 * - Lock path: `${realpath(tmpdir())}/career-ops-merge-tracker-<key>.lock`
 *   where `<key>` = sha256(canonical tracker path).slice(0, 16). Same tracker
 *   file → same lock dir, across CLI and dashboard.
 * - Acquisition: atomic `mkdirSync` + `owner.json` ({pid, token, started_at,
 *   tracker}) + retry/backoff.
 * - Stale recovery: a lock whose owner pid is dead may be removed; a lock
 *   with unreadable metadata may be removed once older than `staleMs`
 *   (default 10 min). Recovery itself is guarded by a `.recover` dir so two
 *   waiters cannot both remove/recreate.
 * - Release: token-checked so a process never deletes another process's
 *   newer lock. Idempotent.
 *
 * The only deliberate deviation is the default acquire timeout: 10 s here
 * (an HTTP request shouldn't hang for the CLI's 60 s) — semantics otherwise
 * identical.
 */

export interface TrackerLockHandle {
  attempts: number;
  waitMs: number;
  staleRecovered: boolean;
  release(): void;
}

export interface TrackerLockOptions {
  timeoutMs?: number;
  retryMs?: number;
  staleMs?: number;
}

export class TrackerLockTimeoutError extends Error {
  constructor(lockDir: string) {
    super(`Timed out waiting for tracker merge lock at ${lockDir}`);
    this.name = "TrackerLockTimeoutError";
  }
}

/**
 * One stable absolute spelling of the tracker path before hashing —
 * mirrors `canonicalizeTrackerPath` in merge-tracker.mjs so equivalent
 * spellings (relative, absolute, through a symlink) map to the same lock.
 */
export function canonicalizeTrackerPath(trackerPath: string): string {
  const absolutePath = path.resolve(trackerPath);
  try {
    return realpathSync(absolutePath);
  } catch {
    return absolutePath;
  }
}

/** The exact lock dir merge-tracker.mjs would use for this tracker file. */
export function trackerLockDirFor(trackerPath: string): string {
  const key = createHash("sha256")
    .update(canonicalizeTrackerPath(trackerPath))
    .digest("hex")
    .slice(0, 16);
  return path.join(realpathSync(tmpdir()), `career-ops-merge-tracker-${key}.lock`);
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

/**
 * Acquire the exclusive tracker lock. The critical section must cover the
 * full read/modify/write/verify sequence — not just the final write.
 */
export async function acquireTrackerLock(
  trackerPath: string,
  options: TrackerLockOptions = {},
): Promise<TrackerLockHandle> {
  const lockDir = trackerLockDirFor(trackerPath);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const retryMs = options.retryMs ?? 75;
  const staleMs = options.staleMs ?? 10 * 60_000;
  const recoverGuardDir = `${lockDir}.recover`;
  const token = randomUUID();
  const startedAt = Date.now();
  let attempts = 0;
  let staleRecovered = false;

  while (Date.now() - startedAt < timeoutMs) {
    attempts++;
    try {
      mkdirSync(lockDir);
      writeFileSync(
        path.join(lockDir, "owner.json"),
        JSON.stringify(
          {
            pid: process.pid,
            token,
            started_at: new Date().toISOString(),
            tracker: canonicalizeTrackerPath(trackerPath),
          },
          null,
          2,
        ),
      );

      let released = false;
      return {
        attempts,
        waitMs: Date.now() - startedAt,
        staleRecovered,
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
            staleRecovered = true;
            continue;
          }
        } finally {
          rmSync(recoverGuardDir, { recursive: true, force: true });
        }
      }

      await sleep(retryMs);
    }
  }

  throw new TrackerLockTimeoutError(lockDir);
}
