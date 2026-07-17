import { describe, expect, it } from "vitest";
import {
  applicationsSince,
  archetypeBreakdownFromFacets,
  archetypeYield,
  dailyActivity,
  foldTail,
  funnelStages,
  hasNamedArchetypes,
  locationBreakdownFromFacets,
  locationCoverageSummary,
  pipelineAging,
  scoreHistogram,
  scoreOutcomeBands,
  scorePredictionSummary,
  statusCounts,
  vendorBarsFromFacets,
  vendorChartData,
  weeklyActivity,
  type BreakdownDatum,
  type RateDatum,
} from "@/lib/analytics";
import type {
  Application,
  ArchetypePattern,
  ReportFacet,
  VendorAnalysis,
} from "@/lib/domain";
import { DemoDataSource } from "@/lib/data/demo-data-source";

/** Minimal tracker row for transform tests (only num/statusId/score matter). */
function app(num: number, statusId: string | null, score: number | null = null): Application {
  return {
    num,
    date: "2026-06-01",
    company: `Company ${num}`,
    role: "Engineer",
    scoreRaw: score === null ? "N/A" : `${score.toFixed(1)}/5`,
    score,
    statusRaw: statusId ?? "???",
    statusId,
    statusLabel: statusId,
    dashboardGroup: statusId,
    hasPdf: false,
    reportPath: null,
    notes: "",
    location: null,
  };
}

function facet(
  num: number,
  archetype: string | null,
  atsVendor: string | null = null,
  locationBucket: string | null = null,
): ReportFacet {
  return { num, archetype, atsVendor, locationBucket } as ReportFacet;
}

describe("funnelStages", () => {
  it("builds cumulative reached-at-least stages from raw status counts", () => {
    // Real-repo shape: only statuses that occur are present.
    const stages = funnelStages({ evaluated: 23, applied: 9, rejected: 1 });
    expect(stages.map((s) => [s.id, s.count])).toEqual([
      ["evaluated", 33],
      ["applied", 10], // applied + rejected (rejected was submitted first)
      ["responded", 0],
      ["interview", 0],
      ["offer", 0],
    ]);
    expect(stages[0].pctOfPrev).toBeNull();
    expect(stages[1].pctOfPrev).toBe(30); // 10/33
    expect(stages[1].pctOfTotal).toBe(30);
    // Empty previous stage → conversion is null, not NaN or 0.
    expect(stages[3].pctOfPrev).toBeNull();
  });

  it("counts every submitted/advanced status in the right stages", () => {
    const stages = funnelStages({
      evaluated: 2,
      applied: 3,
      responded: 2,
      interview: 1,
      offer: 1,
      rejected: 1,
      discarded: 1,
      skip: 2,
    });
    expect(stages.map((s) => s.count)).toEqual([13, 9, 4, 2, 1]);
    expect(stages[2].pctOfPrev).toBe(44); // 4/9
  });

  it("handles an empty funnel without dividing by zero", () => {
    const stages = funnelStages({});
    expect(stages.every((s) => s.count === 0)).toBe(true);
    expect(stages.every((s) => s.pctOfTotal === 0)).toBe(true);
  });
});

describe("applicationsSince", () => {
  const NOW = Date.parse("2026-07-16T12:00:00");

  it("keeps rows inside the trailing window and drops bad dates", () => {
    const rows = [
      { ...app(1, "applied"), date: "2026-07-15" }, // 1d ago
      { ...app(2, "evaluated"), date: "2026-07-01" }, // 15d ago
      { ...app(3, "evaluated"), date: "2026-04-01" }, // out of 90d? no — ~106d
      { ...app(4, "evaluated"), date: "garbage" },
    ];
    expect(applicationsSince(rows, 7, NOW).map((a) => a.num)).toEqual([1]);
    expect(applicationsSince(rows, 30, NOW).map((a) => a.num)).toEqual([1, 2]);
    expect(applicationsSince(rows, 90, NOW).map((a) => a.num)).toEqual([1, 2]);
  });

  it("excludes future-dated rows", () => {
    const rows = [{ ...app(1, "applied"), date: "2026-08-01" }];
    expect(applicationsSince(rows, 30, NOW)).toEqual([]);
  });
});

describe("statusCounts", () => {
  it("counts rows per canonical status id, skipping unresolved ones", () => {
    const rows = [
      app(1, "applied"),
      app(2, "applied"),
      app(3, "evaluated"),
      app(4, null),
    ];
    expect(statusCounts(rows)).toEqual({ applied: 2, evaluated: 1 });
  });
});

describe("weeklyActivity", () => {
  it("buckets rows by ISO week and gap-fills interior zero weeks", () => {
    const rows = [
      { ...app(1, "evaluated"), date: "2026-06-01" }, // Monday
      { ...app(2, "applied"), date: "2026-06-03" }, // same week
      { ...app(3, "evaluated"), date: "2026-06-17" }, // two weeks later
    ];
    const weeks = weeklyActivity(rows);
    expect(weeks.map((w) => [w.date, w.tracked, w.applied])).toEqual([
      ["2026-06-01", 2, 1],
      ["2026-06-08", 0, 0], // interior gap kept so the shape doesn't lie
      ["2026-06-15", 1, 0],
    ]);
    expect(weeks[0].label).toBe("Jun 1");
  });

  it("counts every submitted status as applied and skips bad dates", () => {
    const rows = [
      { ...app(1, "rejected"), date: "2026-06-02" }, // submitted first, so counted
      { ...app(2, "interview"), date: "2026-06-04" },
      { ...app(3, "evaluated"), date: "not-a-date" },
    ];
    const weeks = weeklyActivity(rows);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({ tracked: 2, applied: 2 });
  });

  it("returns [] when nothing has a parseable date", () => {
    expect(weeklyActivity([])).toEqual([]);
  });
});

describe("dailyActivity", () => {
  it("buckets rows by day and gap-fills interior zero days", () => {
    const rows = [
      { ...app(1, "evaluated"), date: "2026-06-01" },
      { ...app(2, "applied"), date: "2026-06-01" }, // same day
      { ...app(3, "applied"), date: "2026-06-04" }, // 2-day interior gap
    ];
    const days = dailyActivity(rows);
    expect(days.map((d) => [d.date, d.tracked, d.applied])).toEqual([
      ["2026-06-01", 2, 1],
      ["2026-06-02", 0, 0], // interior gap kept so the shape doesn't lie
      ["2026-06-03", 0, 0],
      ["2026-06-04", 1, 1],
    ]);
    expect(days[0].label).toBe("Jun 1");
  });

  it("counts every submitted status as applied and skips bad dates", () => {
    const rows = [
      { ...app(1, "rejected"), date: "2026-06-02" }, // submitted first, so counted
      { ...app(2, "interview"), date: "2026-06-02" },
      { ...app(3, "evaluated"), date: "not-a-date" },
    ];
    const days = dailyActivity(rows);
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ date: "2026-06-02", tracked: 2, applied: 2 });
  });

  it("returns [] when nothing has a parseable date", () => {
    expect(dailyActivity([])).toEqual([]);
  });
});

describe("scoreOutcomeBands", () => {
  it("computes advance rate per score band over submitted, scored rows", () => {
    const apps = [
      app(1, "applied", 4.2),
      app(2, "interview", 4.1), // advanced
      app(3, "rejected", 3.6),
      app(4, "responded", 3.7), // advanced
      app(5, "applied", 2.5),
      app(6, "evaluated", 4.8), // never submitted → excluded
      app(7, "applied", null), // unscored → excluded
    ];
    const bands = scoreOutcomeBands(apps, 2);
    expect(bands.map((b) => [b.label, b.n, b.advanced, b.rate])).toEqual([
      ["< 3.0", 1, 0, 0],
      ["3.0–3.4", 0, 0, 0], // empty band kept — the hole stays visible
      ["3.5–3.9", 2, 1, 50],
      ["≥ 4.0", 2, 1, 50],
    ]);
    expect(bands[0].grayed).toBe(true); // n=1 < minSample 2
    expect(bands[2].grayed).toBe(false);
  });

  it("returns [] when no submitted row carries a score", () => {
    expect(scoreOutcomeBands([app(1, "evaluated", 4.0)], 2)).toEqual([]);
    expect(scoreOutcomeBands([app(1, "applied", null)], 2)).toEqual([]);
  });
});

describe("scorePredictionSummary", () => {
  const band = (label: string, n: number, rate: number): RateDatum => ({
    label,
    n,
    advanced: Math.round((rate / 100) * n),
    rate,
    grayed: n < 2,
  });

  it("needs two claimable bands to compare", () => {
    const out = scorePredictionSummary(
      [band("< 3.0", 1, 0), band("≥ 4.0", 8, 50)],
      2,
    );
    expect(out).toMatch(/need n ≥ 2 in at least two bands/i);
  });

  it("calls out a rising staircase with its numbers", () => {
    const out = scorePredictionSummary(
      [band("3.5–3.9", 6, 20), band("≥ 4.0", 10, 60)],
      2,
    );
    expect(out).toBe("Higher scores advance more often: 60% at ≥ 4.0 vs 20% at 3.5–3.9.");
  });

  it("says the score isn't predicting when every claimable band is flat at zero", () => {
    const out = scorePredictionSummary(
      [band("3.5–3.9", 6, 0), band("≥ 4.0", 10, 0)],
      2,
    );
    expect(out).toMatch(/isn't predicting replies so far/);
  });
});

describe("archetypeYield", () => {
  it("computes advance rate per family; combined archetypes count each family", () => {
    const apps = [
      app(1, "interview"), // advanced
      app(2, "applied"),
      app(3, "rejected"),
      app(4, "evaluated"), // not submitted → excluded
    ];
    const facets = [
      facet(1, "Frontend Engineer (React/Next.js) + Design Engineer (UI/Motion)"),
      facet(2, "Frontend Engineer (React)"),
      facet(3, "Design Engineer"),
      facet(4, "Frontend Engineer"),
    ];
    const yields = archetypeYield(facets, apps, 2);
    expect(yields.map((y) => [y.label, y.n, y.advanced, y.rate, y.grayed])).toEqual([
      ["Design Engineer", 2, 1, 50, false],
      ["Frontend Engineer", 2, 1, 50, false],
    ]);
  });

  it("skips submitted rows without an archetype facet", () => {
    expect(archetypeYield([], [app(1, "applied")], 2)).toEqual([]);
  });
});

describe("pipelineAging", () => {
  const NOW = Date.parse("2026-07-16T12:00:00");

  it("buckets waiting (status exactly applied) rows by days since apply date", () => {
    const rows = [
      { ...app(1, "applied"), date: "2026-07-14" }, // 2d
      { ...app(2, "applied"), date: "2026-07-06" }, // 10d
      { ...app(3, "applied"), date: "2026-06-10" }, // 36d → stale
      { ...app(4, "responded"), date: "2026-06-01" }, // got a reply → excluded
      { ...app(5, "rejected"), date: "2026-06-01" }, // answered → excluded
    ];
    const aging = pipelineAging(rows, NOW);
    expect(aging.buckets.map((b) => [b.label, b.count, b.stale])).toEqual([
      ["≤ 7d", 1, false],
      ["8–14d", 1, false],
      ["15–21d", 0, false],
      ["> 21d", 1, true],
    ]);
    expect(aging.waiting).toBe(3);
    expect(aging.oldestDays).toBe(36);
  });

  it("handles an empty pipeline", () => {
    const aging = pipelineAging([app(1, "evaluated")], NOW);
    expect(aging.waiting).toBe(0);
    expect(aging.oldestDays).toBeNull();
  });
});

describe("scoreHistogram", () => {
  it("bins scores into 0.5 steps, trimming empty edge bins", () => {
    const bins = scoreHistogram([2.0, 2.3, 3.5, 3.7, 4.3, null, 0]);
    expect(bins[0].label).toBe("2.0–2.5");
    expect(bins[0].count).toBe(2);
    expect(bins[bins.length - 1].label).toBe("4.0–4.5");
    expect(bins[bins.length - 1].count).toBe(1);
    // Interior gap kept (2.5–3.5 empty bins remain so the shape doesn't lie).
    expect(bins.map((b) => b.count)).toEqual([2, 0, 0, 2, 1]);
  });

  it("puts a perfect 5.0 in the final bin, not out of range", () => {
    const bins = scoreHistogram([5.0]);
    expect(bins).toHaveLength(1);
    expect(bins[0].label).toBe("4.5–5.0");
    expect(bins[0].count).toBe(1);
  });

  it("returns [] when no valid scores exist (null and 0 are 'no score')", () => {
    expect(scoreHistogram([null, 0])).toEqual([]);
    expect(scoreHistogram([])).toEqual([]);
  });
});

describe("archetype / location breakdowns", () => {
  const unknownOnly: ArchetypePattern[] = [
    { archetype: "Unknown", total: 33, positive: 9, negative: 1, self_filtered: 0, pending: 23, conversionRate: 27 },
  ];

  it("detects when the script resolved no archetypes (real-repo case)", () => {
    expect(hasNamedArchetypes(unknownOnly)).toBe(false);
    expect(
      hasNamedArchetypes([
        ...unknownOnly,
        { archetype: "Design Engineer", total: 3, positive: 1, negative: 0, self_filtered: 0, pending: 2, conversionRate: 33 },
      ]),
    ).toBe(true);
  });

  it("counts archetype families from facets (combined archetypes count each family)", () => {
    const data = archetypeBreakdownFromFacets([
      facet(1, "Frontend Engineer (React/Next.js) + Design Engineer (UI/Motion)"),
      facet(2, "Design Engineer"),
      facet(3, null),
    ]);
    expect(data).toEqual([
      { label: "Design Engineer", count: 2 },
      { label: "Frontend Engineer", count: 1 },
      { label: "Unknown", count: 1 },
    ]);
  });

  it("buckets locations with null → Unknown", () => {
    const data = locationBreakdownFromFacets([
      facet(1, null, null, "EU"),
      facet(2, null, null, "EU"),
      facet(3, null, null, "Remote"),
      facet(4, null, null, null),
    ]);
    expect(data[0]).toEqual({ label: "EU", count: 2 });
    expect(data).toContainEqual({ label: "Unknown", count: 1 });
  });

  it("summarizes location coverage, calling out the unparsed remainder", () => {
    expect(
      locationCoverageSummary([
        { label: "Unknown", count: 46 },
        { label: "Remote", count: 24 },
        { label: "EU", count: 16 },
      ]),
    ).toBe("40 of 86 reports resolved to a location bucket — 46 unparsed.");
    // No Unknown bucket → nothing to flag as unparsed.
    expect(
      locationCoverageSummary([{ label: "EU", count: 3 }]),
    ).toBe("3 of 3 reports resolved to a location bucket.");
    expect(locationCoverageSummary([])).toBe("");
  });

  it("folds the tail past 8 slots into Other (never a 9th hue)", () => {
    const many: BreakdownDatum[] = Array.from({ length: 11 }, (_, i) => ({
      label: `A${i}`,
      count: 20 - i,
    }));
    const folded = foldTail(many);
    expect(folded).toHaveLength(8);
    expect(folded[7]).toEqual({ label: "Other", count: 13 + 12 + 11 + 10 });
  });
});

describe("vendor advance-rate bars (low-n graying — F5)", () => {
  const analysis = (breakdown: VendorAnalysis["breakdown"]): VendorAnalysis => ({
    scope: ["greenhouse", "lever", "ashby", "workday"],
    minSampleForClaim: 8,
    submitted: 10,
    identified: breakdown.reduce((s, b) => s + b.total, 0),
    coveragePct: 0,
    overallAdvanceRate: 0,
    breakdown,
  });

  it("grays exactly the vendors the script flags as insufficient sample", () => {
    const chart = vendorChartData(
      analysis([
        { vendor: "greenhouse", total: 9, advanced: 3, advanceRate: 33, sharePct: 45, sufficientSample: true },
        { vendor: "lever", total: 2, advanced: 1, advanceRate: 50, sharePct: 10, sufficientSample: false },
      ]),
      [],
      [],
    );
    expect(chart.source).toBe("script");
    expect(chart.data.map((d) => [d.vendor, d.grayed])).toEqual([
      ["greenhouse", false],
      ["lever", true],
    ]);
    // Every rate keeps its n (small n = don't lie).
    expect(chart.data.every((d) => d.total > 0)).toBe(true);
  });

  it("falls back to facet-derived channel yield when the script found no vendors", () => {
    const apps = [
      app(1, "applied"),
      app(2, "responded"),
      app(3, "interview"),
      app(4, "rejected"),
      app(5, "evaluated"), // never submitted → excluded
      app(6, "skip"), // self-filtered → excluded
    ];
    const facets = [
      facet(1, null, "Greenhouse"),
      facet(2, null, "Greenhouse"),
      facet(3, null, "Lever"),
      facet(4, null, "Lever"),
      facet(5, null, "Ashby"),
    ];
    const chart = vendorChartData(analysis([]), facets, apps);
    expect(chart.source).toBe("facets");
    expect(chart.submitted).toBe(4);
    expect(chart.identified).toBe(4);
    expect(chart.data).toEqual([
      // advanced: responded counts, applied doesn't (stricter than 'positive').
      { vendor: "Greenhouse", total: 2, advanced: 1, advanceRate: 50, grayed: true },
      { vendor: "Lever", total: 2, advanced: 1, advanceRate: 50, grayed: true },
    ]);
  });

  it("un-grays a facet-derived vendor once n reaches the minimum sample", () => {
    const apps = Array.from({ length: 8 }, (_, i) => app(i + 1, "applied"));
    const facets = apps.map((a) => facet(a.num, null, "Greenhouse"));
    const { data } = vendorBarsFromFacets(facets, apps, 8);
    expect(data).toEqual([
      { vendor: "Greenhouse", total: 8, advanced: 0, advanceRate: 0, grayed: false },
    ]);
  });
});

describe("DemoDataSource M5 stubs", () => {
  it("returns schema-valid demo patterns, pipeline items, and scan history", async () => {
    const demo = new DemoDataSource();
    const patterns = await demo.getPatterns();
    expect(patterns.kind).toBe("ok");
    if (patterns.kind === "ok") {
      expect(patterns.patterns.metadata.total).toBeGreaterThan(0);
      // The demo exercises both the accented and the grayed vendor bars.
      const flags = patterns.patterns.vendorAnalysis.breakdown.map(
        (b) => b.sufficientSample,
      );
      expect(flags).toContain(true);
      expect(flags).toContain(false);
    }

    const items = await demo.getPipelineItems();
    expect(items.some((i) => i.section === "pending")).toBe(true);
    expect(items.some((i) => i.kind === "done" && i.reportNum !== null)).toBe(true);

    const records = await demo.getScanHistory();
    expect(records.length).toBeGreaterThan(0);
  });
});
