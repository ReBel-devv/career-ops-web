import { describe, expect, it } from "vitest";
import { isPrepCandidate, matchInterviewPrep } from "@/lib/parsers/interview-prep";

// Fictional companies (demo-fixture names) reproduce the same matching shapes.
const PREP = [
  "larkspur-frontend-engineer-growth.md",
  "windrose-ui-engineer-charts.md",
  "quayside-design-engineer.md",
  "story-bank.md",
  "README.md",
  "_template.md",
];

describe("isPrepCandidate", () => {
  it("accepts app-specific .md, rejects shared/partial files", () => {
    expect(isPrepCandidate("larkspur-frontend-engineer-growth.md")).toBe(true);
    expect(isPrepCandidate("story-bank.md")).toBe(false);
    expect(isPrepCandidate("README.md")).toBe(false);
    expect(isPrepCandidate("_template.md")).toBe(false);
    expect(isPrepCandidate("notes.txt")).toBe(false);
  });
});

describe("matchInterviewPrep", () => {
  it("matches a prep file whose report slug differs from the file", () => {
    const matched = matchInterviewPrep({
      num: 53,
      app: { company: "Larkspur", role: "Frontend Engineer, Growth" },
      siblings: [{ num: 53, company: "Larkspur", role: "Frontend Engineer, Growth" }],
      prepFiles: PREP,
    });
    expect(matched).toEqual(["larkspur-frontend-engineer-growth.md"]);
  });

  it("disambiguates by role among same-company siblings", () => {
    const siblings = [
      { num: 21, company: "Windrose", role: "UI Engineer, Charts" },
      { num: 22, company: "Windrose", role: "Backend Engineer, Core" },
    ];
    expect(
      matchInterviewPrep({
        num: 21,
        app: { company: "Windrose", role: "UI Engineer, Charts" },
        siblings,
        prepFiles: PREP,
      }),
    ).toEqual(["windrose-ui-engineer-charts.md"]);
    expect(
      matchInterviewPrep({
        num: 22,
        app: { company: "Windrose", role: "Backend Engineer, Core" },
        siblings,
        prepFiles: PREP,
      }),
    ).toEqual([]);
  });

  it("never surfaces shared files and returns [] for an unmatched company", () => {
    expect(
      matchInterviewPrep({
        num: 99,
        app: { company: "Nonexistent", role: "Engineer" },
        siblings: [{ num: 99, company: "Nonexistent", role: "Engineer" }],
        prepFiles: PREP,
      }),
    ).toEqual([]);
  });
});
