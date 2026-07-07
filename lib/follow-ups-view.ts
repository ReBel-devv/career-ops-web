import type { CadenceEntry, FollowUpCadence } from "@/lib/domain";

/**
 * Pure, testable view logic for the follow-up calendar (F6). NONE of this
 * recomputes cadence — it only arranges the entries `followup-cadence.mjs`
 * already produced into an overdue list, an agenda, and a month grid.
 */

/** An entry needing action now: past its pinned date (overdue) or act-now
 * (urgent = a fresh response awaiting reply). These pin to the TOP everywhere. */
export function entryIsOverdue(e: CadenceEntry): boolean {
  return e.urgency === "overdue" || e.urgency === "urgent";
}

export interface CadencePartition {
  /** Needs action now, soonest-dated first. */
  overdue: CadenceEntry[];
  /** Future-dated follow-ups, soonest first. */
  upcoming: CadenceEntry[];
  /** Cold — no scheduled next follow-up (hit the max). */
  cold: CadenceEntry[];
}

function byNextDateAsc(a: CadenceEntry, b: CadenceEntry): number {
  const da = a.nextFollowupDate ?? "";
  const db = b.nextFollowupDate ?? "";
  if (da !== db) return da < db ? -1 : 1;
  return a.num - b.num;
}

export function partitionCadence(cadence: FollowUpCadence): CadencePartition {
  const overdue: CadenceEntry[] = [];
  const upcoming: CadenceEntry[] = [];
  const cold: CadenceEntry[] = [];
  for (const e of cadence.entries) {
    if (entryIsOverdue(e)) overdue.push(e);
    else if (e.nextFollowupDate) upcoming.push(e);
    else cold.push(e);
  }
  overdue.sort(byNextDateAsc);
  upcoming.sort(byNextDateAsc);
  cold.sort((a, b) => a.num - b.num);
  return { overdue, upcoming, cold };
}

/** App nums with an overdue/urgent follow-up — powers the board card glyph. */
export function overdueAppNums(cadence: FollowUpCadence): Set<number> {
  const set = new Set<number>();
  for (const e of cadence.entries) if (entryIsOverdue(e)) set.add(e.num);
  return set;
}

export interface FollowUpSummary {
  /** Due today or already past (daysUntilNext ≤ 0). */
  due: number;
  /** Past their pinned date (urgency = overdue). */
  overdue: number;
}

export function followUpSummary(cadence: FollowUpCadence): FollowUpSummary {
  let due = 0;
  let overdue = 0;
  for (const e of cadence.entries) {
    if (e.daysUntilNext !== null && e.daysUntilNext <= 0) due += 1;
    if (e.urgency === "overdue") overdue += 1;
  }
  return { due, overdue };
}

/** Agenda rows: one group per date with a scheduled follow-up, ascending. */
export interface AgendaGroup {
  date: string;
  entries: CadenceEntry[];
}

export function agendaGroups(entries: CadenceEntry[]): AgendaGroup[] {
  const byDate = new Map<string, CadenceEntry[]>();
  for (const e of entries) {
    if (!e.nextFollowupDate) continue;
    const list = byDate.get(e.nextFollowupDate);
    if (list) list.push(e);
    else byDate.set(e.nextFollowupDate, [e]);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, es]) => ({ date, entries: es.sort((x, y) => x.num - y.num) }));
}

/* ------------------------------------------------------- month grid --- */

export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  entries: CadenceEntry[];
}

function isoOf(year: number, monthIndex0: number, day: number): string {
  const m = String(monthIndex0 + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/** Day-of-week (0=Sun..6=Sat) for a Y/M/D in UTC — stable, tz-independent. */
function weekdayUtc(year: number, monthIndex0: number, day: number): number {
  return new Date(Date.UTC(year, monthIndex0, day)).getUTCDay();
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/**
 * A 6×7 (weeks × days) month matrix. `weekStartsOn` defaults to Monday (EU).
 * Each cell carries the scheduled follow-ups landing on that exact date.
 * Overdue items are rendered separately (pinned on top), not on the grid.
 */
export function buildMonthMatrix(
  year: number,
  monthIndex0: number,
  entries: CadenceEntry[],
  today: string,
  weekStartsOn: 0 | 1 = 1,
): CalendarDay[][] {
  const byDate = new Map<string, CadenceEntry[]>();
  for (const e of entries) {
    if (!e.nextFollowupDate) continue;
    const list = byDate.get(e.nextFollowupDate);
    if (list) list.push(e);
    else byDate.set(e.nextFollowupDate, [e]);
  }

  const firstWeekday = weekdayUtc(year, monthIndex0, 1);
  // Cells to render before the 1st so it lands in the right column.
  const lead = (firstWeekday - weekStartsOn + 7) % 7;
  const total = daysInMonth(year, monthIndex0);

  const cells: CalendarDay[] = [];
  // Leading days from the previous month.
  const prevMonth = monthIndex0 === 0 ? 11 : monthIndex0 - 1;
  const prevYear = monthIndex0 === 0 ? year - 1 : year;
  const prevTotal = daysInMonth(prevYear, prevMonth);
  for (let i = lead - 1; i >= 0; i--) {
    const day = prevTotal - i;
    const date = isoOf(prevYear, prevMonth, day);
    cells.push({ date, day, inMonth: false, isToday: date === today, entries: [] });
  }
  // Days in this month.
  for (let day = 1; day <= total; day++) {
    const date = isoOf(year, monthIndex0, day);
    cells.push({
      date,
      day,
      inMonth: true,
      isToday: date === today,
      entries: (byDate.get(date) ?? []).sort((a, b) => a.num - b.num),
    });
  }
  // Trailing days to fill full weeks (up to a 6-week grid for a stable height).
  const nextMonth = monthIndex0 === 11 ? 0 : monthIndex0 + 1;
  const nextYear = monthIndex0 === 11 ? year + 1 : year;
  let nextDay = 1;
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const date = isoOf(nextYear, nextMonth, nextDay);
    cells.push({ date, day: nextDay, inMonth: false, isToday: date === today, entries: [] });
    nextDay += 1;
    if (cells.length >= 42 && cells.length % 7 === 0) break;
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
