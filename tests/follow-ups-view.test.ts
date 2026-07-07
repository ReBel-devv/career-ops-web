import { describe, expect, it } from "vitest";
import {
  agendaGroups,
  buildMonthMatrix,
  entryIsOverdue,
  followUpSummary,
  overdueAppNums,
  partitionCadence,
} from "@/lib/follow-ups-view";
import type { CadenceEntry, FollowUpCadence, FollowUpUrgency } from "@/lib/domain";

function entry(
  num: number,
  urgency: FollowUpUrgency,
  nextFollowupDate: string | null,
  daysUntilNext: number | null,
): CadenceEntry {
  return {
    num,
    date: "2026-07-01",
    appliedDate: "2026-07-01",
    company: `Co${num}`,
    role: "Engineer",
    status: "applied",
    score: "4.0/5",
    notes: "",
    reportPath: null,
    contacts: [],
    daysSinceApplication: 5,
    daysSinceLastFollowup: null,
    followupCount: 0,
    urgency,
    nextFollowupDate,
    nextOverride: null,
    daysUntilNext,
  };
}

function cadence(entries: CadenceEntry[]): FollowUpCadence {
  return {
    metadata: {
      analysisDate: "2026-07-07",
      totalTracked: entries.length,
      actionable: entries.length,
      overdue: 0,
      urgent: 0,
      cold: 0,
      waiting: 0,
    },
    entries,
    cadenceConfig: { applied_first: 7 },
  };
}

describe("partitionCadence", () => {
  const c = cadence([
    entry(1, "waiting", "2026-07-20", 13),
    entry(2, "overdue", "2026-07-02", -5),
    entry(3, "urgent", "2026-07-07", 0),
    entry(4, "cold", null, null),
    entry(5, "waiting", "2026-07-10", 3),
  ]);

  it("splits into overdue / upcoming / cold", () => {
    const p = partitionCadence(c);
    expect(p.overdue.map((e) => e.num)).toEqual([2, 3]); // overdue+urgent, date asc
    expect(p.upcoming.map((e) => e.num)).toEqual([5, 1]); // future, date asc
    expect(p.cold.map((e) => e.num)).toEqual([4]);
  });

  it("entryIsOverdue treats overdue + urgent as needing action", () => {
    expect(entryIsOverdue(entry(9, "overdue", "2026-01-01", -180))).toBe(true);
    expect(entryIsOverdue(entry(9, "urgent", "2026-07-07", 0))).toBe(true);
    expect(entryIsOverdue(entry(9, "waiting", "2026-08-01", 20))).toBe(false);
    expect(entryIsOverdue(entry(9, "cold", null, null))).toBe(false);
  });
});

describe("overdueAppNums", () => {
  it("collects overdue + urgent app nums", () => {
    const set = overdueAppNums(
      cadence([
        entry(1, "overdue", "2026-07-02", -5),
        entry(2, "waiting", "2026-07-20", 13),
        entry(3, "urgent", "2026-07-07", 0),
      ]),
    );
    expect([...set].sort()).toEqual([1, 3]);
  });
});

describe("followUpSummary", () => {
  it("counts due (≤0 days) and overdue (urgency)", () => {
    const s = followUpSummary(
      cadence([
        entry(1, "overdue", "2026-07-02", -5),
        entry(2, "urgent", "2026-07-07", 0),
        entry(3, "waiting", "2026-07-20", 13),
        entry(4, "waiting", "2026-07-05", -2), // waiting but daysUntilNext<0 counts as due
      ]),
    );
    expect(s.due).toBe(3); // nums 1, 2, 4
    expect(s.overdue).toBe(1); // only urgency==="overdue"
  });
});

describe("agendaGroups", () => {
  it("groups by date ascending, entries by num", () => {
    const groups = agendaGroups([
      entry(3, "waiting", "2026-07-20", 13),
      entry(1, "waiting", "2026-07-10", 3),
      entry(2, "waiting", "2026-07-10", 3),
      entry(4, "cold", null, null), // no date → excluded
    ]);
    expect(groups.map((g) => g.date)).toEqual(["2026-07-10", "2026-07-20"]);
    expect(groups[0].entries.map((e) => e.num)).toEqual([1, 2]);
  });
});

describe("buildMonthMatrix", () => {
  const entries = [
    entry(1, "waiting", "2026-07-15", 8),
    entry(2, "waiting", "2026-07-15", 8),
    entry(3, "waiting", "2026-07-31", 24),
  ];
  const weeks = buildMonthMatrix(2026, 6, entries, "2026-07-07"); // July 2026

  it("is a 6×7 grid", () => {
    expect(weeks).toHaveLength(6);
    for (const w of weeks) expect(w).toHaveLength(7);
  });

  it("places entries on their exact day and flags today", () => {
    const all = weeks.flat();
    const july15 = all.find((d) => d.date === "2026-07-15");
    expect(july15?.entries.map((e) => e.num)).toEqual([1, 2]);
    expect(july15?.inMonth).toBe(true);
    const today = all.find((d) => d.date === "2026-07-07");
    expect(today?.isToday).toBe(true);
    // Days outside the month carry no entries and are marked inMonth:false.
    const outside = all.filter((d) => !d.inMonth);
    for (const d of outside) expect(d.entries).toEqual([]);
  });

  it("covers exactly the days of July with inMonth=true", () => {
    const inMonth = weeks.flat().filter((d) => d.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(inMonth[0].date).toBe("2026-07-01");
    expect(inMonth.at(-1)?.date).toBe("2026-07-31");
  });
});
