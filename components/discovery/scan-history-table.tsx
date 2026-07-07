"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useScanHistory } from "@/lib/client/queries";
import type { ScanRecord } from "@/lib/domain";

/**
 * Scan history tab — data/scan-history.tsv as a dense read-only table,
 * sortable by date / portal / company (F: Discovery, plan §4.4).
 */

type SortKey = "firstSeen" | "portal" | "company";
type SortDir = "asc" | "desc";

export function ScanHistoryTable() {
  const { data, isLoading, isError, error } = useScanHistory();
  const [sortKey, setSortKey] = useState<SortKey>("firstSeen");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const records = useMemo(() => {
    const rows = [...(data ?? [])];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort(
      (a, b) =>
        dir * a[sortKey].localeCompare(b[sortKey]) ||
        a.url.localeCompare(b.url), // stable tiebreak
    );
    return rows;
  }, [data, sortKey, sortDir]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError) {
    return (
      <div
        role="alert"
        className="max-w-prose rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <p className="font-medium">Could not load the scan history</p>
        <p className="mt-1 text-muted-foreground">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "firstSeen" ? "desc" : "asc");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-xs text-muted-foreground">
        {records.length} scanned postings
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <Table className="text-data">
          <TableHeader>
            <TableRow>
              <SortableHead
                label="First seen"
                sorted={sortKey === "firstSeen" ? sortDir : null}
                onClick={() => toggleSort("firstSeen")}
              />
              <SortableHead
                label="Portal"
                sorted={sortKey === "portal" ? sortDir : null}
                onClick={() => toggleSort("portal")}
              />
              <SortableHead
                label="Company"
                sorted={sortKey === "company" ? sortDir : null}
                onClick={() => toggleSort("company")}
              />
              <TableHead>Title</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  No scan history yet — run a portal scan.
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => (
                <ScanRow key={record.url} record={record} />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SortableHead({
  label,
  sorted,
  onClick,
}: {
  label: string;
  sorted: SortDir | null;
  onClick: () => void;
}) {
  const Icon = sorted === null ? ArrowUpDown : sorted === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead aria-sort={sorted === null ? "none" : sorted === "asc" ? "ascending" : "descending"}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex min-h-8 items-center gap-1 font-medium hover:text-foreground"
      >
        {label}
        <Icon aria-hidden className="size-3" />
      </button>
    </TableHead>
  );
}

function ScanRow({ record }: { record: ScanRecord }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap font-mono text-xs">
        {record.firstSeen}
      </TableCell>
      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
        {record.portal}
      </TableCell>
      <TableCell className="whitespace-nowrap font-medium">
        {record.company}
      </TableCell>
      <TableCell className="max-w-96">
        <a
          href={record.url}
          target="_blank"
          rel="noreferrer noopener"
          className="block truncate hover:text-primary hover:underline"
          title={record.url}
        >
          {record.title}
        </a>
      </TableCell>
      <TableCell className="max-w-56 truncate text-muted-foreground" title={record.location}>
        {record.location}
      </TableCell>
      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
        {record.status}
      </TableCell>
    </TableRow>
  );
}
