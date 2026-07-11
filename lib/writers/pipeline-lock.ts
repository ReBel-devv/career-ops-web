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
 * Exclusive lock for `data/pipeline.md`, modeled byte-for-byte on the outreach
 * lock protocol (outreach-lock.ts). No CLI script takes a formal lock on
 * pipeline.md today (the `pipeline` mode is an LLM editing the file by hand), so
 * the goal is dashboard self-consistency — two concurrent "add manual offer"
 * requests must not corrupt the file — rather than CLI compatibility. The same
 * proven atomic-mkdir + owner.json + stale-recovery protocol is reused.
 *
 * - lock key = sha256(pipelinePath).slice(0, 16), where pipelinePath is
 *   `<realpath(repoPath)>/data/pipeline.md`.
 * - lock dir = `${realpath(tmpdir())}/career-ops-pipeline-<key>.lock`.
 * - acquire  = atomic mkdir + owner.json {pid, token}; retry/backoff.
 * - stale    = dead-pid, or unreadable metadata older than staleMs, guarded by
 *              a `.recover` dir so two waiters can't both recover.
 * - release  = token-checked, idempotent.
 */

const PIPELINE_LOCK_PREFIX = "career-ops-pipeline-";

export interface PipelineLockHandle {
  release(): void;
}

export interface PipelineLockOptions {
  timeoutMs?: number;
  retryMs?: number;
  staleMs?: number;
}

export class PipelineLockTimeoutError extends Error {
  constructor(lockDir: string) {
    super(`Timed out waiting for pipeline lock at ${lockDir}`);
    this.name = "PipelineLockTimeoutError";
  }
}

/** The pipeline.md path this repo resolves to. */
export function pipelinePathFor(repoPath: string): string {
  let root: string;
  try {
    root = realpathSync(repoPath);
  } catch {
    root = path.resolve(repoPath);
  }
  return path.join(root, "data", "pipeline.md");
}

/** The lock dir covering this pipeline file. */
export function pipelineLockDirFor(pipelinePath: string): string {
  const key = createHash("sha256").update(pipelinePath).digest("hex").slice(0, 16);
  return path.join(realpathSync(tmpdir()), `${PIPELINE_LOCK_PREFIX}${key}.lock`);
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

/** Acquire the exclusive pipeline lock covering read/modify/write/re-parse. */
export async function acquirePipelineLock(
  pipelinePath: string,
  options: PipelineLockOptions = {},
): Promise<PipelineLockHandle> {
  const lockDir = pipelineLockDirFor(pipelinePath);
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
            pipeline: pipelinePath,
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

  throw new PipelineLockTimeoutError(lockDir);
}
