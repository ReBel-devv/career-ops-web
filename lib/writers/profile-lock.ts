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
 * Exclusive lock for `config/profile.yml`, modeled byte-for-byte on the outreach
 * lock protocol (outreach-lock.ts). No CLI script takes this lock today, so the
 * goal is self-consistency (two concurrent dashboard field edits can't corrupt
 * the file) rather than CLI compatibility. Same atomic-mkdir + owner.json +
 * stale-recovery protocol so the behavior is proven.
 */

const PROFILE_LOCK_PREFIX = "career-ops-profile-";

export interface ProfileLockHandle {
  release(): void;
}

export interface ProfileLockOptions {
  timeoutMs?: number;
  retryMs?: number;
  staleMs?: number;
}

export class ProfileLockTimeoutError extends Error {
  constructor(lockDir: string) {
    super(`Timed out waiting for profile lock at ${lockDir}`);
    this.name = "ProfileLockTimeoutError";
  }
}

/** The profile.yml path this repo resolves to. */
export function profilePathFor(repoPath: string): string {
  let root: string;
  try {
    root = realpathSync(repoPath);
  } catch {
    root = path.resolve(repoPath);
  }
  return path.join(root, "config", "profile.yml");
}

/** The lock dir covering this profile file. */
export function profileLockDirFor(profilePath: string): string {
  const key = createHash("sha256")
    .update(profilePath)
    .digest("hex")
    .slice(0, 16);
  return path.join(realpathSync(tmpdir()), `${PROFILE_LOCK_PREFIX}${key}.lock`);
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

/** Acquire the exclusive profile lock covering read/modify/write/re-parse. */
export async function acquireProfileLock(
  profilePath: string,
  options: ProfileLockOptions = {},
): Promise<ProfileLockHandle> {
  const lockDir = profileLockDirFor(profilePath);
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
            profile: profilePath,
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

  throw new ProfileLockTimeoutError(lockDir);
}
