/**
 * FsDataSource tests run against fixture COPIES prepared by
 * tests/setup/copy-fixtures.ts — the real career-ops repo is never touched.
 * The parser modules inside each fixture dir are the data repo's own
 * tracker-parse.mjs / tracker-utils.mjs (copied at setup), so these tests
 * also prove the reuse contract. Suites skip when CAREER_OPS_PATH is absent.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FsDataSource } from "@/lib/data";
import { applicationSchema } from "@/lib/domain";

const FIXTURES = path.join(process.cwd(), "tests", "fixtures");
const SYNTHETIC = path.join(FIXTURES, "synthetic");
const SYNTHETIC_LOCATION = path.join(FIXTURES, "synthetic-location");
const REAL = path.join(FIXTURES, "real");

const parsersReady = existsSync(path.join(SYNTHETIC, "tracker-parse.mjs"));
const realReady = existsSync(path.join(REAL, "data", "applications.md"));

describe.skipIf(!parsersReady)("FsDataSource — synthetic fixture", () => {
  const ds = new FsDataSource(SYNTHETIC);

  it("parses the canonical states from states.yml", async () => {
    const states = await ds.getStates();
    expect(states).toHaveLength(8);
    expect(states.map((s) => s.label)).toEqual([
      "Evaluated",
      "Applied",
      "Responded",
      "Interview",
      "Offer",
      "Rejected",
      "Discarded",
      "SKIP",
    ]);
    expect(states.every((s) => s.dashboardGroup.length > 0)).toBe(true);
  });

  it("parses tracker rows through the data repo's own parser", async () => {
    const apps = await ds.getApplications();
    expect(apps).toHaveLength(4);

    const first = apps[0];
    expect(first).toMatchObject({
      num: 1,
      date: "2026-06-01",
      company: "Nimbus Labs",
      role: "Design Engineer",
      score: 4.4,
      statusId: "applied",
      statusLabel: "Applied",
      dashboardGroup: "applied",
      hasPdf: true,
      reportPath: "reports/001-nimbus-labs-2026-06-01.md",
    });
  });

  it("resolves alias statuses to canonical states", async () => {
    const apps = await ds.getApplications();
    const alias = apps.find((a) => a.num === 2);
    expect(alias?.statusRaw).toBe("aplicado");
    expect(alias?.statusId).toBe("applied");
    expect(alias?.statusLabel).toBe("Applied");
  });

  it("keeps sentinel scores as null and preserves the raw cell", async () => {
    const apps = await ds.getApplications();
    const sentinel = apps.find((a) => a.num === 3);
    expect(sentinel?.score).toBeNull();
    expect(sentinel?.scoreRaw).toBe("N/A");
    expect(sentinel?.statusId).toBe("skip");
  });

  it("degrades gracefully on unknown status and missing report link", async () => {
    const apps = await ds.getApplications();
    const odd = apps.find((a) => a.num === 4);
    expect(odd?.statusId).toBeNull();
    expect(odd?.statusLabel).toBeNull();
    expect(odd?.dashboardGroup).toBeNull();
    expect(odd?.statusRaw).toBe("Totally Unknown");
    expect(odd?.reportPath).toBeNull();
  });
});

describe.skipIf(!parsersReady)("FsDataSource — header-aware Location layout", () => {
  const ds = new FsDataSource(SYNTHETIC_LOCATION);

  it("maps columns by header name, not position", async () => {
    const apps = await ds.getApplications();
    expect(apps).toHaveLength(2);
    expect(apps[0]).toMatchObject({
      company: "Quartzworks",
      location: "Remote EU",
      score: 3.8,
      statusId: "evaluated",
    });
    expect(apps[1].location).toBe("Paris");
    expect(apps[1].score).toBe(4.0);
  });
});

describe.skipIf(!realReady)("FsDataSource — real tracker snapshot", () => {
  const ds = new FsDataSource(REAL);

  it("parses every row and zod-validates at the boundary", async () => {
    const apps = await ds.getApplications();
    expect(apps.length).toBeGreaterThan(0);
    for (const app of apps) {
      expect(() => applicationSchema.parse(app)).not.toThrow();
      expect(app.company.length).toBeGreaterThan(0);
      expect(app.role.length).toBeGreaterThan(0);
    }
  });

  it("resolves every status in the real tracker to a canonical state", async () => {
    const apps = await ds.getApplications();
    const unresolved = apps.filter((a) => a.statusId === null);
    expect(unresolved).toEqual([]);
  });

  it("parses scores as numbers within 0..5", async () => {
    const apps = await ds.getApplications();
    for (const app of apps) {
      if (app.score !== null) {
        expect(app.score).toBeGreaterThanOrEqual(0);
        expect(app.score).toBeLessThanOrEqual(5);
      }
    }
  });
});
