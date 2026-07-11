import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isReportFile } from "@/lib/parsers/report";
import { FsDataSource } from "@/lib/data/fs-data-source";

/**
 * Reservation sentinels (`NNN-RESERVED.md`, zero-byte markers written by
 * reserve-report-num.mjs during parallel fan-outs) must never be treated as
 * reports. Regression for the 3 suites that scanned "every real report" and
 * broke on a stale sentinel copied into the fixture snapshot.
 */

describe("isReportFile", () => {
  it("accepts real report filenames", () => {
    expect(isReportFile("001-nimbus-labs-2026-06-01.md")).toBe(true);
    expect(isReportFile("054-acme-frontend-2026-07-11.md")).toBe(true);
  });

  it("rejects reservation sentinels and non-report files", () => {
    expect(isReportFile("054-RESERVED.md")).toBe(false);
    expect(isReportFile("054-reserved.md")).toBe(false); // case-insensitive
    expect(isReportFile("README.md")).toBe(false);
    expect(isReportFile("notes.txt")).toBe(false);
    expect(isReportFile("054-acme.txt")).toBe(false);
  });
});

describe("FsDataSource.getReportFacets — ignores reservation sentinels", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "career-ops-reports-test-"));
    await fs.mkdir(path.join(root, "reports"), { recursive: true });
    // One real report (URL → atsVendor) …
    await fs.writeFile(
      path.join(root, "reports", "001-larkspur-2026-07-01.md"),
      "# Évaluation : Larkspur — Frontend Engineer\n\n**URL:** https://jobs.lever.co/larkspur/123\n",
      "utf8",
    );
    // … and a zero-byte reservation sentinel that must be ignored.
    await fs.writeFile(path.join(root, "reports", "002-RESERVED.md"), "", "utf8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns a facet for the real report only, never the sentinel", async () => {
    const facets = await new FsDataSource(root).getReportFacets();
    expect(facets.map((f) => f.num)).toEqual([1]);
    expect(facets[0].atsVendor).toBe("Lever");
  });
});
