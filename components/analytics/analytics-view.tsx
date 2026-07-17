"use client";

import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useApplications,
  usePatterns,
  useReportFacets,
} from "@/lib/client/queries";
import {
  applicationsSince,
  archetypeYield,
  dailyActivity,
  funnelStages,
  locationBreakdownFromFacets,
  locationCoverageSummary,
  scoreHistogram,
  scoreOutcomeBands,
  scorePredictionSummary,
  statusCounts,
  vendorBarsFromFacets,
  vendorChartData,
  weeklyActivity,
  type VendorChartData,
} from "@/lib/analytics";
import { globeCities } from "@/lib/geo";
import type { Application, Patterns, ReportFacet } from "@/lib/domain";
import {
  ActivityChart,
  ActivityLegend,
  GRANULARITY_OPTIONS,
  type ActivityGranularity,
} from "./activity-chart";
import { AgingCard } from "./aging-card";
import { BreakdownBars } from "./breakdown-bars";
import { ChartCard, ChartEmpty } from "./chart-card";
import { FunnelChart } from "./funnel-chart";
import { KpiCards } from "./kpi-cards";
import { OfferGlobe, OfferGlobeCityList } from "./offer-globe";
import {
  RangeControl,
  RANGE_OPTIONS,
  SegmentedControl,
  type RangeKey,
} from "./range-control";
import { RateBars } from "./rate-bars";
import { RecommendationsCard } from "./recommendations-card";
import { ScoreHistogram } from "./score-histogram";
import { VendorChart } from "./vendor-chart";

/** Wall clock frozen at module load — render stays pure; the range cutoffs
 * don't need to tick within a session. */
const LOADED_AT = Date.now();

/**
 * /analytics (F5) — everything analytical comes from analyze-patterns.mjs
 * verbatim; report facets (M3) fill the archetype/location/vendor breakdowns
 * the script currently can't resolve; the score histogram is binned from the
 * tracker's own scores (the script only reports per-outcome min/avg/max).
 *
 * Layout (dashboard idiom): KPI band → activity + funnel → distribution row →
 * channel yield + offer globe (desktop gimmick) → recommendations.
 */
export function AnalyticsView() {
  const patternsQuery = usePatterns();
  const applicationsQuery = useApplications();
  const facetsQuery = useReportFacets();

  const isLoading =
    patternsQuery.isLoading ||
    applicationsQuery.isLoading ||
    facetsQuery.isLoading;
  const firstError = [patternsQuery, applicationsQuery, facetsQuery].find(
    (q) => q.isError,
  )?.error;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    );
  }

  if (firstError || !patternsQuery.data) {
    return (
      <div
        role="alert"
        className="max-w-prose rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <p className="font-medium">Could not load analytics</p>
        <p className="mt-1 text-muted-foreground">
          {firstError instanceof Error ? firstError.message : "Unknown error"}
        </p>
      </div>
    );
  }

  const result = patternsQuery.data;
  if (result.kind === "insufficient") {
    return (
      <div className="max-w-prose rounded-lg border bg-card p-4 text-sm">
        <p className="font-medium">Not enough data yet</p>
        <p className="mt-1 text-muted-foreground">{result.message}</p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {result.current}/{result.threshold} applications beyond
          &ldquo;Evaluated&rdquo;
        </p>
      </div>
    );
  }

  return (
    <AnalyticsCharts
      patterns={result.patterns}
      facets={facetsQuery.data ?? []}
      applications={applicationsQuery.data ?? []}
    />
  );
}

function AnalyticsCharts({
  patterns,
  facets,
  applications,
}: {
  patterns: Patterns;
  facets: ReportFacet[];
  applications: Application[];
}) {
  const [rangeKey, setRangeKey] = useState<RangeKey>("all");
  const rangeDays =
    RANGE_OPTIONS.find((o) => o.key === rangeKey)?.days ?? null;
  const filtered = rangeDays !== null;

  /** Rows inside the selected trailing window (all rows when unfiltered). */
  const apps = useMemo(
    () =>
      rangeDays === null
        ? applications
        : applicationsSince(applications, rangeDays, LOADED_AT),
    [applications, rangeDays],
  );
  /** Facets restricted to the filtered rows (locations / globe / yields). */
  const rangeFacets = useMemo(() => {
    if (!filtered) return facets;
    const nums = new Set(apps.map((a) => a.num));
    return facets.filter((f) => nums.has(f.num));
  }, [facets, apps, filtered]);

  // Unfiltered: the script's own funnel counts, verbatim (F5). Filtered: the
  // same stage math over the range's tracker statuses.
  const stages = useMemo(
    () => funnelStages(filtered ? statusCounts(apps) : patterns.funnel),
    [filtered, apps, patterns],
  );
  const bins = useMemo(
    () => scoreHistogram(apps.map((a) => a.score)),
    [apps],
  );
  const [granularity, setGranularity] = useState<ActivityGranularity>("weekly");
  const activity = useMemo(
    () => (granularity === "weekly" ? weeklyActivity(apps) : dailyActivity(apps)),
    [apps, granularity],
  );
  const mapCities = useMemo(
    () => globeCities(apps, facets),
    [apps, facets],
  );

  const minSample = patterns.vendorAnalysis.minSampleForClaim;
  const scoreBands = useMemo(
    () => scoreOutcomeBands(apps, minSample),
    [apps, minSample],
  );
  const archetypes = useMemo(
    () => archetypeYield(facets, apps, minSample),
    [facets, apps, minSample],
  );

  const locations = useMemo(
    () => locationBreakdownFromFacets(rangeFacets),
    [rangeFacets],
  );
  // Unfiltered: script analysis when it identified vendors. Filtered: always
  // the facet-derived channel yield over the range.
  const vendors = useMemo((): VendorChartData => {
    if (!filtered) {
      return vendorChartData(patterns.vendorAnalysis, facets, applications);
    }
    const fallback = vendorBarsFromFacets(facets, apps, minSample);
    return { source: "facets", minSample, ...fallback };
  }, [filtered, patterns, facets, applications, apps, minSample]);

  const { metadata, scoreThreshold, vendorAnalysis } = patterns;
  const range = metadata.dateRange;
  const mapped = mapCities.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs text-muted-foreground">
          {filtered
            ? `${apps.length} of ${metadata.total} applications · last ${rangeDays}d`
            : `${metadata.total} applications${
                range?.from && range?.to ? ` · ${range.from} → ${range.to}` : ""
              }`}
          {" · analyzed "}
          {metadata.analysisDate}
        </p>
        <RangeControl value={rangeKey} onChange={setRangeKey} />
      </div>

      <KpiCards applications={apps} allApplications={applications} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ChartCard
          className="md:col-span-2 lg:col-span-2"
          title="Activity"
          subtitle={`Tracker rows per ${
            granularity === "weekly" ? "week" : "day"
          } — a row's date becomes its apply date once it turns Applied.`}
          aside={
            // Stacked on narrow screens so the toggle doesn't crush the
            // title column; inline once the card is wide enough.
            <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <ActivityLegend />
              <SegmentedControl
                ariaLabel="Activity granularity"
                options={GRANULARITY_OPTIONS}
                value={granularity}
                onChange={setGranularity}
              />
            </div>
          }
        >
          {activity.length === 0 ? (
            <ChartEmpty>No dated applications yet.</ChartEmpty>
          ) : (
            <ActivityChart points={activity} granularity={granularity} />
          )}
        </ChartCard>

        <ChartCard
          title="Funnel"
          subtitle={
            filtered
              ? "Applications that reached at least each stage — tracker statuses, filtered range."
              : "Applications that reached at least each stage, with stage conversion."
          }
        >
          <FunnelChart stages={stages} />
        </ChartCard>

        <ChartCard
          title="Score distribution"
          subtitle="Tracker scores, 0.5-wide bins."
          footer={
            <>
              Recommended threshold{" "}
              <span className="font-mono font-semibold text-foreground">
                {scoreThreshold.recommended}/5
              </span>{" "}
              — {scoreThreshold.reasoning}
            </>
          }
        >
          {bins.length === 0 ? (
            <ChartEmpty>No scored applications yet.</ChartEmpty>
          ) : (
            <ScoreHistogram bins={bins} />
          )}
        </ChartCard>

        <ChartCard
          title="Does the score predict replies?"
          subtitle="Advance rate per score band — submitted, scored applications only."
          footer={
            scoreBands.length > 0
              ? scorePredictionSummary(scoreBands, minSample)
              : undefined
          }
        >
          {scoreBands.length === 0 ? (
            <ChartEmpty>No scored submission yet.</ChartEmpty>
          ) : (
            // Center the short 4-band chart in the card's height (it's row-
            // matched to the taller Score distribution) so it doesn't sit atop
            // a void; the footer verdict answers the card's own question.
            <div className="flex flex-1 flex-col justify-center">
              <RateBars data={scoreBands} minSample={minSample} yAxisWidth={64} />
            </div>
          )}
        </ChartCard>

        <AgingCard applications={apps} />

        <ChartCard
          title="Archetype yield"
          subtitle="Advance rate per archetype family (report facets + tracker statuses)."
        >
          {archetypes.length === 0 ? (
            <ChartEmpty>No submitted application with an archetype yet.</ChartEmpty>
          ) : (
            <RateBars data={archetypes} minSample={minSample} yAxisWidth={132} />
          )}
        </ChartCard>

        <ChartCard
          title="Locations"
          subtitle="Reports per location bucket (report facets)."
          footer={
            locations.length > 0
              ? locationCoverageSummary(locations)
              : undefined
          }
        >
          {locations.length === 0 ? (
            <ChartEmpty>No location data yet.</ChartEmpty>
          ) : (
            // Center the buckets in the card's height (row-matched to the
            // taller Archetype yield) so they don't sit atop a void; the
            // footer reports how much of the data carries a parsed location.
            <div className="flex flex-1 flex-col justify-center">
              <BreakdownBars data={locations} />
            </div>
          )}
        </ChartCard>

        {/* Desktop-only gimmick — the Locations bars above stay the complete view. */}
        <ChartCard
          className="hidden lg:flex lg:row-span-2"
          title="Offer map"
          subtitle="One dot per city — hover a marker for offers and best score."
          footer={
            <>
              <span className="font-mono">
                {mapped}/{apps.length}
              </span>{" "}
              offers resolved to a city — remote/unparsed locations aren&apos;t
              plotted.
            </>
          }
        >
          {mapCities.length === 0 ? (
            <ChartEmpty>No offer resolved to a city yet.</ChartEmpty>
          ) : (
            // flex-1 + justify-center: globe and top-cities share the card's
            // full height evenly (footer stays pinned at the bottom) instead
            // of leaving a dead zone under the globe.
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
              <OfferGlobe cities={mapCities} />
              <OfferGlobeCityList cities={mapCities} />
            </div>
          )}
        </ChartCard>

        <ChartCard
          className="md:col-span-2 lg:col-span-2"
          title="ATS channel yield"
          subtitle={
            filtered
              ? "Advance rate per ATS vendor over the filtered range (report facets + tracker statuses). Gray bars = below the minimum sample — shown, not claimed."
              : vendors.source === "script"
                ? "Advance rate per ATS vendor (analyze-patterns). Gray bars = below the minimum sample — shown, not claimed."
                : "Advance rate per ATS vendor, derived from report facets (the script identified no vendors). Gray bars = below the minimum sample — shown, not claimed."
          }
          footer={
            <>
              <span className="font-mono">
                {vendors.identified}/{vendors.submitted}
              </span>{" "}
              submitted applications routed through an identified vendor
              {!filtered ? (
                <>
                  {" "}
                  · overall advance rate{" "}
                  <span className="font-mono">
                    {vendorAnalysis.overallAdvanceRate}%
                  </span>
                </>
              ) : null}{" "}
              · claims need n ≥{" "}
              <span className="font-mono">{vendors.minSample}</span>
              {vendorAnalysis.citation ? (
                <span className="mt-1 block">{vendorAnalysis.citation}</span>
              ) : null}
            </>
          }
        >
          <VendorChart chart={vendors} />
        </ChartCard>

        <RecommendationsCard
          className="md:col-span-2 lg:col-span-3"
          recommendations={patterns.recommendations}
        />
      </div>
    </div>
  );
}
