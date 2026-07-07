import { execFile } from "node:child_process";

/**
 * execFile wrapper for running the data repo's own .mjs scripts.
 *
 * - Never throws on a non-zero exit — callers get `{ code, stdout, stderr }`
 *   and decide what a failure means.
 * - Always runs with `cwd` = the career-ops repo path, invoking the script
 *   by its repo-relative name, so each script's `import.meta.url`-derived
 *   root is the repo it lives in.
 * - Strips the scripts' `CAREER_OPS_*` path-override env vars: the dashboard
 *   reads `data/applications.md` under CAREER_OPS_PATH directly, so a stray
 *   CAREER_OPS_TRACKER in the web server's environment must not silently
 *   redirect the scripts to a different file than the one we just wrote.
 */

export interface ScriptResult {
  code: number;
  stdout: string;
  stderr: string;
}

const STRIPPED_ENV_PREFIX = "CAREER_OPS_";

function scriptEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith(STRIPPED_ENV_PREFIX)) delete env[key];
  }
  return env;
}

export function runRepoScript(
  repoPath: string,
  script: string,
  args: readonly string[] = [],
  timeoutMs = 60_000,
): Promise<ScriptResult> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [script, ...args],
      {
        cwd: repoPath,
        env: scriptEnv(),
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== "number") {
          // Spawn-level failure (ENOENT, timeout kill, …) — not a script exit.
          reject(
            new Error(
              `Failed to run ${script} in ${repoPath}: ${error.message}`,
              { cause: error },
            ),
          );
          return;
        }
        resolve({
          code: error && typeof error.code === "number" ? error.code : 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        });
      },
    );
  });
}
