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
 * Exclusive lock for `data/outreach.yml`, modeled byte-for-byte on the
 * follow-ups lock protocol (followups-lock.ts). Unlike that file, NO CLI script
 * takes this lock today (outreach.yml is a dashboard-owned, plan-sanctioned new
 * file), so the goal is self-consistency (no two dashboard requests corrupt the
 * file concurrently) rather than CLI compatibility. The same atomic-mkdir +
 * owner.json + stale-recovery protocol is reused so the behavior is proven.
 *
 * - lock key  = sha256(outreachPath).slice(0, 16), where outreachPath is
 *   `<realpath(repoPath)>/data/outreach.yml`.
 * - lock dir  = `${realpath(tmpdir())}/career-ops-outreach-<key>.lock`.
 * - acquire   = atomic mkdir + owner.json {pid, token}; retry/backoff.
 * - stale     = dead-pid, or unreadable metadata older than staleMs, guarded by
 *               a `.recover` dir so two waiters can't both recover.
 * - release   = token-checked, idempotent.
 */

const OUTREACH_LOCK_PREFIX = "career-ops-outreach-";

export interface OutreachLockHandle {
  release(): void;
}

export interface OutreachLockOptions {
  timeoutMs?: number;
  retryMs?: number;
  staleMs?: number;
}

export class OutreachLockTimeoutError extends Error {
  constructor(lockDir: string) {
    super(`Timed out waiting for outreach lock at ${lockDir}`);
    this.name = "OutreachLockTimeoutError";
  }
}

/** The outreach.yml path this repo resolves to. */
export function outreachPathFor(repoPath: string): string {
  let root: string;
  try {
    root = realpathSync(repoPath);
  } catch {
    root = path.resolve(repoPath);
  }
  return path.join(root, "data", "outreach.yml");
}

/** The lock dir covering this outreach file. */
export function outreachLockDirFor(outreachPath: string): string {
  const key = createHash("sha256")
    .update(outreachPath)
    .digest("hex")
    .slice(0, 16);
  return path.join(
    realpathSync(tmpdir()),
    `${OUTREACH_LOCK_PREFIX}${key}.lock`,
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

/** Acquire the exclusive outreach lock covering read/modify/write/re-parse. */
export async function acquireOutreachLock(
  outreachPath: string,
  options: OutreachLockOptions = {},
): Promise<OutreachLockHandle> {
  const lockDir = outreachLockDirFor(outreachPath);
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
            outreach: outreachPath,
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

  throw new OutreachLockTimeoutError(lockDir);
}
