"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, FileText } from "lucide-react";
import { StatusSelect } from "@/components/applications/status-select";
import { ScoreBadge } from "@/components/data/score-badge";
import { STATUS_BORDER_CLASS, StatusIndicator } from "@/components/data/status-indicator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Application, CanonicalState } from "@/lib/domain";
import { cn } from "@/lib/utils";

type SortKey = "num" | "date" | "company" | "role" | "score" | "status";
type SortDir = "asc" | "desc";

const SORT_ACCESSORS: Record<SortKey, (app: Application) => string | number> = {
  num: (a) => a.num,
  date: (a) => a.date,
  company: (a) => a.company.toLowerCase(),
  role: (a) => a.role.toLowerCase(),
  score: (a) => a.score ?? -1,
  status: (a) => (a.statusLabel ?? a.statusRaw).toLowerCase(),
};

export function ApplicationsTable({
  applications,
  states = [],
  readOnly = false,
}: {
  applications: Application[];
  /** Canonical states for the inline status editor; empty = render read-only. */
  states?: CanonicalState[];
  /** READ_ONLY mode — render the plain indicator, no write affordances. */
  readOnly?: boolean;
}) {
  const editable = !readOnly && states.length > 0;
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const accessor = SORT_ACCESSORS[sortKey];
    const factor = sortDir === "asc" ? 1 : -1;
    return [...applications].sort((a, b) => {
      const va = accessor(a);
      const vb = accessor(b);
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return (a.num - b.num) * factor; // stable tie-break
    });
  }, [applications, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "company" || key === "role" ? "asc" : "desc");
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table className="text-data">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead label="#" k="num" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-12" />
            <SortableHead label="Company" k="company" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableHead label="Role" k="role" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableHead label="Score" k="score" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-20" />
            <SortableHead label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-32" />
            <SortableHead label="Date" k="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-28" />
            <TableHead className="w-12 text-center">PDF</TableHead>
            <TableHead className="w-16">Report</TableHead>
            <TableHead className="min-w-64">Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                No applications in the tracker yet.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((app) => (
              <TableRow
                key={`${app.num}-${app.company}-${app.role}`}
                className={cn(
                  "border-l-2",
                  (app.dashboardGroup && STATUS_BORDER_CLASS[app.dashboardGroup]) ??
                    "border-l-transparent",
                )}
              >
                <TableCell className="font-mono tabular-nums text-muted-foreground">
                  {String(app.num).padStart(3, "0")}
                </TableCell>
                <TableCell className="font-medium whitespace-nowrap">{app.company}</TableCell>
                <TableCell className="max-w-56 truncate" title={app.role}>
                  {app.role}
                </TableCell>
                <TableCell>
                  <ScoreBadge raw={app.scoreRaw} score={app.score} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {editable ? (
                    <StatusSelect app={app} states={states} />
                  ) : (
                    <StatusIndicator
                      group={app.dashboardGroup}
                      label={app.statusLabel ?? app.statusRaw}
                    />
                  )}
                </TableCell>
                <TableCell className="font-mono tabular-nums whitespace-nowrap text-muted-foreground">
                  {app.date}
                </TableCell>
                <TableCell className="text-center" aria-label={app.hasPdf ? "PDF generated" : "No PDF"}>
                  {app.hasPdf ? (
                    <FileText className="inline size-4 text-muted-foreground" aria-hidden />
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {app.reportPath ? (
                    <Link
                      href={`/app/${app.num}`}
                      className="font-mono text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {String(app.num).padStart(3, "0")}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-md">
                  <span className="block truncate text-muted-foreground" title={app.notes}>
                    {app.notes}
                  </span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function SortableHead({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === k;
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5",
          "hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className={cn("size-3.5", !active && "opacity-50")} aria-hidden />
      </button>
    </TableHead>
  );
}
