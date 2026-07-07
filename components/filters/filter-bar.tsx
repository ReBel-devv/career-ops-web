"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, Eye, EyeOff, Gauge, ListFilter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { STATUS_DOT_CLASS } from "@/components/data/status-indicator";
import { useStates } from "@/lib/client/queries";
import {
  applyFiltersToParams,
  hasActiveFilters,
  parseFilters,
  type AppFilters,
} from "@/lib/filters";
import { cn } from "@/lib/utils";

/**
 * Search / filter / sort bar (F4). All state lives in the URL so it composes
 * across the Board and the Applications table and survives reload / sharing.
 *
 * Archetype and ATS-vendor facets (plan §3 F4) are deferred to M3 — they need
 * report data the tracker row doesn't carry (see lib/filters.ts).
 */
export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: states = [] } = useStates();

  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  // Push filters to the URL without stacking history entries.
  function commit(next: AppFilters) {
    const params = applyFiltersToParams(new URLSearchParams(searchParams.toString()), next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Search: controlled locally, debounced into the URL, but re-synced when the
  // URL changes externally (e.g. the command palette or back/forward). The
  // "adjust state during render" pattern (react.dev) keeps this out of an effect.
  const [q, setQ] = useState(filters.q);
  const [lastUrlQ, setLastUrlQ] = useState(filters.q);
  if (filters.q !== lastUrlQ) {
    setLastUrlQ(filters.q);
    setQ(filters.q);
  }
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onSearchChange(value: string) {
    setQ(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => commit({ ...filters, q: value }), 200);
  }

  function toggleStatus(id: string, checked: boolean) {
    const statuses = checked
      ? [...filters.statuses, id]
      : filters.statuses.filter((s) => s !== id);
    commit({ ...filters, statuses });
  }

  const active = hasActiveFilters(filters);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-40 flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search company, role, notes…"
          aria-label="Search applications"
          className="pl-8 text-data"
        />
      </div>

      {/* Status */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <ListFilter className="size-4" aria-hidden />
            Status
            {filters.statuses.length > 0 ? (
              <span className="rounded-sm bg-primary/15 px-1 font-mono text-xs tabular-nums text-primary">
                {filters.statuses.length}
              </span>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {states.map((state) => (
            <DropdownMenuCheckboxItem
              key={state.id}
              checked={filters.statuses.includes(state.id)}
              onCheckedChange={(c) => toggleStatus(state.id, c === true)}
              onSelect={(e) => e.preventDefault()}
              className="text-data"
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  STATUS_DOT_CLASS[state.dashboardGroup] ?? "bg-muted-foreground/40",
                )}
              />
              {state.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Score range */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Gauge className="size-4" aria-hidden />
            Score
            {filters.scoreMin !== null || filters.scoreMax !== null ? (
              <span className="rounded-sm bg-primary/15 px-1 font-mono text-xs text-primary">
                {filters.scoreMin ?? 0}–{filters.scoreMax ?? 5}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Score range (0–5)</p>
          <div className="flex items-center gap-2">
            <RangeInput
              label="Min"
              value={filters.scoreMin}
              onCommit={(v) => commit({ ...filters, scoreMin: v })}
            />
            <span className="text-muted-foreground">–</span>
            <RangeInput
              label="Max"
              value={filters.scoreMax}
              onCommit={(v) => commit({ ...filters, scoreMax: v })}
            />
          </div>
        </PopoverContent>
      </Popover>

      {/* Date range */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <CalendarRange className="size-4" aria-hidden />
            Date
            {filters.dateFrom !== null || filters.dateTo !== null ? (
              <span className="rounded-sm bg-primary/15 px-1 font-mono text-[10px] text-primary">
                set
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Date range</p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between gap-2 text-data">
              <span className="text-muted-foreground">From</span>
              <Input
                type="date"
                value={filters.dateFrom ?? ""}
                onChange={(e) => commit({ ...filters, dateFrom: e.target.value || null })}
                className="h-8 w-40 text-data"
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-data">
              <span className="text-muted-foreground">To</span>
              <Input
                type="date"
                value={filters.dateTo ?? ""}
                onChange={(e) => commit({ ...filters, dateTo: e.target.value || null })}
                className="h-8 w-40 text-data"
              />
            </label>
          </div>
        </PopoverContent>
      </Popover>

      {/* Archived toggle (Decision 8) */}
      <Button
        variant={filters.archived ? "secondary" : "outline"}
        size="sm"
        className="gap-1.5"
        aria-pressed={filters.archived}
        onClick={() => commit({ ...filters, archived: !filters.archived })}
      >
        {filters.archived ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
        Archived
      </Button>

      {active ? (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() =>
            commit({
              q: "",
              statuses: [],
              scoreMin: null,
              scoreMax: null,
              dateFrom: null,
              dateTo: null,
              archived: filters.archived,
            })
          }
        >
          <X className="size-4" aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  );
}

function RangeInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
}) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      min={0}
      max={5}
      step={0.1}
      aria-label={`${label} score`}
      placeholder={label}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onCommit(null);
        const n = Number.parseFloat(raw);
        onCommit(Number.isFinite(n) ? n : null);
      }}
      className="h-8 text-data"
    />
  );
}
