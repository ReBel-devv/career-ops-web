import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { runRepoScript } from "./exec";

/**
 * `node tracker.mjs sync` — rebuilds the derived SQLite index after a
 * successful tracker write (plan §4.1 item 7). Only runs when the index
 * (`data/applications.db`) already exists; the DB is opt-in and derived,
 * so we never create it ourselves.
 */

export const trackerSyncOutcomeSchema = z.object({
  ran: z.boolean(),
  ok: z.boolean().optional(),
  output: z.string().optional(),
});

export type TrackerSyncOutcome = z.infer<typeof trackerSyncOutcomeSchema>;

export async function runTrackerSync(
  repoPath: string,
): Promise<TrackerSyncOutcome> {
  if (!existsSync(path.join(repoPath, "data", "applications.db"))) {
    return trackerSyncOutcomeSchema.parse({ ran: false });
  }
  try {
    const { code, stdout, stderr } = await runRepoScript(repoPath, "tracker.mjs", [
      "sync",
    ]);
    const output = [stdout, stderr]
      .filter((s) => s.trim() !== "")
      .join("\n")
      .trim();
    return trackerSyncOutcomeSchema.parse({ ran: true, ok: code === 0, output });
  } catch (err: unknown) {
    return trackerSyncOutcomeSchema.parse({
      ran: true,
      ok: false,
      output: err instanceof Error ? err.message : String(err),
    });
  }
}
