"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  useApplications,
  useApplicationActions,
  useFollowUpCadence,
  useOutreach,
  useReportFacets,
  useStates,
} from "@/lib/client/queries";
import { useMutationsEnabled } from "@/components/providers/app-providers";
import { KanbanBoard } from "@/components/board/kanban-board";
import { MobileBoard } from "@/components/board/mobile-board";
import { Skeleton } from "@/components/ui/skeleton";
import { buildFacetIndex, filterApplications, parseFilters } from "@/lib/filters";
import { groupApplications, visibleColumns } from "@/lib/grouping";
import { overdueAppNums } from "@/lib/follow-ups-view";
import { outreachHints } from "@/lib/outreach-view";
import type { Application } from "@/lib/domain";

/**
 * Kanban board container (F1). Reads applications + states from the shared
 * TanStack Query cache, applies the URL filters (F4), groups into columns, and
 * renders the desktop drag board or the mobile switcher depending on viewport
 * (CSS-only: both mount, one is hidden). Moves go through the shared optimistic
 * mutation (`useApplicationActions`).
 */
export function Board() {
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const appsQuery = useApplications();
  const statesQuery = useStates();
  const facetsQuery = useReportFacets();
  const cadenceQuery = useFollowUpCadence();
  const outreachQuery = useOutreach();
  const actions = useApplicationActions();
  const mutationsEnabled = useMutationsEnabled();

  const overdueNums = useMemo(
    () => (cadenceQuery.data ? overdueAppNums(cadenceQuery.data) : new Set<number>()),
    [cadenceQuery.data],
  );

  const outreachByNum = useMemo(
    () => outreachHints(outreachQuery.data ?? []),
    [outreachQuery.data],
  );

  const board = useMemo(() => {
    if (!appsQuery.data || !statesQuery.data) return null;
    const facetIndex = buildFacetIndex(facetsQuery.data ?? []);
    const filtered = filterApplications(appsQuery.data, filters, facetIndex);
    const grouped = groupApplications(filtered, statesQuery.data);
    // Auto-sort key: a row's index in the (order-preserving) filtered global
    // array. The optimistic move only flips a row's statusId in place, so when a
    // card lands in a new column it sits among that column's members in this same
    // global order. The board uses this rank to open the make-room gap exactly
    // where the card will actually land — not under the pointer.
    const rankByNum = new Map<number, number>();
    filtered.forEach((app, i) => rankByNum.set(app.num, i));
    return {
      columns: visibleColumns(grouped, filters.archived),
      states: statesQuery.data,
      rankByNum,
    };
  }, [appsQuery.data, statesQuery.data, facetsQuery.data, filters]);

  if (appsQuery.isError || statesQuery.isError) {
    const message =
      (appsQuery.error instanceof Error && appsQuery.error.message) ||
      (statesQuery.error instanceof Error && statesQuery.error.message) ||
      "Unknown error";
    return (
      <div
        role="alert"
        className="max-w-prose rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <p className="font-medium">Could not load the board</p>
        <p className="mt-1 text-muted-foreground">{message}</p>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-64 shrink-0" />
        ))}
      </div>
    );
  }

  const onMove = (app: Application, statusId: string) =>
    actions.moveStatus(app, statusId);

  return (
    <>
      <div className="hidden h-[calc(100dvh-13rem)] md:block">
        <KanbanBoard
          columns={board.columns}
          states={board.states}
          rankByNum={board.rankByNum}
          onMove={onMove}
          disabled={!mutationsEnabled}
          overdueNums={overdueNums}
          outreachByNum={outreachByNum}
        />
      </div>
      <div className="md:hidden">
        <MobileBoard
          columns={board.columns}
          states={board.states}
          onMove={onMove}
          disabled={!mutationsEnabled}
          overdueNums={overdueNums}
          outreachByNum={outreachByNum}
        />
      </div>
    </>
  );
}
