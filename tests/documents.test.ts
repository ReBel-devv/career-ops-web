/**
 * Document matching heuristics (M3, plan §4.5 / risk 7): pdf-index.tsv is the
 * authoritative CV mapping; cover letters match by company-slug filename
 * convention; only files actually present are ever returned; no match →
 * empty list (the UI shows an honest "No document found").
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  companySlugFromReportFilename,
  matchDocuments,
  parsePdfIndex,
} from "@/lib/parsers/documents";

const REAL_DIR = path.join(process.cwd(), "tests", "fixtures", "real");

const INDEX = [
  "# report\tpdf\thtml\tformat\tdate — written by generate-pdf.mjs, do not edit",
  "001\toutput/cv-x-nimbus-labs-2026-06-01.pdf\toutput/cv-x-nimbus-labs.html\ta4\t2026-06-01",
  "\toutput/nimbus-labs-design-engineer-cover.pdf\t\ta4\t2026-06-01",
  "013\toutput/cv-x-emberfield-2026-07-05.pdf\toutput/cv-x-emberfield.html\ta4\t2026-07-05",
].join("\n");

const OUTPUT = [
  "cv-x-nimbus-labs-2026-06-01.pdf",
  "nimbus-labs-design-engineer-cover.pdf",
  "cv-x-vectorline-2026-06-02.pdf",
  "vectorline-frontend-engineer-cover.pdf",
];

describe("parsePdfIndex", () => {
  it("parses rows, treating the missing report num as null", () => {
    const entries = parsePdfIndex(INDEX);
    expect(entries).toHaveLength(3);
    expect(entries[0].report).toBe(1);
    expect(entries[1].report).toBeNull();
    expect(entries[1].pdf).toBe("output/nimbus-labs-design-engineer-cover.pdf");
  });
});

describe("companySlugFromReportFilename", () => {
  it("extracts the slug between num and date", () => {
    expect(companySlugFromReportFilename("001-nimbus-labs-2026-06-01.md")).toBe(
      "nimbus-labs",
    );
    expect(
      companySlugFromReportFilename("029-quayside-design-engineer-full-remit-2026-07-06.md"),
    ).toBe("quayside-design-engineer-full-remit");
    expect(companySlugFromReportFilename("notes.md")).toBeNull();
  });
});

describe("matchDocuments", () => {
  const indexEntries = parsePdfIndex(INDEX);

  it("resolves the CV from the index and covers by slug", () => {
    const docs = matchDocuments({
      num: 1,
      reportFilename: "001-nimbus-labs-2026-06-01.md",
      indexEntries,
      outputFiles: OUTPUT,
    });
    expect(docs.map((d) => [d.kind, d.fileName])).toEqual([
      ["cv", "cv-x-nimbus-labs-2026-06-01.pdf"],
      ["cover-letter", "nimbus-labs-design-engineer-cover.pdf"],
    ]);
    expect(docs[0].path).toBe("output/cv-x-nimbus-labs-2026-06-01.pdf");
  });

  it("falls back to a slug match when the index has no row", () => {
    const docs = matchDocuments({
      num: 2,
      reportFilename: "002-vectorline-2026-06-02.md",
      indexEntries,
      outputFiles: OUTPUT,
    });
    expect(docs.map((d) => [d.kind, d.fileName])).toEqual([
      ["cv", "cv-x-vectorline-2026-06-02.pdf"],
      ["cover-letter", "vectorline-frontend-engineer-cover.pdf"],
    ]);
  });

  it("never returns files that are not on disk (index points at a missing pdf)", () => {
    const docs = matchDocuments({
      num: 13,
      reportFilename: "013-emberfield-2026-07-05.md",
      indexEntries,
      outputFiles: OUTPUT, // no emberfield files present
    });
    expect(docs).toEqual([]);
  });

  it("returns empty when there is no report filename and no index row", () => {
    const docs = matchDocuments({
      num: 99,
      reportFilename: null,
      indexEntries,
      outputFiles: OUTPUT,
    });
    expect(docs).toEqual([]);
  });
});

const realIndexPath = path.join(REAL_DIR, "data", "pdf-index.tsv");
const realOutputList = path.join(REAL_DIR, "output-files.json");

describe.skipIf(!existsSync(realIndexPath) || !existsSync(realOutputList))(
  "matchDocuments — real pdf-index + output listing",
  () => {
    it("every indexed CV row with a present file resolves for its report num", () => {
      const indexEntries = parsePdfIndex(readFileSync(realIndexPath, "utf8"));
      const outputFiles = (
        JSON.parse(readFileSync(realOutputList, "utf8")) as string[]
      ).filter((f) => f.endsWith(".pdf"));
      const reportsDir = path.join(REAL_DIR, "reports");
      const reportFiles: string[] = existsSync(reportsDir)
        ? readdirSync(reportsDir)
        : [];

      for (const entry of indexEntries) {
        if (entry.report === null || entry.pdf === "") continue;
        const base = entry.pdf.slice(entry.pdf.lastIndexOf("/") + 1);
        if (!outputFiles.includes(base)) continue; // pruned output — heuristics must skip it
        const reportFilename =
          reportFiles.find((f) =>
            f.startsWith(`${String(entry.report).padStart(3, "0")}-`),
          ) ?? null;
        const docs = matchDocuments({
          num: entry.report,
          reportFilename,
          indexEntries,
          outputFiles,
        });
        expect(
          docs.some((d) => d.kind === "cv" && d.fileName === base),
          `report ${entry.report} → ${base}`,
        ).toBe(true);
      }
    });
  },
);
