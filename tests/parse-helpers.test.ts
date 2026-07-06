import { describe, expect, it } from "vitest";
import { parsePdfCell, parseReportCell, parseScoreCell, scoreTier } from "@/lib/domain";

describe("parseScoreCell", () => {
  it("parses N/5 and N.N/5", () => {
    expect(parseScoreCell("4.2/5")).toBe(4.2);
    expect(parseScoreCell("3/5")).toBe(3);
    expect(parseScoreCell(" **4.25/5** ")).toBe(4.25);
  });

  it("returns null for sentinels and junk", () => {
    expect(parseScoreCell("N/A")).toBeNull();
    expect(parseScoreCell("DUP")).toBeNull();
    expect(parseScoreCell("Applied")).toBeNull();
    expect(parseScoreCell("")).toBeNull();
  });
});

describe("parsePdfCell", () => {
  it("recognizes checkmark glyphs", () => {
    expect(parsePdfCell("✅")).toBe(true);
    expect(parsePdfCell("❌")).toBe(false);
    expect(parsePdfCell("")).toBe(false);
  });
});

describe("parseReportCell", () => {
  it("extracts label and target from a markdown link", () => {
    expect(parseReportCell("[028](../reports/028-acme-2026-07-06.md)")).toEqual({
      label: "028",
      path: "../reports/028-acme-2026-07-06.md",
    });
    expect(parseReportCell("[001](reports/001-acme-2026-07-04.md)")?.path).toBe(
      "reports/001-acme-2026-07-04.md",
    );
  });

  it("returns null when the cell has no link", () => {
    expect(parseReportCell("")).toBeNull();
    expect(parseReportCell("pending")).toBeNull();
  });
});

describe("scoreTier", () => {
  it("splits the ramp exactly at the 4.0 apply threshold and at 3.0", () => {
    expect(scoreTier(4.0)).toBe("high");
    expect(scoreTier(4.9)).toBe("high");
    expect(scoreTier(3.9)).toBe("mid");
    expect(scoreTier(3.0)).toBe("mid");
    expect(scoreTier(2.9)).toBe("low");
    expect(scoreTier(null)).toBe("none");
  });
});
