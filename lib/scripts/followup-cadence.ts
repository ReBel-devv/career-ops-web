import {
  EMPTY_CADENCE,
  followUpCadenceSchema,
  type FollowUpCadence,
} from "@/lib/domain";
import { runRepoScript } from "./exec";

/**
 * `node followup-cadence.mjs --json` — the single source of truth for
 * follow-up cadence (plan §4.3). We NEVER recompute cadence in the web app;
 * this shells the script and zod-validates the JSON at the boundary.
 *
 * Latency: the script only reads applications.md + follow-ups.md (no network,
 * no LLM) and returns in ~40 ms on the real 33-row tracker, so plan §8 risk 6's
 * mtime cache is not warranted here (measured — the guidance is "apply if
 * warranted"). Reads are cheap and the data is living, so we always run fresh.
 */
export async function runFollowupCadence(
  repoPath: string,
): Promise<FollowUpCadence> {
  const { code, stdout, stderr } = await runRepoScript(
    repoPath,
    "followup-cadence.mjs",
    ["--json"],
  );

  // The script prints one JSON document on stdout. On an empty tracker it
  // prints `{ error: "No applications found..." }` and exits 1.
  const trimmed = stdout.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(
      `followup-cadence.mjs did not return JSON (exit ${code}): ${
        stderr.trim() || trimmed.slice(0, 200)
      }`,
    );
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    "error" in parsed &&
    !("entries" in parsed)
  ) {
    // Empty / missing tracker — a valid state, not a failure.
    return EMPTY_CADENCE;
  }

  return followUpCadenceSchema.parse(parsed);
}
