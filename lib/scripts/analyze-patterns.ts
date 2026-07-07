import { patternsResultSchema, type PatternsResult } from "@/lib/domain";
import { runRepoScript } from "./exec";

/**
 * `node analyze-patterns.mjs --json` — the single source of truth for
 * rejection-pattern analytics (plan §3 F5). Pattern math is NEVER recomputed
 * in the web app; this shells the script and zod-validates the JSON at the
 * boundary.
 *
 * Latency (plan §8 risk 6 — mtime cache "if warranted"): measured on the real
 * 33-row tracker + 33 reports with `/usr/bin/time` over 3 runs — 40 ms wall
 * per run (node startup dominates; the script reads applications.md + the
 * reports/ directory, no network, no LLM). Well under the 100 ms bar, so the
 * mtime cache is NOT implemented — reads are cheap and the data is living, so
 * we always run fresh (same measured decision as followup-cadence.ts in M4).
 */
export async function runAnalyzePatterns(
  repoPath: string,
): Promise<PatternsResult> {
  const { code, stdout, stderr } = await runRepoScript(
    repoPath,
    "analyze-patterns.mjs",
    ["--json"],
  );

  const trimmed = stdout.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(
      `analyze-patterns.mjs did not return JSON (exit ${code}): ${
        stderr.trim() || trimmed.slice(0, 200)
      }`,
    );
  }

  // Not-enough-data sentinel: `{ error, current, threshold }`, exit 1.
  // A valid state (young tracker), not a failure.
  if (
    parsed &&
    typeof parsed === "object" &&
    "error" in parsed &&
    !("metadata" in parsed)
  ) {
    const sentinel = parsed as {
      error?: unknown;
      current?: unknown;
      threshold?: unknown;
    };
    return patternsResultSchema.parse({
      kind: "insufficient",
      current: typeof sentinel.current === "number" ? sentinel.current : 0,
      threshold: typeof sentinel.threshold === "number" ? sentinel.threshold : 0,
      message: typeof sentinel.error === "string" ? sentinel.error : "Not enough data yet.",
    });
  }

  return patternsResultSchema.parse({ kind: "ok", patterns: parsed });
}
