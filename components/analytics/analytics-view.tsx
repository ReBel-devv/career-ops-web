"use client";

import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useApplications,
  usePatterns,
  useReportFacets,
} from "@/lib/client/queries";
import {
  archetypeBreakdownFromFacets,
  foldTail,
  funnelStages,
  hasNamedArchetypes,
  locationBreakdownFromFacets,
  scoreHistogram,
  vendorChartData,
  type BreakdownDatum,
} from "@/lib/analytics";
import type { Application, Patterns, ReportFacet } from "@/lib/domain";
import { BreakdownBars } from "./breakdown-bars";
import { ChartCard, ChartEmpty } from "./chart-card";
import { FunnelChart } from "./funnel-chart";
import { RecommendationsCard } from "./recommendations-card";
import { ScoreHistogram } from "./score-histogram";
import { VendorChart } from "./vendor-chart";

/**
 * /analytics (F5) — everything analytical comes from analyze-patterns.mjs
 * verbatim; report facets (M3) fill the archetype/location/vendor breakdowns
 * the script currently can't resolve; the score histogram is binned from the
 * tracker's own scores (the script only reports per-outcome min/avg/max).
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
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
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
      scores={(applicationsQuery.data ?? []).map((a) => a.score)}
      facets={facetsQuery.data ?? []}
      applications={applicationsQuery.data ?? []}
    />
  );
}

function AnalyticsCharts({
  patterns,
  scores,
  facets,
  applications,
}: {
  patterns: Patterns;
  scores: (number | null)[];
  facets: ReportFacet[];
  applications: Application[];
}) {
  const stages = useMemo(() => funnelStages(patterns.funnel), [patterns]);
  const bins = useMemo(() => scoreHistogram(scores), [scores]);

  const archetypes = useMemo((): {
    data: BreakdownDatum[];
    source: "script" | "facets";
  } => {
    if (hasNamedArchetypes(patterns.archetypeBreakdown)) {
      return {
        source: "script",
        data: foldTail(
          patterns.archetypeBreakdown.map((a) => ({
            label: a.archetype,
            count: a.total,
          })),
        ),
      };
    }
    return { source: "facets", data: archetypeBreakdownFromFacets(facets) };
  }, [patterns, facets]);

  const locations = useMemo(
    () => locationBreakdownFromFacets(facets),
    [facets],
  );
  const vendors = useMemo(
    () => vendorChartData(patterns.vendorAnalysis, facets, applications),
    [patterns, facets, applications],
  );

  const { metadata, scoreThreshold, vendorAnalysis } = patterns;
  const range = metadata.dateRange;

  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-xs text-muted-foreground">
        {metadata.total} applications
        {range?.from && range?.to ? ` · ${range.from} → ${range.to}` : ""}
        {" · analyzed "}
        {metadata.analysisDate}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard
          title="Funnel"
          subtitle="Applications that reached at least each stage, with stage conversion."
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
          title="Archetypes"
          subtitle={
            archetypes.source === "script"
              ? "Applications per archetype (analyze-patterns)."
              : "Reports per archetype family (report facets — the script resolved no archetypes)."
          }
        >
          {archetypes.data.length === 0 ? (
            <ChartEmpty>No archetype data yet.</ChartEmpty>
          ) : (
            <BreakdownBars data={archetypes.data} />
          )}
        </ChartCard>

        <ChartCard
          title="Locations"
          subtitle="Reports per location bucket (report facets)."
        >
          {locations.length === 0 ? (
            <ChartEmpty>No location data yet.</ChartEmpty>
          ) : (
            <BreakdownBars data={locations} />
          )}
        </ChartCard>

        <ChartCard
          className="md:col-span-2"
          title="ATS channel yield"
          subtitle={
            vendors.source === "script"
              ? "Advance rate per ATS vendor (analyze-patterns). Gray bars = below the minimum sample — shown, not claimed."
              : "Advance rate per ATS vendor, derived from report facets (the script identified no vendors). Gray bars = below the minimum sample — shown, not claimed."
          }
          footer={
            <>
              <span className="font-mono">
                {vendors.identified}/{vendors.submitted}
              </span>{" "}
              submitted applications routed through an identified vendor ·
              overall advance rate{" "}
              <span className="font-mono">
                {vendorAnalysis.overallAdvanceRate}%
              </span>{" "}
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
      </div>

      <RecommendationsCard recommendations={patterns.recommendations} />
    </div>
  );
}
