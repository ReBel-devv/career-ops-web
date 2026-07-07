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
  force = false,
): Promise<FollowupSeedOutcome> {
  try {
    const args = [String(appNum), "--date", date, "--json"];
    if (force) args.push("--force");
    const { code, stdout, stderr } = await runRepoScript(
      repoPath,
      "followup-seed.mjs",
      args,
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

/** Add `days` (may be negative) to a YYYY-MM-DD date using UTC arithmetic —
 * bit-identical to followup-cadence.mjs's `parseDate` + `addDays`, so the pin
 * followup-seed computes (`appliedDate + applied_first`) lands EXACTLY on the
 * requested next date when we pass `appliedDate = nextDate - applied_first`. */
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Reschedule a follow-up to land its next-date on `nextDate` (WYSIWYG — what
 * the user picks on the calendar is where the pin lands). Uses followup-seed's
 * append-only pin (last-wins), never editing existing lines. Because the script
 * always writes `pin = appliedDate + applied_first`, we invert that: pass
 * `--date (nextDate - applied_first) --force`. `--force` bypasses the
 * Applied-status and idempotency guards (a reschedule is an explicit override).
 */
export async function runFollowupReschedule(
  repoPath: string,
  appNum: number,
  nextDate: string,
  appliedFirstDays: number,
): Promise<{ ok: true; date: string } | { ok: false; error: string }> {
  const appliedDate = addDaysISO(nextDate, -appliedFirstDays);
  const outcome = await runFollowupSeed(repoPath, appNum, appliedDate, true);
  if (!("result" in outcome)) {
    return {
      ok: false,
      error: "error" in outcome ? outcome.error : "followup-seed did not run",
    };
  }
  if (!outcome.result.seeded) {
    return {
      ok: false,
      error: `followup-seed did not write a pin (${outcome.result.reason ?? "unknown"})`,
    };
  }
  const landed = outcome.result.nextDate;
  if (landed !== nextDate) {
    return {
      ok: false,
      error: `Rescheduled pin landed on ${landed}, expected ${nextDate} (cadence applied_first drift).`,
    };
  }
  return { ok: true, date: nextDate };
}
