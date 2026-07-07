import { describe, expect, it } from "vitest";
import {
  archetypeBreakdownFromFacets,
  foldTail,
  funnelStages,
  hasNamedArchetypes,
  locationBreakdownFromFacets,
  scoreHistogram,
  vendorBarsFromFacets,
  vendorChartData,
  type BreakdownDatum,
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
