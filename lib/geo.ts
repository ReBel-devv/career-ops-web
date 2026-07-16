import type { Application, ReportFacet } from "@/lib/domain";
import { SUBMITTED_STATUS_IDS } from "@/lib/stats";

/**
 * City gazetteer for the offer globe (/analytics). Free-text report locations
 * ("Paris, France (hybride…)", "Londres — on-site", "Remote EU") are matched
 * against a fixed list of city aliases — no network geocoding, ever (the
 * tracker is private data). Unmatched / fully-remote offers simply don't get
 * a marker; the Locations bar chart remains the complete view.
 */

export interface GeoCity {
  /** Canonical display name. */
  name: string;
  /** [latitude, longitude] — cobe marker order. */
  location: [number, number];
  /** Lowercase, accent-stripped alias list (whole-word matched). */
  aliases: ReadonlyArray<string>;
}

/** Alias rules: lowercase, no accents; multi-word aliases keep single spaces. */
const CITIES: ReadonlyArray<GeoCity> = [
  // France
  { name: "Paris", location: [48.86, 2.35], aliases: ["paris"] },
  { name: "Lyon", location: [45.76, 4.84], aliases: ["lyon"] },
  { name: "Bordeaux", location: [44.84, -0.58], aliases: ["bordeaux"] },
  { name: "Nantes", location: [47.22, -1.55], aliases: ["nantes"] },
  { name: "Montpellier", location: [43.61, 3.88], aliases: ["montpellier"] },
  { name: "Toulouse", location: [43.6, 1.44], aliases: ["toulouse"] },
  { name: "Lille", location: [50.63, 3.06], aliases: ["lille"] },
  { name: "Roubaix", location: [50.69, 3.17], aliases: ["roubaix"] },
  { name: "Beauvais", location: [49.43, 2.08], aliases: ["beauvais"] },
  { name: "Angers", location: [47.47, -0.55], aliases: ["angers"] },
  { name: "Rennes", location: [48.11, -1.68], aliases: ["rennes"] },
  { name: "Marseille", location: [43.3, 5.37], aliases: ["marseille"] },
  { name: "Grenoble", location: [45.19, 5.72], aliases: ["grenoble"] },
  { name: "Strasbourg", location: [48.57, 7.75], aliases: ["strasbourg"] },
  // Europe
  { name: "London", location: [51.51, -0.13], aliases: ["london", "londres"] },
  { name: "Lisbon", location: [38.72, -9.14], aliases: ["lisbon", "lisbonne", "lisboa"] },
  { name: "Madrid", location: [40.42, -3.7], aliases: ["madrid"] },
  { name: "Barcelona", location: [41.39, 2.17], aliases: ["barcelona", "barcelone"] },
  { name: "Dublin", location: [53.35, -6.26], aliases: ["dublin"] },
  { name: "Amsterdam", location: [52.37, 4.9], aliases: ["amsterdam"] },
  { name: "Utrecht", location: [52.09, 5.12], aliases: ["utrecht"] },
  { name: "Groningen", location: [53.22, 6.57], aliases: ["groningen", "groningue"] },
  { name: "Brussels", location: [50.85, 4.35], aliases: ["brussels", "bruxelles"] },
  { name: "Berlin", location: [52.52, 13.4], aliases: ["berlin"] },
  { name: "Munich", location: [48.14, 11.58], aliases: ["munich", "munchen"] },
  { name: "Zurich", location: [47.37, 8.54], aliases: ["zurich"] },
  { name: "Lucerne", location: [47.05, 8.31], aliases: ["lucerne", "luzern"] },
  { name: "Geneva", location: [46.2, 6.15], aliases: ["geneva", "geneve"] },
  { name: "Milan", location: [45.46, 9.19], aliases: ["milan", "milano"] },
  { name: "Vienna", location: [48.21, 16.37], aliases: ["vienna", "vienne"] },
  { name: "Prague", location: [50.08, 14.44], aliases: ["prague", "praha"] },
  { name: "Warsaw", location: [52.23, 21.01], aliases: ["warsaw", "varsovie"] },
  { name: "Copenhagen", location: [55.68, 12.57], aliases: ["copenhagen", "copenhague"] },
  { name: "Stockholm", location: [59.33, 18.07], aliases: ["stockholm"] },
  { name: "Oslo", location: [59.91, 10.75], aliases: ["oslo"] },
  { name: "Helsinki", location: [60.17, 24.94], aliases: ["helsinki"] },
  { name: "Tallinn", location: [59.44, 24.75], aliases: ["tallinn"] },
  // Americas
  { name: "San Francisco", location: [37.77, -122.42], aliases: ["san francisco", "sf"] },
  { name: "San Mateo", location: [37.56, -122.33], aliases: ["san mateo"] },
  { name: "Seattle", location: [47.61, -122.33], aliases: ["seattle"] },
  { name: "Los Angeles", location: [34.05, -118.24], aliases: ["los angeles"] },
  { name: "Denver", location: [39.74, -104.99], aliases: ["denver"] },
  { name: "Austin", location: [30.27, -97.74], aliases: ["austin"] },
  { name: "Chicago", location: [41.88, -87.63], aliases: ["chicago"] },
  { name: "Boston", location: [42.36, -71.06], aliases: ["boston"] },
  { name: "New York", location: [40.71, -74.01], aliases: ["new york", "nyc"] },
  { name: "Toronto", location: [43.65, -79.38], aliases: ["toronto"] },
  { name: "Montreal", location: [45.5, -73.57], aliases: ["montreal"] },
  { name: "Vancouver", location: [49.28, -123.12], aliases: ["vancouver"] },
  // APAC / other
  { name: "Tokyo", location: [35.68, 139.65], aliases: ["tokyo"] },
  { name: "Singapore", location: [1.35, 103.82], aliases: ["singapore", "singapour"] },
  { name: "Sydney", location: [-33.87, 151.21], aliases: ["sydney"] },
  { name: "Tel Aviv", location: [32.08, 34.78], aliases: ["tel aviv"] },
];

/** Lowercase + strip accents + collapse whitespace, so "Zürich — hybride"
 * matches the accentless alias table. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

interface CompiledCity {
  city: GeoCity;
  patterns: ReadonlyArray<RegExp>;
}

/** Whole-word match (no letter on either side) so "sf" never fires inside a
 * longer word. Compiled once at module load. */
const COMPILED: ReadonlyArray<CompiledCity> = CITIES.map((city) => ({
  city,
  patterns: city.aliases.map(
    (alias) => new RegExp(`(?:^|[^a-z])${alias}(?:[^a-z]|$)`),
  ),
}));

/**
 * Primary city of a free-text location — the EARLIEST alias occurrence wins,
 * so "San Francisco (option Seattle / Londres)" resolves to San Francisco and
 * a multi-site "London / Remote / Copenhagen" to London. Null when nothing
 * matches (pure-remote / unparseable text).
 */
export function cityFromLocation(text: string | null | undefined): GeoCity | null {
  if (!text) return null;
  const t = normalize(text);
  let best: { city: GeoCity; index: number } | null = null;
  for (const { city, patterns } of COMPILED) {
    for (const pattern of patterns) {
      const match = pattern.exec(t);
      if (match === null) continue;
      // The pattern may consume one leading non-letter — index the alias itself.
      const index = match.index + (match[0].length > 0 && /[^a-z]/.test(match[0][0]) ? 1 : 0);
      if (best === null || index < best.index) best = { city, index };
    }
  }
  return best?.city ?? null;
}

/** One globe marker = one city, aggregated over every offer resolved there. */
export interface GlobeCity {
  name: string;
  location: [number, number];
  /** Offers whose primary city is this one. */
  count: number;
  /** Of those, how many were actually submitted (reached at least Applied). */
  appliedCount: number;
  /** Highest tracker score among the city's offers, null when none scored. */
  bestScore: number | null;
}

/**
 * Join tracker rows to their report facet's free-text location and aggregate
 * per city, sorted by count desc (ties: name asc). Offers without a facet,
 * without a location, or with an unmatched location are skipped — the globe
 * is a gimmick view, the bar charts stay the honest/complete ones.
 */
export function globeCities(
  applications: ReadonlyArray<Application>,
  facets: ReadonlyArray<ReportFacet>,
): GlobeCity[] {
  const locationByNum = new Map(facets.map((f) => [f.num, f.location]));
  const byCity = new Map<string, GlobeCity>();

  for (const app of applications) {
    // Tracker's own Location column (when present) wins over the report text.
    const city = cityFromLocation(
      app.location ?? locationByNum.get(app.num) ?? null,
    );
    if (!city) continue;
    const entry = byCity.get(city.name) ?? {
      name: city.name,
      location: city.location,
      count: 0,
      appliedCount: 0,
      bestScore: null,
    };
    entry.count += 1;
    if (app.statusId !== null && SUBMITTED_STATUS_IDS.has(app.statusId)) {
      entry.appliedCount += 1;
    }
    if (app.score !== null && app.score > 0) {
      entry.bestScore =
        entry.bestScore === null ? app.score : Math.max(entry.bestScore, app.score);
    }
    byCity.set(city.name, entry);
  }

  return [...byCity.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
}
