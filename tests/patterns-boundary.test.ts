import { describe, expect, it } from "vitest";
import { runAnalyzePatterns } from "@/lib/scripts";
import { patternsResultSchema } from "@/lib/domain";
import { FsDataSource } from "@/lib/data/fs-data-source";
import { dataRepoPath } from "./helpers/temp-repo";

/**
 * Zod-boundary tests for analyze-patterns.mjs + the Discovery readers
 * (established M4 pattern): run against the REAL repo when CAREER_OPS_PATH is
 * set, otherwise skip so CI without the private repo stays green. Everything
 * here is READ-ONLY against the data repo.
 */
const repo = dataRepoPath();

describe.skipIf(!repo)("runAnalyzePatterns — zod boundary (real script)", () => {
  it("validates the real script output against the schema", async () => {
    const result = await runAnalyzePatterns(repo as string);
    expect(() => patternsResultSchema.parse(result)).not.toThrow();

    if (result.kind === "insufficient") {
      // Young tracker — the sentinel itself is the contract.
      expect(result.threshold).toBeGreaterThan(0);
      expect(result.message.length).toBeGreaterThan(0);
      return;
    }

    const { patterns } = result;
    expect(patterns.metadata.total).toBeGreaterThan(0);
    // funnel is a dynamic status→count record; counts must sum to the total.
    const funnelSum = Object.values(patterns.funnel).reduce((a, b) => a + b, 0);
    expect(funnelSum).toBe(patterns.metadata.total);
    expect(patterns.vendorAnalysis.minSampleForClaim).toBeGreaterThan(0);
    for (const entry of patterns.vendorAnalysis.breakdown) {
      expect(entry.total).toBeGreaterThan(0);
      expect(entry.sufficientSample).toBe(
        entry.total >= patterns.vendorAnalysis.minSampleForClaim,
      );
    }
    for (const rec of patterns.recommendations) {
      expect(rec.action.length).toBeGreaterThan(0);
      expect(rec.reasoning.length).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!repo)("Discovery readers — real repo (read-only)", () => {
  it("parses the real data/pipeline.md into pending + processed items", async () => {
    const source = new FsDataSource(repo as string);
    const items = await source.getPipelineItems();
    // The parser must never lose a recognized line's content.
    for (const item of items) {
      expect(item.raw.trim().startsWith("-")).toBe(true);
      // A processed `[x]` line may legitimately carry no report number — the
      // real inbox marks pre-screened-out URLs `- [x] #-- | url | skipped …`.
      // So reportNum is either absent or a positive integer, never bogus.
      if (item.reportNum !== null) {
        expect(item.reportNum).toBeGreaterThan(0);
      }
    }
    // Sections must be internally consistent.
    expect(
      items.every((i) => i.section === "pending" || i.section === "processed"),
    ).toBe(true);
  });

  it("reads the real scan history", async () => {
    const source = new FsDataSource(repo as string);
    const records = await source.getScanHistory();
    for (const record of records) {
      expect(record.url.length).toBeGreaterThan(0);
      expect(record.firstSeen).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
