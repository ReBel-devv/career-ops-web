import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFollowUpLog } from "@/lib/writers";
import { runFollowupReschedule } from "@/lib/scripts";
import { latestPins, parseFollowUps } from "@/lib/parsers/follow-ups";
import {
  createTempRepo,
  dataRepoPath,
  SYNTHETIC_TRACKER,
  type TempRepo,
} from "./helpers/temp-repo";

/**
 * Follow-up write tests against TEMP COPIES only — the real repo is never
 * touched. Covers the F6 AC: never edits existing lines (byte-prefix), the
 * file still parses after writes, reschedule appends a pin, log appends a row.
 */
const repo = dataRepoPath();

const FOLLOWUPS_SEED = [
  "# Follow-ups",
  "",
  "| num | appNum | date | company | role | channel | contact | notes |",
  "|---|---|---|---|---|---|---|---|",
  "- next #1 2026-07-08 (set 2026-07-01)",
  "",
].join("\n");

describe.skipIf(!repo)("follow-up writes (temp copy)", () => {
  let temp: TempRepo;
  let followupsPath: string;

  beforeEach(async () => {
    temp = await createTempRepo(repo as string, SYNTHETIC_TRACKER);
    followupsPath = path.join(temp.root, "data", "follow-ups.md");
    await fs.writeFile(followupsPath, FOLLOWUPS_SEED);
  });

  afterEach(async () => {
    await temp.cleanup();
  });

  it("appendFollowUpLog adds exactly one row, byte-prefix preserved", async () => {
    const original = await fs.readFile(followupsPath, "utf8");
    const result = await appendFollowUpLog({
      repoPath: temp.root,
      appNum: 1,
      company: "Nimbus Labs",
      role: "Design Engineer",
      date: "2026-07-15",
      channel: "email",
      contact: "recruiter@nimbus.example",
      notes: "Checked in on timeline",
    });
    const updated = await fs.readFile(followupsPath, "utf8");

    // Never edits existing lines: the original is an exact byte prefix.
    expect(updated.startsWith(original)).toBe(true);
    const suffix = updated.slice(original.length);
    expect(suffix).toBe(
      `| ${result.num} | 1 | 2026-07-15 | Nimbus Labs | Design Engineer | email | recruiter@nimbus.example | Checked in on timeline |\n`,
    );

    // File still parses AND carries the new row.
    const parsed = parseFollowUps(updated);
    const row = parsed.logs.find((l) => l.num === result.num);
    expect(row).toMatchObject({ appNum: 1, date: "2026-07-15", channel: "email" });
    // Existing pin survives untouched.
    expect(latestPins(parsed).get(1)?.date).toBe("2026-07-08");
  });

  it("log num is max existing + 1 across successive appends", async () => {
    const first = await appendFollowUpLog({
      repoPath: temp.root,
      appNum: 1,
      company: "Nimbus Labs",
      role: "Design Engineer",
      date: "2026-07-15",
    });
    const second = await appendFollowUpLog({
      repoPath: temp.root,
      appNum: 2,
      company: "Vectorline",
      role: "Frontend Engineer",
      date: "2026-07-16",
    });
    expect(first.num).toBe(1);
    expect(second.num).toBe(2);
    expect(parseFollowUps(await fs.readFile(followupsPath, "utf8")).logs).toHaveLength(2);
  });

  it("sanitizes pipes/newlines so the appended row never breaks the table", async () => {
    const result = await appendFollowUpLog({
      repoPath: temp.root,
      appNum: 1,
      company: "Nimbus Labs",
      role: "Design Engineer",
      notes: "line1\nline2 | pipe here",
    });
    const parsed = parseFollowUps(await fs.readFile(followupsPath, "utf8"));
    const row = parsed.logs.find((l) => l.num === result.num);
    // The row parses as one cell — the pipe became " / ", the newline a space.
    expect(row?.notes).toBe("line1 line2 / pipe here");
  });

  it("reschedule appends exactly one pin landing on the requested date", async () => {
    const original = await fs.readFile(followupsPath, "utf8");
    const out = await runFollowupReschedule(temp.root, 1, "2026-08-01", 7);
    expect(out).toEqual({ ok: true, date: "2026-08-01" });

    const updated = await fs.readFile(followupsPath, "utf8");
    // Append-only: original preserved as a byte prefix.
    expect(updated.startsWith(original)).toBe(true);
    const added = updated.slice(original.length).trim().split("\n").filter(Boolean);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(/^- next #1 2026-08-01 \(set \d{4}-\d{2}-\d{2}\)$/);

    // Last-wins: the new pin overrides the seeded one.
    const parsed = parseFollowUps(updated);
    expect(latestPins(parsed).get(1)?.date).toBe("2026-08-01");
  });

  it("reschedule creates follow-ups.md when absent", async () => {
    await fs.rm(followupsPath, { force: true });
    const out = await runFollowupReschedule(temp.root, 1, "2026-09-10", 7);
    expect(out).toEqual({ ok: true, date: "2026-09-10" });
    const parsed = parseFollowUps(await fs.readFile(followupsPath, "utf8"));
    expect(latestPins(parsed).get(1)?.date).toBe("2026-09-10");
  });
});
