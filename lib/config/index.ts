/**
 * Runtime configuration, read from environment variables at request time.
 *
 * - `CAREER_OPS_PATH` — absolute path to the career-ops data repo (private mode).
 * - `DEMO_MODE`       — serve fixture data only; never touches the filesystem repo.
 * - `READ_ONLY`       — belt-and-suspenders switch disabling all mutations (M1+).
 */
import { isTruthyEnv, type EnvVars } from "./guard";

export interface AppConfig {
  /** Absolute path to the career-ops data repo, or null when unset. */
  careerOpsPath: string | null;
  demoMode: boolean;
  readOnly: boolean;
}

export function getConfig(env: EnvVars = process.env): AppConfig {
  const raw = env.CAREER_OPS_PATH?.trim();
  return {
    careerOpsPath: raw ? raw : null,
    demoMode: isTruthyEnv(env.DEMO_MODE),
    readOnly: isTruthyEnv(env.READ_ONLY),
  };
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
