/**
 * Generated-documents aggregation (library view): resolve every `output/*.pdf`
 * to a kind (CV / cover letter) and, where possible, an application — via the
 * pdf-index report number first, then a company-slug filename match. HTML files
 * are ignored; unresolved PDFs still surface with a filename-derived company.
 */
import { describe, expect, it } from "vitest";
import { parsePdfIndex } from "@/lib/parsers/documents";
import {
  buildGeneratedDocuments,
  type AppLite,
  type OutputFile,
} from "@/lib/parsers/generated-docs";

const APPS: AppLite[] = [
  { num: 1, company: "Nimbus Labs", role: "Design Engineer", statusId: "applied", statusLabel: "Applied" },
  { num: 2, company: "Vectorline", role: "Frontend Engineer", statusId: "evaluated", statusLabel: "Evaluated" },
];

const INDEX = parsePdfIndex(
  [
    "# report\tpdf\thtml\tformat\tdate",
    "001\toutput/cv-x-nimbus-labs-2026-06-01.pdf\toutput/cv-x-nimbus-labs.html\ta4\t2026-06-01",
    "\toutput/nimbus-labs-design-engineer-cover.pdf\t\ta4\t2026-06-01",
  ].join("\n"),
);

const OUTPUT: OutputFile[] = [
  { name: "cv-x-nimbus-labs-2026-06-01.pdf", sizeBytes: 1000, mtimeMs: 10 },
  { name: "nimbus-labs-design-engineer-cover.pdf", sizeBytes: 500, mtimeMs: 10 },
  { name: "cv-x-vectorline-2026-06-02.pdf", sizeBytes: 900, mtimeMs: 20 }, // not in index
  { name: "vectorline-frontend-engineer-cover.pdf", sizeBytes: 400, mtimeMs: 20 },
  { name: "cv-x-nimbus-labs.html", sizeBytes: 5, mtimeMs: 10 }, // ignored (not pdf)
  { name: "cv-x-unknowncorp-2026-05-01.pdf", sizeBytes: 300, mtimeMs: 5 }, // unresolved
];

describe("buildGeneratedDocuments", () => {
  const docs = buildGeneratedDocuments({ indexEntries: INDEX, outputFiles: OUTPUT, apps: APPS });
  const byName = (name: string) => docs.find((d) => d.fileName === name)!;

  it("returns one entry per PDF and ignores HTML", () => {
    expect(docs).toHaveLength(5);
    expect(docs.some((d) => d.fileName.endsWith(".html"))).toBe(false);
  });

  it("resolves a CV to its application via the pdf-index report number", () => {
    const cv = byName("cv-x-nimbus-labs-2026-06-01.pdf");
    expect(cv.kind).toBe("cv");
    expect(cv.appNum).toBe(1);
    expect(cv.company).toBe("Nimbus Labs");
    expect(cv.role).toBe("Design Engineer");
    expect(cv.statusLabel).toBe("Applied");
    expect(cv.generatedDate).toBe("2026-06-01");
    expect(cv.sizeBytes).toBe(1000);
  });

  it("classifies and resolves cover letters by company slug", () => {
    const cover = byName("nimbus-labs-design-engineer-cover.pdf");
    expect(cover.kind).toBe("cover-letter");
    expect(cover.appNum).toBe(1);
    expect(cover.company).toBe("Nimbus Labs");
  });

  it("resolves a CV missing from the index by its company-slug tail", () => {
    const cv = byName("cv-x-vectorline-2026-06-02.pdf");
    expect(cv.appNum).toBe(2);
    expect(cv.company).toBe("Vectorline");
    expect(cv.generatedDate).toBe("2026-06-02"); // from the filename
  });

  it("still surfaces an unresolved PDF with a filename-derived company", () => {
    const orphan = byName("cv-x-unknowncorp-2026-05-01.pdf");
    expect(orphan.appNum).toBeNull();
    expect(orphan.company).toBeTruthy();
  });

  it("sorts newest first by generation date", () => {
    expect(docs[0].generatedDate).toBe("2026-06-02");
  });
});
