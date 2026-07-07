/**
 * Report parser unit tests (M3). Two layers, like the M0/M1 suites:
 * - committed synthetic fixtures (invented companies) exercising the known
 *   surface drift found in real reports (accented/Spanish header keys, space
 *   before the colon, PDF prose vs path vs ❌, combined `E-F)` blocks,
 *   missing Machine Summary / Score Global);
 * - a gitignored runtime snapshot of every real report (copy-fixtures.ts),
 *   asserting the parser handles all of them — skipped without CAREER_OPS_PATH.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  atsVendorFromUrl,
  bucketLocation,
  parseReport,
  reportFacet,
} from "@/lib/parsers/report";
import { archetypeFamilies } from "@/lib/filters";

const SYNTH = path.join(process.cwd(), "tests", "fixtures", "synthetic", "reports");
const REAL = path.join(process.cwd(), "tests", "fixtures", "real", "reports");

function loadSynthetic(name: string, num: number) {
  const content = readFileSync(path.join(SYNTH, name), "utf8");
  return parseReport({ content, path: `reports/${name}`, num });
}

describe("parseReport — synthetic full report", () => {
  const report = loadSynthetic("001-nimbus-labs-2026-06-01.md", 1);

  it("parses the title and header key-values", () => {
    expect(report.title).toBe("Évaluation : Nimbus Labs — Design Engineer");
    expect(report.header.date).toBe("2026-06-01");
    expect(report.header.score).toBe("4.4/5");
    expect(report.header.legitimacy).toBe("High Confidence");
    expect(report.header.url).toContain("jobs.lever.co/nimbus-labs");
    expect(report.header.pdf).toContain("cv-test-candidate-nimbus-labs");
    expect(report.header.batchId).toBe("001-nimbus-labs");
    expect(report.header.verification).toContain("active");
  });

  it("parses the Machine Summary YAML", () => {
    expect(report.machineSummary).not.toBeNull();
    expect(report.machineSummary?.company).toBe("Nimbus Labs");
    expect(report.machineSummary?.score).toBe(4.4);
    expect(report.machineSummary?.final_decision).toBe("Apply");
    expect(report.machineSummary?.hard_stops).toEqual([]);
    expect(report.machineSummary?.soft_gaps).toHaveLength(1);
    expect(report.machineSummary?.top_strengths).toHaveLength(2);
    expect(report.machineSummary?.risk_level).toBe("Low");
    expect(report.machineSummary?.confidence).toBe("High");
    expect(report.machineSummary?.next_action).toContain("Lever");
  });

  it("parses the Score Global table with the Global row", () => {
    const sg = report.scoreGlobal;
    expect(sg).not.toBeNull();
    expect(sg?.rows.map((r) => r.dimension)).toEqual([
      "Match avec CV",
      "Alineación North Star",
      "Comp",
      "Red flags",
    ]);
    expect(sg?.rows[0].score).toBe("4.5/5");
    expect(sg?.global?.score).toBe("4.4/5");
    expect(sg?.global?.comment).toContain("APPLY");
  });

  it("splits blocks with letters (incl. combined E-F) and excludes MS/Score Global", () => {
    const letters = report.blocks.map((b) => b.letter);
    expect(letters).toContain("A");
    expect(letters).toContain("B");
    expect(letters).toContain("E-F");
    expect(letters).toContain("G");
    // Unlettered sections are kept, with letter null.
    const unlettered = report.blocks.filter((b) => b.letter === null);
    expect(unlettered.map((b) => b.title)).toContain("Red Flags / Points ouverts");
    // Machine Summary and Score Global never appear as blocks.
    const titles = report.blocks.map((b) => b.title.toLowerCase());
    expect(titles.some((t) => t.startsWith("machine summary"))).toBe(false);
    expect(titles.some((t) => t === "score global")).toBe(false);
  });

  it("keeps GFM table markdown inside blocks", () => {
    const blockA = report.blocks.find((b) => b.letter === "A");
    expect(blockA?.markdown).toContain("| Champ | Détail |");
  });

  it("derives atsVendor and locationBucket", () => {
    expect(report.atsVendor).toBe("Lever");
    expect(report.locationBucket).toBe("EU");
  });

  it("derives the filter facet", () => {
    const facet = reportFacet(report);
    expect(facet.num).toBe(1);
    expect(facet.archetype).toContain("Design Engineer");
    expect(facet.atsVendor).toBe("Lever");
    expect(facet.locationBucket).toBe("EU");
  });
});

describe("parseReport — degraded synthetic report (F2 AC)", () => {
  const report = loadSynthetic("002-vectorline-2026-06-02.md", 2);

  it("tolerates space-before-colon and Spanish/accented header keys", () => {
    expect(report.header.date).toBe("2026-06-02");
    expect(report.header.archetype).toContain("Frontend Engineer");
    expect(report.header.score).toBe("3.1/5");
    expect(report.header.legitimacy).toBe("Proceed with Caution");
    expect(report.header.url).toContain("greenhouse.io");
  });

  it("keeps prose PDF headers as raw text", () => {
    expect(report.header.pdf).toContain("not generated");
  });

  it("returns null Machine Summary and Score Global without throwing", () => {
    expect(report.machineSummary).toBeNull();
    expect(report.scoreGlobal).toBeNull();
  });

  it("falls back to zero blocks but preserves the raw markdown", () => {
    expect(report.blocks).toHaveLength(0);
    expect(report.markdown).toContain("dégradation");
  });

  it("still derives the vendor from the URL", () => {
    expect(report.atsVendor).toBe("Greenhouse");
  });
});

describe("atsVendorFromUrl", () => {
  it("maps known ATS hosts", () => {
    expect(atsVendorFromUrl("https://jobs.lever.co/acme/123")).toBe("Lever");
    expect(atsVendorFromUrl("https://job-boards.greenhouse.io/acme/jobs/1")).toBe("Greenhouse");
    expect(atsVendorFromUrl("https://boards.greenhouse.io/acme/jobs/1")).toBe("Greenhouse");
    expect(atsVendorFromUrl("https://jobs.ashbyhq.com/acme/uuid")).toBe("Ashby");
    expect(atsVendorFromUrl("https://acme.wd3.myworkdayjobs.com/x")).toBe("Workday");
  });

  it("falls back to a capitalized host label for unknown hosts", () => {
    expect(atsVendorFromUrl("https://jobicy.com/jobs/123-role")).toBe("Jobicy");
    expect(atsVendorFromUrl("https://careers.acme.dev/role")).toBe("Acme");
  });

  it("returns null for missing or malformed URLs", () => {
    expect(atsVendorFromUrl(undefined)).toBeNull();
    expect(atsVendorFromUrl("not a url")).toBeNull();
  });
});

describe("bucketLocation", () => {
  it("buckets Remote, EU, US, Other", () => {
    expect(bucketLocation("Remote-Friendly (Travel-Required) / SF / NYC")).toBe("Remote");
    expect(bucketLocation("Paris, France (hybride)")).toBe("EU");
    expect(bucketLocation("Lisbonne (on-site/hybride)")).toBe("EU");
    expect(bucketLocation("San Francisco, CA")).toBe("US");
    expect(bucketLocation("Tokyo, Japan")).toBe("Other");
    expect(bucketLocation(undefined)).toBeNull();
  });
});

describe("archetypeFamilies", () => {
  it("reduces raw archetypes to short families", () => {
    expect(archetypeFamilies("Frontend Engineer (React/Next.js)")).toEqual([
      "Frontend Engineer",
    ]);
    expect(
      archetypeFamilies(
        "Frontend Engineer (React/Next.js) + Design Engineer (UI/Motion)",
      ),
    ).toEqual(["Frontend Engineer", "Design Engineer"]);
    expect(archetypeFamilies("Design Engineer (UI) — SENIOR")).toEqual([
      "Design Engineer",
    ]);
    expect(
      archetypeFamilies("Fullstack Engineer (TypeScript) [hybride Frontend (React/Next.js)]"),
    ).toEqual(["Fullstack Engineer"]);
    expect(archetypeFamilies(null)).toEqual([]);
  });
});

const realReports = existsSync(REAL)
  ? readdirSync(REAL).filter((f) => f.endsWith(".md"))
  : [];

describe.skipIf(realReports.length === 0)("parseReport — every real report", () => {
  it("parses all reports with header URL + Machine Summary + Score Global", () => {
    expect(realReports.length).toBeGreaterThan(0);
    for (const file of realReports) {
      const num = Number.parseInt(file.slice(0, file.indexOf("-")), 10);
      const content = readFileSync(path.join(REAL, file), "utf8");
      const report = parseReport({ content, path: `reports/${file}`, num });

      expect(report.title, file).not.toBe("");
      expect(report.header.url, file).toMatch(/^https?:\/\//);
      expect(report.header.score, file).toMatch(/^\d(\.\d+)?\/5/);
      // Every real report so far carries both — if a future one doesn't,
      // the parser must still return null rather than throw.
      expect(report.machineSummary, file).not.toBeNull();
      expect(report.scoreGlobal, file).not.toBeNull();
      expect(report.scoreGlobal?.rows.length, file).toBeGreaterThan(0);
      expect(report.blocks.length, file).toBeGreaterThan(0);
      expect(report.atsVendor, file).not.toBeNull();
    }
  });

  it("detects lettered blocks in every real report", () => {
    for (const file of realReports) {
      const num = Number.parseInt(file.slice(0, file.indexOf("-")), 10);
      const content = readFileSync(path.join(REAL, file), "utf8");
      const report = parseReport({ content, path: `reports/${file}`, num });
      const lettered = report.blocks.filter((b) => b.letter !== null);
      expect(lettered.length, file).toBeGreaterThan(0);
    }
  });
});
