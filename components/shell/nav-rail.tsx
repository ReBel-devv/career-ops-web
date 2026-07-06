"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isActive, NAV_ITEMS, type NavItem } from "./nav-items";

/**
 * Desktop-only slim icon rail (Linear-style): 56px collapsed, 224px expanded.
 * Mobile navigation is the bottom TabBar.
 */
export function NavRail() {
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 motion-reduce:transition-none md:flex",
        expanded ? "w-56" : "w-14",
      )}
    >
      <div className="flex h-14 items-center border-b px-3">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 font-medium"
          aria-label="Career Ops — Board"
        >
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-data font-semibold text-primary-foreground"
          >
            co
          </span>
          {expanded ? <span className="truncate text-sm">Career Ops</span> : null}
        </Link>
      </div>

      <ul className="flex flex-1 flex-col gap-1 p-2">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <RailLink item={item} active={isActive(pathname, item.href)} expanded={expanded} />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1 border-t p-2">
        <RailLink
          item={{ href: "/settings", label: "Settings", icon: Settings }}
          active={isActive(pathname, "/settings")}
          expanded={expanded}
        />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "flex h-10 items-center gap-3 rounded-md px-2.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            "focus-visible:outline-2 focus-visible:outline-ring",
          )}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {expanded ? (
            <PanelLeftClose className="size-4.5 shrink-0" aria-hidden />
          ) : (
            <PanelLeftOpen className="size-4.5 shrink-0" aria-hidden />
          )}
          {expanded ? <span className="text-data">Collapse</span> : null}
        </button>
      </div>
    </nav>
  );
}

function RailLink({
  item,
  active,
  expanded,
}: {
  item: NavItem;
  active: boolean;
  expanded: boolean;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-md px-2.5",
        "focus-visible:outline-2 focus-visible:outline-ring",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-4.5 shrink-0" aria-hidden />
      {expanded ? <span className="truncate text-data">{item.label}</span> : null}
    </Link>
  );

  if (expanded) return link;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
