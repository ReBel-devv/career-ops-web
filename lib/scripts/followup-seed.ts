import { z } from "zod";
import { runRepoScript } from "./exec";

/**
 * `node followup-seed.mjs <num> --date <date> --json` — pins the first
 * follow-up date when a tracker row turns Applied (plan §4.1 item 6).
 * The script appends a pin directive to data/follow-ups.md under its own
 * follow-ups lock; it never claims a follow-up was sent.
 */

export const followupSeedResultSchema = z.looseObject({
  seeded: z.boolean(),
  appNum: z.number().optional(),
  pin: z.string().nullable().optional(),
  nextDate: z.string().optional(),
  appliedDate: z.string().optional(),
  setDate: z.string().optional(),
  reason: z.string().optional(),
});

export type FollowupSeedResult = z.infer<typeof followupSeedResultSchema>;

export type FollowupSeedOutcome =
  | { ran: true; result: FollowupSeedResult }
  | { ran: true; error: string }
  | { ran: false };

export async function runFollowupSeed(
  repoPath: string,
  appNum: number,
  date: string,
): Promise<FollowupSeedOutcome> {
  try {
    const { code, stdout, stderr } = await runRepoScript(
      repoPath,
      "followup-seed.mjs",
      [String(appNum), "--date", date, "--json"],
    );
    // The script prints exactly one JSON line on stdout (success or error).
    const line = stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("{"))
      .at(-1);
    if (code !== 0 || line === undefined) {
      return {
        ran: true,
        error:
          line ?? stderr.trim() ?? `followup-seed.mjs exited with code ${code}`,
      };
    }
    return { ran: true, result: followupSeedResultSchema.parse(JSON.parse(line)) };
  } catch (err: unknown) {
    return {
      ran: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
