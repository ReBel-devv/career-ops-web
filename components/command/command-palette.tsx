"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  CalendarClock,
  Eye,
  EyeOff,
  Inbox,
  LayoutGrid,
  Settings,
  Table2,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ScoreBadge } from "@/components/data/score-badge";
import { useApplications } from "@/lib/client/queries";
import { applyFiltersToParams, parseFilters } from "@/lib/filters";

/**
 * Global ⌘K command palette (F4). Navigates to screens, jumps to an
 * application by company/role/#, and toggles the archived view. Opened by
 * ⌘K / Ctrl-K or `openCommandPalette()` (used by the stats-header search
 * button) via a window event, so any component can open it without prop
 * drilling.
 */

const OPEN_EVENT = "career-ops:open-command-palette";

/** Open the palette from anywhere (e.g. the stats-header search button). */
export function openCommandPalette(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPEN_EVENT));
  }
}

const NAV = [
  { href: "/", label: "Board", icon: LayoutGrid },
  { href: "/applications", label: "Applications", icon: Table2 },
  { href: "/discovery", label: "Discovery", icon: Inbox },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/follow-ups", label: "Follow-ups", icon: CalendarClock },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: applications } = useApplications();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const filters = parseFilters(new URLSearchParams(searchParams.toString()));

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  function toggleArchived() {
    const next = applyFiltersToParams(new URLSearchParams(searchParams.toString()), {
      ...filters,
      archived: !filters.archived,
    });
    // The archived toggle only affects the Board / Applications views.
    const target = pathname === "/applications" ? "/applications" : "/";
    const qs = next.toString();
    router.push(qs ? `${target}?${qs}` : target);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search applications or jump to a screen…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        <CommandGroup heading="Navigate">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.href}
                value={`go ${item.label}`}
                onSelect={() => run(() => router.push(item.href))}
              >
                <Icon aria-hidden />
                {item.label}
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="View">
          <CommandItem
            value="toggle archived rejected discarded skip"
            onSelect={() => run(toggleArchived)}
          >
            {filters.archived ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            {filters.archived ? "Hide archived" : "Show archived"}
          </CommandItem>
        </CommandGroup>

        {applications && applications.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Applications">
              {applications.map((app) => (
                <CommandItem
                  key={app.num}
                  value={`${app.num} ${app.company} ${app.role}`}
                  onSelect={() => run(() => router.push(`/app/${app.num}`))}
                >
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {String(app.num).padStart(3, "0")}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{app.company}</span>
                    <span className="text-muted-foreground"> — {app.role}</span>
                  </span>
                  <ScoreBadge raw={app.scoreRaw} score={app.score} />
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
