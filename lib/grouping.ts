import type { Application, CanonicalState } from "@/lib/domain";
import { ARCHIVED_GROUPS } from "@/lib/filters";

/**
 * Group applications into Kanban columns (F1).
 *
 * Columns follow the states.yml declared order (the funnel order). Each row is
 * placed by its resolved canonical `statusId`, so aliases already collapsed
 * upstream by `buildStatusResolver` (`aplicado` → `applied`, `sent` → `applied`)
 * land in the correct canonical column. Rows whose status never resolved
 * (`statusId === null`) can't be placed and are returned separately — they still
 * appear in the table view, just not on the board.
 */

export interface BoardColumn {
  state: CanonicalState;
  applications: Application[];
  /** True for Rejected / Discarded / SKIP (hidden unless "show archived"). */
  archived: boolean;
}

export interface GroupedBoard {
  columns: BoardColumn[];
  /** Rows with an unresolvable status — not shown as a column. */
  ungrouped: Application[];
}

export function groupApplications(
  applications: Application[],
  states: CanonicalState[],
): GroupedBoard {
  const byId = new Map<string, Application[]>();
  for (const state of states) byId.set(state.id, []);

  const ungrouped: Application[] = [];
  for (const app of applications) {
    const bucket = app.statusId !== null ? byId.get(app.statusId) : undefined;
    if (bucket) bucket.push(app);
    else ungrouped.push(app);
  }

  const columns: BoardColumn[] = states.map((state) => ({
    state,
    applications: byId.get(state.id) ?? [],
    archived: ARCHIVED_GROUPS.has(state.dashboardGroup),
  }));

  return { columns, ungrouped };
}

/** Columns to render given the archived toggle — hides archived columns when off. */
export function visibleColumns(
  board: GroupedBoard,
  showArchived: boolean,
): BoardColumn[] {
  return showArchived
    ? board.columns
    : board.columns.filter((c) => !c.archived);
}
