"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { FilterBar } from "@/components/filters/filter-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { useApplications, useStates } from "@/lib/client/queries";
import { useMutationsEnabled } from "@/components/providers/app-providers";
import { filterApplications, parseFilters } from "@/lib/filters";

/**
 * Client Applications view — reads the same shared query cache and URL filters
 * (F4) as the Board, so filtering composes across both. Status edits go through
 * the shared optimistic mutation (StatusSelect → useApplicationActions).
 */
export function ApplicationsView() {
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const appsQuery = useApplications();
  const statesQuery = useStates();
  const mutationsEnabled = useMutationsEnabled();

  const filtered = useMemo(
    () => (appsQuery.data ? filterApplications(appsQuery.data, filters) : []),
    [appsQuery.data, filters],
  );

  if (appsQuery.isError) {
    const message =
      appsQuery.error instanceof Error ? appsQuery.error.message : "Unknown error";
    return (
      <div
        role="alert"
        className="max-w-prose rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <p className="font-medium">Could not read the tracker</p>
        <p className="mt-1 text-muted-foreground">{message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Applications</h1>
        {appsQuery.data ? (
          <span className="font-mono text-data tabular-nums text-muted-foreground">
            {filtered.length}
            {filtered.length !== appsQuery.data.length ? ` / ${appsQuery.data.length}` : ""}
          </span>
        ) : null}
      </div>
      <FilterBar />
      {appsQuery.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <ApplicationsTable
          applications={filtered}
          states={statesQuery.data ?? []}
          readOnly={!mutationsEnabled}
        />
      )}
    </div>
  );
}
