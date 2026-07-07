import { describe, expect, it } from "vitest";
import {
  applicationSchema,
  buildStatusResolver,
  statesFileSchema,
  type Application,
  type CanonicalState,
} from "@/lib/domain";
import { groupApplications, visibleColumns } from "@/lib/grouping";
import {
  applyFiltersToParams,
  EMPTY_FILTERS,
  filterApplications,
  isArchived,
  matchesFilters,
  parseFilters,
} from "@/lib/filters";
import { computePipelineStats } from "@/lib/stats";

// Canonical states mirroring templates/states.yml (with aliases) so the tests
// exercise the real alias → canonical column resolution.
const STATES: CanonicalState[] = statesFileSchema.parse({
  states: [
    { id: "evaluated", label: "Evaluated", aliases: ["evaluada"], description: "", dashboard_group: "evaluated" },
    { id: "applied", label: "Applied", aliases: ["aplicado", "enviada", "aplicada", "sent"], description: "", dashboard_group: "applied" },
    { id: "responded", label: "Responded", aliases: ["respondido"], description: "", dashboard_group: "responded" },
    { id: "interview", label: "Interview", aliases: ["entrevista"], description: "", dashboard_group: "interview" },
    { id: "offer", label: "Offer", aliases: ["oferta"], description: "", dashboard_group: "offer" },
    { id: "rejected", label: "Rejected", aliases: ["rechazado"], description: "", dashboard_group: "rejected" },
    { id: "discarded", label: "Discarded", aliases: ["descartada", "cerrada"], description: "", dashboard_group: "discarded" },
    { id: "skip", label: "SKIP", aliases: ["no_aplicar", "monitor"], description: "", dashboard_group: "skip" },
  ],
}).states;

const resolve = buildStatusResolver(STATES);

let counter = 0;
/** Build an Application whose status is resolved through the real resolver,
 * exactly like FsDataSource.toApplication does — so `statusRaw` may be an alias. */
function makeApp(overrides: {
  statusRaw: string;
  score?: number | null;
  company?: string;
  role?: string;
  notes?: string;
  date?: string;
}): Application {
  const state = resolve(overrides.statusRaw);
  counter += 1;
  return applicationSchema.parse({
    num: counter,
    date: overrides.date ?? "2026-07-06",
    company: overrides.company ?? "Acme",
    role: overrides.role ?? "Engineer",
    scoreRaw: overrides.score == null ? "N/A" : `${overrides.score.toFixed(1)}/5`,
    score: overrides.score ?? null,
    statusRaw: overrides.statusRaw,
    statusId: state?.id ?? null,
    statusLabel: state?.label ?? null,
    dashboardGroup: state?.dashboardGroup ?? null,
    hasPdf: false,
    reportPath: null,
    notes: overrides.notes ?? "",
    location: null,
  });
}

describe("groupApplications — alias statuses land in canonical columns", () => {
  it("places an aliased status ('aplicado') in the canonical Applied column", () => {
    const app = makeApp({ statusRaw: "aplicado" });
    const { columns } = groupApplications([app], STATES);
    const applied = columns.find((c) => c.state.id === "applied");
    const evaluated = columns.find((c) => c.state.id === "evaluated");
    expect(applied?.applications).toContain(app);
    expect(evaluated?.applications).toHaveLength(0);
  });

  it("places 'sent' and 'enviada' aliases in Applied too", () => {
    const a = makeApp({ statusRaw: "sent" });
    const b = makeApp({ statusRaw: "enviada" });
    const { columns } = groupApplications([a, b], STATES);
    expect(columns.find((c) => c.state.id === "applied")?.applications).toEqual([a, b]);
  });

  it("keeps columns in states.yml declared order", () => {
    const { columns } = groupApplications([], STATES);
    expect(columns.map((c) => c.state.id)).toEqual([
      "evaluated", "applied", "responded", "interview", "offer", "rejected", "discarded", "skip",
    ]);
  });

  it("marks rejected/discarded/skip columns archived, others not", () => {
    const { columns } = groupApplications([], STATES);
    const archived = columns.filter((c) => c.archived).map((c) => c.state.id);
    expect(archived).toEqual(["rejected", "discarded", "skip"]);
  });

  it("collects rows with an unresolvable status into ungrouped, not a column", () => {
    const good = makeApp({ statusRaw: "Applied" });
    const bad = makeApp({ statusRaw: "Ghosted" }); // not in states.yml
    const { columns, ungrouped } = groupApplications([good, bad], STATES);
    expect(ungrouped).toEqual([bad]);
    const total = columns.reduce((n, c) => n + c.applications.length, 0);
    expect(total).toBe(1);
  });
});

describe("visibleColumns — archived toggle", () => {
  it("hides archived columns by default", () => {
    const board = groupApplications([], STATES);
    expect(visibleColumns(board, false).map((c) => c.state.id)).toEqual([
      "evaluated", "applied", "responded", "interview", "offer",
    ]);
  });
  it("shows every column when archived is on", () => {
    const board = groupApplications([], STATES);
    expect(visibleColumns(board, true)).toHaveLength(8);
  });
});

describe("filters — archived hiding (Decision 8)", () => {
  const rejected = makeApp({ statusRaw: "Rejected" });
  const discarded = makeApp({ statusRaw: "Discarded" });
  const skip = makeApp({ statusRaw: "SKIP" });
  const applied = makeApp({ statusRaw: "Applied" });

  it("isArchived is true only for rejected/discarded/skip groups", () => {
    expect([rejected, discarded, skip].every(isArchived)).toBe(true);
    expect(isArchived(applied)).toBe(false);
  });

  it("filters out archived rows by default", () => {
    const kept = filterApplications([rejected, discarded, skip, applied], EMPTY_FILTERS);
    expect(kept).toEqual([applied]);
  });

  it("keeps archived rows when archived toggle is on", () => {
    const kept = filterApplications(
      [rejected, discarded, skip, applied],
      { ...EMPTY_FILTERS, archived: true },
    );
    expect(kept).toHaveLength(4);
  });
});

describe("filters — search / status / score / date compose with AND", () => {
  const a = makeApp({ statusRaw: "Applied", score: 4.3, company: "Mistral AI", role: "Frontend", date: "2026-07-05", notes: "React/Next" });
  const b = makeApp({ statusRaw: "Applied", score: 3.2, company: "Poolside", role: "Design Engineer", date: "2026-07-06", notes: "vision produit" });
  const c = makeApp({ statusRaw: "Evaluated", score: 2.0, company: "Aircall", role: "Senior FE", date: "2026-07-04", notes: "backend heavy" });
  const all = [a, b, c];

  it("free-text search matches company/role/notes", () => {
    expect(filterApplications(all, { ...EMPTY_FILTERS, q: "mistral" })).toEqual([a]);
    expect(filterApplications(all, { ...EMPTY_FILTERS, q: "design engineer" })).toEqual([b]);
    expect(filterApplications(all, { ...EMPTY_FILTERS, q: "backend" })).toEqual([c]);
  });

  it("status filter includes only listed canonical ids", () => {
    expect(filterApplications(all, { ...EMPTY_FILTERS, statuses: ["evaluated"] })).toEqual([c]);
  });

  it("score range is inclusive and drops unscored rows", () => {
    const unscored = makeApp({ statusRaw: "Applied", score: null });
    expect(
      filterApplications([...all, unscored], { ...EMPTY_FILTERS, scoreMin: 3.0 }),
    ).toEqual([a, b]);
    expect(
      filterApplications(all, { ...EMPTY_FILTERS, scoreMin: 3.0, scoreMax: 4.0 }),
    ).toEqual([b]);
  });

  it("date range is inclusive", () => {
    expect(
      filterApplications(all, { ...EMPTY_FILTERS, dateFrom: "2026-07-05", dateTo: "2026-07-05" }),
    ).toEqual([a]);
  });

  it("composes all facets with AND", () => {
    const f = { ...EMPTY_FILTERS, q: "engineer", statuses: ["applied"], scoreMin: 3.0 };
    expect(matchesFilters(b, f)).toBe(true);
    expect(matchesFilters(a, f)).toBe(false); // role "Frontend" fails q
    expect(matchesFilters(c, f)).toBe(false); // status/score fail
  });
});

describe("filters — URL param round-trip", () => {
  it("parses and reserializes without losing information", () => {
    const f = {
      q: "mistral",
      statuses: ["applied", "offer"],
      scoreMin: 3.5,
      scoreMax: null,
      dateFrom: "2026-07-01",
      dateTo: null,
      archived: true,
    };
    const params = applyFiltersToParams(new URLSearchParams(), f);
    expect(parseFilters(params)).toEqual(f);
  });

  it("omits empty values from the URL", () => {
    const params = applyFiltersToParams(new URLSearchParams(), EMPTY_FILTERS);
    expect(params.toString()).toBe("");
  });

  it("preserves unrelated params", () => {
    const params = applyFiltersToParams(
      new URLSearchParams("view=grid"),
      { ...EMPTY_FILTERS, q: "x" },
    );
    expect(params.get("view")).toBe("grid");
    expect(params.get("q")).toBe("x");
  });
});

describe("computePipelineStats — matches analyze-patterns funnel conventions", () => {
  // Mirror of the real tracker shape: 23 evaluated, 10 applied, 0 advanced.
  const apps: Application[] = [
    ...Array.from({ length: 23 }, () => makeApp({ statusRaw: "Evaluated", score: 3.0 })),
    ...Array.from({ length: 10 }, () => makeApp({ statusRaw: "Applied", score: 3.9 })),
  ];

  it("counts submitted (applied+) as 'applied', not evaluated/skip", () => {
    const stats = computePipelineStats(apps);
    expect(stats.applied).toBe(10);
    expect(stats.submitted).toBe(10);
  });

  it("response rate = advanced / submitted (advanced excludes bare 'applied')", () => {
    // No responded/interview/offer → 0% like analyze-patterns overallAdvanceRate.
    expect(computePipelineStats(apps).responseRate).toBe(0);

    const withProgress = [
      makeApp({ statusRaw: "Applied" }),
      makeApp({ statusRaw: "Interview" }),
      makeApp({ statusRaw: "Offer" }),
      makeApp({ statusRaw: "Responded" }),
    ];
    // submitted = 4, advanced = 3 (interview, offer, responded) → 75%
    expect(computePipelineStats(withProgress).responseRate).toBe(75);
  });

  it("evaluated-only pipeline has null response rate (nothing submitted)", () => {
    const onlyEval = [makeApp({ statusRaw: "Evaluated" })];
    const stats = computePipelineStats(onlyEval);
    expect(stats.submitted).toBe(0);
    expect(stats.responseRate).toBeNull();
  });

  it("averages only strictly-positive scores", () => {
    const mixed = [
      makeApp({ statusRaw: "Applied", score: 4.0 }),
      makeApp({ statusRaw: "Applied", score: 2.0 }),
      makeApp({ statusRaw: "Applied", score: null }),
    ];
    const stats = computePipelineStats(mixed);
    expect(stats.scoredCount).toBe(2);
    expect(stats.avgScore).toBeCloseTo(3.0, 5);
  });

  it("leaves follow-up cadence null as an M4 seam", () => {
    const stats = computePipelineStats(apps);
    expect(stats.followUps).toEqual({ due: null, overdue: null });
  });
});
