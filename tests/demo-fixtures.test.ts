import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_APPS } from "@/fixtures/apps";
import { DEMO_REPORTS } from "@/fixtures/reports";
import { DEMO_FOLLOW_UP_SEEDS } from "@/fixtures/follow-ups";
import { buildDemoOutreach } from "@/fixtures/outreach";
import { DEMO_PIPELINE_MD, DEMO_SCAN_HISTORY } from "@/fixtures/discovery";
import { DEMO_DOCUMENTS, buildDemoPdf, getDemoPdf } from "@/fixtures/pdfs";
import { DemoDataSource } from "@/lib/data/demo-data-source";
import { patternsResultSchema } from "@/lib/domain";

/**
 * M7 fixture integrity + PRIVACY diff-check.
 *
 * The privacy block proves ZERO overlap between the demo fixtures and the real
 * tracker: no real company name may appear anywhere in the fixture dataset.
 * It runs against the gitignored real-tracker snapshot (copy-fixtures global
 * setup) and skips on machines/CI without the private repo — where the
 * committed-file privacy guard (scripts/privacy-guard.mjs) still runs.
 */

const REAL_TRACKER = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "real",
  "data",
  "applications.md",
);
const hasRealData = existsSync(REAL_TRACKER);

/** All fictional text shipped by the demo, concatenated for substring checks. */
function allFixtureText(): string {
  const parts: string[] = [
    JSON.stringify(DEMO_APPS),
    ...DEMO_REPORTS.map((r) => r.content),
    JSON.stringify(DEMO_FOLLOW_UP_SEEDS),
    JSON.stringify(buildDemoOutreach()),
    DEMO_PIPELINE_MD,
    JSON.stringify(DEMO_SCAN_HISTORY),
    JSON.stringify(DEMO_DOCUMENTS),
  ];
  return parts.join("\n").toLowerCase();
}

/** Company names from a tracker markdown table (column 3). */
function trackerCompanies(content: string): string[] {
  const companies = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    // | num | date | company | ... — cells[0] is empty before the first pipe.
    const company = cells[3];
    const num = cells[1];
    if (!company || !/^\d+$/.test(num ?? "")) continue;
    companies.add(company.toLowerCase());
  }
  return [...companies];
}

describe.skipIf(!hasRealData)("demo fixtures — zero overlap with real data", () => {
  it("no real tracker company appears anywhere in the fixture set", () => {
    const real = trackerCompanies(readFileSync(REAL_TRACKER, "utf8"));
    expect(real.length).toBeGreaterThan(0);
    const text = allFixtureText();
    const leaked = real.filter((company) => text.includes(company));
    expect(leaked).toEqual([]);
  });

  it("no real report filename slug appears in the fixture set", () => {
    const realReports = path.join(process.cwd(), "tests", "fixtures", "real", "reports");
    if (!existsSync(realReports)) return;
    const text = allFixtureText();
    const leaked = readdirSync(realReports)
      .filter((f) => f.endsWith(".md"))
      // strip NNN- prefix and -YYYY-MM-DD.md suffix → the company/role slug
      .map((f) => f.replace(/^\d+-/, "").replace(/-\d{4}-\d{2}-\d{2}\.md$/, ""))
      .filter((slug) => slug.length > 3 && text.includes(slug));
    expect(leaked).toEqual([]);
  });
});

describe("demo fixtures — dataset shape", () => {
  it("ships ~30 applications with unique nums covering all 8 states", () => {
    expect(DEMO_APPS.length).toBeGreaterThanOrEqual(28);
    const nums = DEMO_APPS.map((a) => a.num);
    expect(new Set(nums).size).toBe(nums.length);
    const states = new Set(DEMO_APPS.map((a) => a.statusId));
    for (const id of [
      "evaluated", "applied", "responded", "interview",
      "offer", "rejected", "discarded", "skip",
    ]) {
      expect(states, `missing state ${id}`).toContain(id);
    }
  });

  it("every reportPath has a matching demo report and vice versa", () => {
    const withReports = DEMO_APPS.filter((a) => a.reportPath !== null);
    expect(withReports.length).toBeGreaterThanOrEqual(6);
    const byNum = new Map(DEMO_REPORTS.map((r) => [r.num, r]));
    for (const app of withReports) {
      expect(byNum.get(app.num)?.path, `report for #${app.num}`).toBe(app.reportPath);
    }
    const appNums = new Set(DEMO_APPS.map((a) => a.num));
    for (const report of DEMO_REPORTS) {
      expect(appNums, `orphan report #${report.num}`).toContain(report.num);
    }
  });

  it("every demo report parses fully through the real parser", async () => {
    const source = new DemoDataSource();
    for (const fixture of DEMO_REPORTS) {
      const report = await source.getReport(fixture.num);
      expect(report, `report #${fixture.num}`).not.toBeNull();
      expect(report!.machineSummary, `machine summary #${fixture.num}`).not.toBeNull();
      expect(report!.scoreGlobal, `score global #${fixture.num}`).not.toBeNull();
      expect(report!.scoreGlobal!.global).not.toBeNull();
      const letters = report!.blocks.map((b) => b.letter);
      for (const l of ["A", "B", "C", "D", "E", "F", "G"]) {
        expect(letters, `block ${l} in #${fixture.num}`).toContain(l);
      }
      expect(report!.header.url).toBeTruthy();
      expect(report!.atsVendor).toBeTruthy();
      expect(report!.locationBucket).toBeTruthy();
    }
  });

  it("facets cover archetype, vendor, and location diversity", async () => {
    const facets = await new DemoDataSource().getReportFacets();
    expect(facets.length).toBe(DEMO_REPORTS.length);
    const vendors = new Set(facets.map((f) => f.atsVendor));
    expect(vendors.size).toBeGreaterThanOrEqual(3);
    const buckets = new Set(facets.map((f) => f.locationBucket));
    expect(buckets.size).toBeGreaterThanOrEqual(3);
    const archetypes = new Set(facets.map((f) => f.archetype));
    expect(archetypes.size).toBeGreaterThanOrEqual(3);
  });

  it("derived patterns validate and show both grayed and sufficient vendor bars", async () => {
    const result = await new DemoDataSource().getPatterns();
    const parsed = patternsResultSchema.parse(result);
    expect(parsed.kind).toBe("ok");
    if (parsed.kind !== "ok") return;
    expect(parsed.patterns.metadata.total).toBe(DEMO_APPS.length);
    const flags = parsed.patterns.vendorAnalysis.breakdown.map((b) => b.sufficientSample);
    expect(flags).toContain(true);
    expect(flags).toContain(false);
    expect(parsed.patterns.recommendations.length).toBeGreaterThanOrEqual(1);
  });

  it("cadence is dynamic: overdue, due-today, and upcoming entries exist", async () => {
    const cadence = await new DemoDataSource().getFollowUpCadence();
    const urgencies = new Set(cadence.entries.map((e) => e.urgency));
    expect(urgencies).toContain("overdue");
    expect(urgencies).toContain("urgent"); // due today
    expect(urgencies).toContain("waiting");
    // Every actionable app got an entry; dates are offsets from *today*.
    expect(cadence.metadata.actionable).toBe(cadence.entries.length);
    const today = new Date().toISOString().slice(0, 10);
    expect(cadence.metadata.analysisDate).toBe(today);
  });

  it("follow-up seeds only reference actionable demo apps", () => {
    const actionable = new Set(
      DEMO_APPS.filter((a) =>
        ["applied", "responded", "interview"].includes(a.statusId),
      ).map((a) => a.num),
    );
    for (const seed of DEMO_FOLLOW_UP_SEEDS) {
      expect(actionable, `seed #${seed.appNum}`).toContain(seed.appNum);
    }
  });

  it("seeded follow-up logs carry dynamic dates and feed the log table", async () => {
    const { logs } = await new DemoDataSource().getFollowUps();
    expect(logs.length).toBeGreaterThanOrEqual(3);
    const nums = logs.map((l) => l.num);
    expect(new Set(nums).size).toBe(nums.length);
  });

  it("demo documents resolve to valid generated PDFs", () => {
    for (const docs of Object.values(DEMO_DOCUMENTS)) {
      for (const doc of docs) {
        const pdf = getDemoPdf(doc.fileName);
        expect(pdf, doc.fileName).not.toBeNull();
        expect(pdf!.subarray(0, 5).toString("utf8")).toBe("%PDF-");
        expect(pdf!.toString("utf8")).toContain("%%EOF");
      }
    }
  });

  it("buildDemoPdf escapes parentheses and produces a parsable xref", () => {
    const pdf = buildDemoPdf(["Title (demo)", "Line 2"]).toString("utf8");
    expect(pdf).toContain("\\(demo\\)");
    const startxref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe("xref");
  });

  it("outreach seeds cover multiple stages and keep app #1 populated", () => {
    const doc = buildDemoOutreach();
    expect(doc.applications["1"]?.length).toBeGreaterThanOrEqual(1);
    const stages = new Set(
      Object.values(doc.applications).flat().map((c) => c.stage),
    );
    expect(stages.size).toBeGreaterThanOrEqual(4);
    const appNums = new Set(DEMO_APPS.map((a) => a.num));
    for (const key of Object.keys(doc.applications)) {
      expect(appNums, `outreach app ${key}`).toContain(Number(key));
    }
  });
});
