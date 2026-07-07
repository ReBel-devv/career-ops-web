/**
 * M1 write-back tests — the top-priority suite of the milestone (plan §10).
 * Every test runs against a TEMP COPY of a tracker (tests/helpers/temp-repo);
 * the real data repo is only ever read. Suites skip without CAREER_OPS_PATH
 * (the scripts and the real-tracker fixture come from it).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FsDataSource, loadTrackerParse, loadTrackerUtils } from "@/lib/data";
import { runVerifyPipeline } from "@/lib/scripts";
import {
  trackerLockDirFor,
  TrackerWriteError,
  writeTrackerCell,
} from "@/lib/writers";
import {
  createTempRepo,
  dataRepoPath,
  readRealTracker,
  SYNTHETIC_TRACKER,
  type TempRepo,
} from "./helpers/temp-repo";

const REPO = dataRepoPath();

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

async function tempRepo(tracker: string): Promise<TempRepo> {
  const repo = await createTempRepo(REPO!, tracker);
  cleanups.push(repo.cleanup);
  return repo;
}

function read(repo: TempRepo): string {
  return readFileSync(repo.trackerPath, "utf8");
}

async function expectWriteError(
  promise: Promise<unknown>,
  code: string,
): Promise<TrackerWriteError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(TrackerWriteError);
    expect((err as TrackerWriteError).code).toBe(code);
    return err as TrackerWriteError;
  }
  throw new Error(`Expected TrackerWriteError(${code}) but the write succeeded`);
}

describe.skipIf(!REPO)("tracker-writer — golden-file writes", () => {
  it("synthetic: one status write changes exactly one cell, byte-for-byte", async () => {
    const repo = await tempRepo(SYNTHETIC_TRACKER);
    const before = read(repo);

    await writeTrackerCell({
      repoPath: repo.root,
      num: 2,
      expected: { company: "Vectorline", role: "Frontend Engineer" },
      status: "Interview",
    });

    const after = read(repo);
    const expected = before.replace(
      "| 2 | 2026-06-02 | Vectorline | Frontend Engineer | 3.1/5 | Evaluated |",
      "| 2 | 2026-06-02 | Vectorline | Frontend Engineer | 3.1/5 | Interview |",
    );
    expect(expected).not.toBe(before); // the replacement actually matched
    expect(after).toBe(expected); // byte-identical except the one cell
  });

  it("real tracker copy: one status write, whole file byte-identical except one cell", async () => {
    const original = await readRealTracker(REPO!);
    const repo = await tempRepo(original);
    const trackerParse = await loadTrackerParse(repo.root);
    const lines = original.split("\n");
    const colmap = trackerParse.resolveColumns(lines);

    // First Evaluated row → Interview (any canonical move is legal, Decision 5).
    const targetIdx = lines.findIndex(
      (l) => trackerParse.parseTrackerRow(l, colmap)?.status === "Evaluated",
    );
    expect(targetIdx).toBeGreaterThan(-1);
    const target = trackerParse.parseTrackerRow(lines[targetIdx], colmap)!;

    const result = await writeTrackerCell({
      repoPath: repo.root,
      num: target.num,
      expected: { company: target.company, role: target.role },
      status: "Interview",
    });
    expect(result.row.status).toBe("Interview");

    const afterLines = read(repo).split("\n");
    expect(afterLines).toHaveLength(lines.length);
    const changed = lines
      .map((line, i) => (line !== afterLines[i] ? i : -1))
      .filter((i) => i !== -1);
    expect(changed).toEqual([targetIdx]); // exactly one line differs

    // Within that line, exactly the Status cell differs.
    const beforeCells = lines[targetIdx].split("|").map((s) => s.trim());
    const afterCells = afterLines[targetIdx].split("|").map((s) => s.trim());
    expect(afterCells.length).toBe(beforeCells.length);
    for (let i = 0; i < beforeCells.length; i++) {
      if (i === colmap.status) {
        expect(afterCells[i]).toBe("Interview");
      } else {
        expect(afterCells[i]).toBe(beforeCells[i]);
      }
    }

    // Post-write gate holds on the temp copy.
    const verify = await runVerifyPipeline(repo.root);
    expect(verify.ok).toBe(true);
  });

  it("real tracker: parse→rebuild round-trips every row byte-identically", async () => {
    const original = await readRealTracker(REPO!);
    const [trackerParse, trackerUtils] = await Promise.all([
      loadTrackerParse(REPO!),
      loadTrackerUtils(REPO!),
    ]);
    const lines = original.split("\n");
    const colmap = trackerParse.resolveColumns(lines);
    let rows = 0;
    for (const line of lines) {
      if (!trackerParse.parseTrackerRow(line, colmap)) continue;
      rows++;
      const rebuilt = trackerUtils.rebuildRow(
        line.split("|").map((s) => s.trim()),
      );
      expect(rebuilt).toBe(line);
    }
    expect(rows).toBeGreaterThan(0);
  });

  it("notes write sanitizes pipes and newlines per the tracker's own convention", async () => {
    const repo = await tempRepo(SYNTHETIC_TRACKER);
    const result = await writeTrackerCell({
      repoPath: repo.root,
      num: 1,
      expected: { company: "Nimbus Labs", role: "Design Engineer" },
      notes: "Referred by J. | second round\nbring portfolio",
    });
    expect(result.notesSanitized).toBe(true);
    expect(result.row.notes).toBe("Referred by J. / second round bring portfolio");

    const after = read(repo);
    expect(after).toContain("| Referred by J. / second round bring portfolio |");
    // Still exactly one row changed, still a valid table.
    const changed = SYNTHETIC_TRACKER.split("\n").filter(
      (line, i) => line !== after.split("\n")[i],
    );
    expect(changed).toHaveLength(1);
    expect((await runVerifyPipeline(repo.root)).ok).toBe(true);
  });

  it("accepts a case-insensitive canonical id but writes the canonical label", async () => {
    const repo = await tempRepo(SYNTHETIC_TRACKER);
    const result = await writeTrackerCell({
      repoPath: repo.root,
      num: 2,
      expected: { company: "Vectorline", role: "Frontend Engineer" },
      status: "applied",
    });
    expect(result.row.status).toBe("Applied");
    expect(read(repo)).toContain("| 3.1/5 | Applied |");
  });
});

describe.skipIf(!REPO)("tracker-writer — rejections", () => {
  async function freshRepo(): Promise<TempRepo> {
    return tempRepo(SYNTHETIC_TRACKER);
  }
  const expected = { company: "Vectorline", role: "Frontend Engineer" };

  it("rejects a non-canonical status", async () => {
    const repo = await freshRepo();
    await expectWriteError(
      writeTrackerCell({ repoPath: repo.root, num: 2, expected, status: "Banana" }),
      "INVALID_STATUS",
    );
    expect(read(repo)).toBe(SYNTHETIC_TRACKER);
  });

  it("rejects an alias status (writes are write-canonical)", async () => {
    const repo = await freshRepo();
    await expectWriteError(
      writeTrackerCell({ repoPath: repo.root, num: 2, expected, status: "aplicado" }),
      "INVALID_STATUS",
    );
  });

  it("rejects markdown bold in status", async () => {
    const repo = await freshRepo();
    await expectWriteError(
      writeTrackerCell({ repoPath: repo.root, num: 2, expected, status: "**Applied**" }),
      "INVALID_STATUS",
    );
  });

  it("rejects a date in status", async () => {
    const repo = await freshRepo();
    await expectWriteError(
      writeTrackerCell({
        repoPath: repo.root,
        num: 2,
        expected,
        status: "Applied 2026-07-06",
      }),
      "INVALID_STATUS",
    );
  });

  it("404s an unknown num", async () => {
    const repo = await freshRepo();
    await expectWriteError(
      writeTrackerCell({ repoPath: repo.root, num: 999, expected, status: "Applied" }),
      "NOT_FOUND",
    );
  });

  it("409s a stale expected company/role", async () => {
    const repo = await freshRepo();
    await expectWriteError(
      writeTrackerCell({
        repoPath: repo.root,
        num: 2,
        expected: { company: "Vectorline", role: "A Different Role" },
        status: "Applied",
      }),
      "STALE_ROW",
    );
    expect(read(repo)).toBe(SYNTHETIC_TRACKER);
  });

  it("rejects writing status and notes in one call", async () => {
    const repo = await freshRepo();
    await expectWriteError(
      writeTrackerCell({
        repoPath: repo.root,
        num: 2,
        expected,
        status: "Applied",
        notes: "x",
      }),
      "INVALID_INPUT",
    );
  });
});

describe.skipIf(!REPO)("tracker-writer — verify gate", () => {
  it("restores the original file when verify-pipeline fails post-write", async () => {
    const repo = await tempRepo(SYNTHETIC_TRACKER);
    // Sabotage the temp copy's verify script — the real repo is untouched.
    writeFileSync(
      path.join(repo.root, "verify-pipeline.mjs"),
      "console.log('BOOM'); process.exit(1);\n",
    );
    const err = await expectWriteError(
      writeTrackerCell({
        repoPath: repo.root,
        num: 2,
        expected: { company: "Vectorline", role: "Frontend Engineer" },
        status: "Applied",
      }),
      "VERIFY_FAILED",
    );
    expect(err.detail).toContain("BOOM");
    expect(read(repo)).toBe(SYNTHETIC_TRACKER); // restored byte-for-byte
  });
});

describe.skipIf(!REPO)("tracker-writer — lock protocol", () => {
  it("times out cleanly while a live process holds the CLI's lock dir", async () => {
    const repo = await tempRepo(SYNTHETIC_TRACKER);
    const lockDir = trackerLockDirFor(repo.trackerPath);
    mkdirSync(lockDir);
    writeFileSync(
      path.join(lockDir, "owner.json"),
      JSON.stringify({ pid: process.pid, token: "someone-else" }),
    );
    try {
      await expectWriteError(
        writeTrackerCell({
          repoPath: repo.root,
          num: 2,
          expected: { company: "Vectorline", role: "Frontend Engineer" },
          status: "Applied",
          lock: { timeoutMs: 400, retryMs: 50 },
        }),
        "LOCK_TIMEOUT",
      );
      expect(read(repo)).toBe(SYNTHETIC_TRACKER); // never wrote
    } finally {
      rmSync(lockDir, { recursive: true, force: true });
    }
  });

  it("recovers a stale lock whose owner process is dead (CLI semantics)", async () => {
    const repo = await tempRepo(SYNTHETIC_TRACKER);
    // A pid that existed and is now certainly dead.
    const dead = spawnSync(process.execPath, ["-e", ""]);
    const deadPid = dead.pid ?? 0;
    expect(deadPid).toBeGreaterThan(0);

    const lockDir = trackerLockDirFor(repo.trackerPath);
    mkdirSync(lockDir);
    writeFileSync(
      path.join(lockDir, "owner.json"),
      JSON.stringify({ pid: deadPid, token: "crashed" }),
    );

    const result = await writeTrackerCell({
      repoPath: repo.root,
      num: 2,
      expected: { company: "Vectorline", role: "Frontend Engineer" },
      status: "Applied",
      lock: { timeoutMs: 5_000, retryMs: 50 },
    });
    expect(result.row.status).toBe("Applied");
    expect(read(repo)).toContain("| 3.1/5 | Applied |");
  });
});

describe.skipIf(!REPO)("FsDataSource.updateApplication — side effects", () => {
  it("seeds a follow-up pin when a row transitions to Applied", async () => {
    const repo = await tempRepo(SYNTHETIC_TRACKER);
    const source = new FsDataSource(repo.root);
    const result = await source.updateApplication({
      num: 2,
      expected: { company: "Vectorline", role: "Frontend Engineer" },
      status: "Applied",
    });

    expect(result.application.statusLabel).toBe("Applied");
    expect(result.followupSeed).toBeDefined();
    if (result.followupSeed?.ran !== true || !("result" in result.followupSeed)) {
      throw new Error(
        `followup-seed did not run cleanly: ${JSON.stringify(result.followupSeed)}`,
      );
    }
    expect(result.followupSeed.result.seeded).toBe(true);
    expect(result.followupSeed.result.nextDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const followups = readFileSync(
      path.join(repo.root, "data", "follow-ups.md"),
      "utf8",
    );
    expect(followups).toContain("- next #2 ");
    // No derived DB in the fixture → sync is skipped.
    expect(result.trackerSync).toEqual({ ran: false });
  });

  it("does not seed when the write is not a transition into Applied", async () => {
    const repo = await tempRepo(SYNTHETIC_TRACKER);
    const source = new FsDataSource(repo.root);
    // Row 1 is already Applied — notes write must not seed.
    const result = await source.updateApplication({
      num: 1,
      expected: { company: "Nimbus Labs", role: "Design Engineer" },
      notes: "updated note",
    });
    expect(result.followupSeed).toBeUndefined();
  });
});
