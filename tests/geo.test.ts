import { describe, expect, it } from "vitest";
import { cityFromLocation, globeCities } from "@/lib/geo";
import type { Application, ReportFacet } from "@/lib/domain";

function app(
  num: number,
  statusId: string | null,
  score: number | null = null,
  location: string | null = null,
): Application {
  return {
    num,
    date: "2026-07-01",
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
    location,
  };
}

function facet(num: number, location: string | null): ReportFacet {
  return { num, archetype: null, atsVendor: null, locationBucket: null, location };
}

describe("cityFromLocation", () => {
  it("matches accented French city names against the accentless gazetteer", () => {
    expect(cityFromLocation("Zürich — hybride 3j")?.name).toBe("Zurich");
    expect(cityFromLocation("Londres, UK — on-site")?.name).toBe("London");
    expect(cityFromLocation("Lisbonne, PT — EU no-visa")?.name).toBe("Lisbon");
    expect(cityFromLocation("Varsovie, Pologne")?.name).toBe("Warsaw");
    expect(cityFromLocation("Montréal (hybride)")?.name).toBe("Montreal");
  });

  it("resolves multi-site strings to the earliest city mentioned", () => {
    expect(cityFromLocation("London / Remote / Copenhagen")?.name).toBe("London");
    expect(
      cityFromLocation("San Francisco (option Seattle / Londres)")?.name,
    ).toBe("San Francisco");
  });

  it("matches short aliases only as whole words", () => {
    expect(cityFromLocation("Remote-Friendly / SF / NYC")?.name).toBe(
      "San Francisco",
    );
    // "sf" inside a word must not fire.
    expect(cityFromLocation("transferable role")).toBeNull();
  });

  it("returns null for pure-remote or unparseable text", () => {
    expect(cityFromLocation("Remote EU (DE/IE/NL/PT/ES)")).toBeNull();
    expect(cityFromLocation(null)).toBeNull();
    expect(cityFromLocation("")).toBeNull();
  });
});

describe("globeCities", () => {
  it("aggregates offers per city with applied count and best score", () => {
    const apps = [
      app(1, "applied", 4.1),
      app(2, "evaluated", 3.4),
      app(3, "evaluated", 4.4),
      app(4, "evaluated", 2.8),
    ];
    const facets = [
      facet(1, "Paris, France (hybride)"),
      facet(2, "Paris — CDI"),
      facet(3, "Stockholm (on-site)"),
      facet(4, "Remote EU"), // unmatched → skipped
    ];
    const cities = globeCities(apps, facets);
    expect(cities.map((c) => c.name)).toEqual(["Paris", "Stockholm"]);
    expect(cities[0]).toMatchObject({
      count: 2,
      appliedCount: 1,
      bestScore: 4.1,
    });
    expect(cities[1]).toMatchObject({
      count: 1,
      appliedCount: 0,
      bestScore: 4.4,
    });
  });

  it("prefers the tracker's own Location column over the report facet", () => {
    const apps = [app(1, "evaluated", 3.0, "Lyon")];
    const facets = [facet(1, "Paris")];
    expect(globeCities(apps, facets)[0].name).toBe("Lyon");
  });

  it("skips offers with no facet at all", () => {
    expect(globeCities([app(1, "evaluated")], [])).toEqual([]);
  });
});
