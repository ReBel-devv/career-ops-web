/**
 * Runtime configuration, read from environment variables at request time.
 *
 * - `CAREER_OPS_PATH`  — absolute path to the career-ops data repo (private mode).
 * - `DEMO_MODE`        — serve fixture data only; never touches the filesystem repo.
 * - `READ_ONLY`        — belt-and-suspenders switch disabling all mutations (M1+).
 * - `ASSISTANT_ENABLED`— gate for the local Claude Agent SDK assistant. Defaults
 *   to ON, but is force-disabled off-local (demo, no repo, or a public deploy).
 */
import { isTruthyEnv, type EnvVars } from "./guard";

export interface AppConfig {
  /** Absolute path to the career-ops data repo, or null when unset. */
  careerOpsPath: string | null;
  demoMode: boolean;
  readOnly: boolean;
  /**
   * The embedded assistant is available: local mode, a real data repo, and not
   * explicitly disabled. Never true on a public (Vercel) build or in demo mode.
   */
  assistantEnabled: boolean;
  /**
   * The assistant may perform mutations (Write/Edit/mutating Bash). False when
   * `READ_ONLY` is set — reads still work, writes are refused.
   */
  assistantWritable: boolean;
}

/** True unless the env var is present and explicitly falsey (default-ON flag). */
function isEnabledByDefault(value: string | undefined): boolean {
  if (value === undefined || value.trim() === "") return true;
  return isTruthyEnv(value);
}

export function getConfig(env: EnvVars = process.env): AppConfig {
  const raw = env.CAREER_OPS_PATH?.trim();
  const careerOpsPath = raw ? raw : null;
  const demoMode = isTruthyEnv(env.DEMO_MODE);
  const readOnly = isTruthyEnv(env.READ_ONLY);

  // The assistant reads/writes the real repo through a local subprocess, so it
  // is meaningless (and unsafe) anywhere but a local, non-demo install.
  const onVercel = env.VERCEL !== undefined && env.VERCEL.trim() !== "";
  const assistantEnabled =
    isEnabledByDefault(env.ASSISTANT_ENABLED) &&
    careerOpsPath !== null &&
    !demoMode &&
    !onVercel;
  const assistantWritable = assistantEnabled && !readOnly;

  return { careerOpsPath, demoMode, readOnly, assistantEnabled, assistantWritable };
}

/** Resolve the data-repo path or fail with an actionable message. */
export function requireCareerOpsPath(env: EnvVars = process.env): string {
  const { careerOpsPath } = getConfig(env);
  if (!careerOpsPath) {
    throw new Error(
      "CAREER_OPS_PATH is not set. Point it at your career-ops data repo in " +
        ".env.local (see .env.example), or set DEMO_MODE=true to use fixtures.",
    );
  }
  return careerOpsPath;
}

export { assertDeployGuard, isTruthyEnv, type EnvVars } from "./guard";
