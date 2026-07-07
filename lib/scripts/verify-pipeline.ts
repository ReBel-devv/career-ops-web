import { runRepoScript } from "./exec";

/**
 * Post-write gate: `node verify-pipeline.mjs` with cwd = the data repo.
 * Exit 0 = healthy (warnings allowed); non-zero = the tracker has errors.
 */

export interface VerifyPipelineResult {
  ok: boolean;
  exitCode: number;
  output: string;
}

export async function runVerifyPipeline(
  repoPath: string,
): Promise<VerifyPipelineResult> {
  const { code, stdout, stderr } = await runRepoScript(
    repoPath,
    "verify-pipeline.mjs",
  );
  const output = [stdout, stderr].filter((s) => s.trim() !== "").join("\n");
  return { ok: code === 0, exitCode: code, output };
}
