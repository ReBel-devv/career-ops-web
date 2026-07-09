import { describe, expect, it } from "vitest";
import { outreachHints, stageIndex, STAGE_LABELS } from "@/lib/outreach-view";
import type { OutreachContact, OutreachRecord } from "@/lib/domain";

/** Pure outreach view logic — always runs (no fs, no repo). */

function contact(partial: Partial<OutreachContact>): OutreachContact {
  return {
    id: "c_test",
    kind: "recruiter",
    name: "Test Contact",
    stage: "identified",
    stageDates: {},
    ...partial,
  };
}

describe("stageIndex / STAGE_LABELS", () => {
  it("orders the linear machine", () => {
    expect(stageIndex("identified")).toBe(0);
    expect(stageIndex("replied")).toBe(4);
    expect(stageIndex("accepted")).toBeLessThan(stageIndex("messaged"));
  });

  it("labels every stage", () => {
    expect(STAGE_LABELS.identified).toBe("Identified");
    expect(STAGE_LABELS.replied).toBe("Replied");
  });
});

describe("outreachHints", () => {
  it("returns count + furthest stage per app", () => {
    const records: OutreachRecord[] = [
      {
        appNum: 1,
        contacts: [
          contact({ id: "a", stage: "requested" }),
          contact({ id: "b", stage: "replied" }),
          contact({ id: "c", stage: "identified" }),
        ],
      },
      { appNum: 4, contacts: [contact({ id: "d", stage: "messaged" })] },
      { appNum: 9, contacts: [] },
    ];
    const hints = outreachHints(records);
    expect(hints.get(1)).toEqual({ count: 3, topStage: "replied" });
    expect(hints.get(4)).toEqual({ count: 1, topStage: "messaged" });
    // Apps without contacts are absent — the indicator stays hidden.
    expect(hints.has(9)).toBe(false);
  });

  it("is empty for no records", () => {
    expect(outreachHints([]).size).toBe(0);
  });
});
