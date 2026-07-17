import { describe, expect, it } from "vitest";
import { diffLines, hasChanges } from "@/lib/diff";

describe("diffLines", () => {
  it("marks identical documents as all-same", () => {
    const diff = diffLines("a\nb", "a\nb");
    expect(diff).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
    ]);
    expect(hasChanges(diff)).toBe(false);
  });

  it("pairs removals before additions on a changed line", () => {
    expect(diffLines("hello\nworld", "hello\nmonde")).toEqual([
      { kind: "same", text: "hello" },
      { kind: "removed", text: "world" },
      { kind: "added", text: "monde" },
    ]);
  });

  it("handles pure insertions and deletions at both ends", () => {
    expect(diffLines("b", "a\nb\nc")).toEqual([
      { kind: "added", text: "a" },
      { kind: "same", text: "b" },
      { kind: "added", text: "c" },
    ]);
    expect(diffLines("a\nb\nc", "b")).toEqual([
      { kind: "removed", text: "a" },
      { kind: "same", text: "b" },
      { kind: "removed", text: "c" },
    ]);
  });

  it("keeps the longest common subsequence through interleaved edits", () => {
    const diff = diffLines("one\ntwo\nthree\nfour", "zero\none\nthree\nfive");
    expect(diff.filter((l) => l.kind === "same").map((l) => l.text)).toEqual([
      "one",
      "three",
    ]);
    expect(hasChanges(diff)).toBe(true);
  });

  it("treats empty documents sanely", () => {
    expect(diffLines("", "")).toEqual([{ kind: "same", text: "" }]);
    expect(diffLines("", "a")).toEqual([
      { kind: "removed", text: "" },
      { kind: "added", text: "a" },
    ]);
  });
});
