"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, Search } from "lucide-react";
import { openCommandPalette } from "@/components/command/command-palette";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { isActive, MOBILE_TAB_HREFS, NAV_ITEMS } from "./nav-items";

/** Shared classes for a bottom-bar cell (>= 44px touch target). */
const CELL =
  "flex min-h-14 w-full flex-col items-center justify-center gap-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] focus-visible:outline-2 focus-visible:outline-ring";

/**
 * Mobile-only bottom tab bar: Board · Discovery · Search · More. The remaining
 * sections live behind the "More" bottom sheet, so the bar stays at four cells
 * (bottom-nav ≤ 5 rule) no matter how many sections desktop grows. Profile &
 * Settings stay in the top-right avatar menu.
 */
export function TabBar() {
  const pathname = usePathname();

  const tabs = NAV_ITEMS.filter((i) => MOBILE_TAB_HREFS.includes(i.href));
  const overflow = NAV_ITEMS.filter((i) => !MOBILE_TAB_HREFS.includes(i.href));
  const overflowActive = overflow.some((i) => isActive(pathname, i.href));

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-4">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(CELL, active ? "text-foreground" : "text-muted-foreground")}
              >
                <Icon className="size-5" aria-hidden />
                <span className="text-[10px] leading-none">{item.label}</span>
              </Link>
            </li>
          );
        })}

        {/* Search — opens the command palette (same target as the header ⌘K). */}
        <li>
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Search"
            className={cn(CELL, "text-muted-foreground")}
          >
            <Search className="size-5" aria-hidden />
            <span className="text-[10px] leading-none">Search</span>
          </button>
        </li>

        {/* More — remaining sections in a bottom sheet. */}
        <li>
          <Sheet>
            <SheetTrigger
              aria-label="More sections"
              className={cn(CELL, overflowActive ? "text-foreground" : "text-muted-foreground")}
            >
              <Ellipsis className="size-5" aria-hidden />
              <span className="text-[10px] leading-none">More</span>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              // Darker than the default popover (matches the site's near-black
              // background) and floated off the screen edges with a small margin
              // on both sides and the bottom (clearing the home indicator).
              className="inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] rounded-2xl border bg-background pb-4 text-foreground"
            >
              <SheetHeader className="p-0">
                <SheetTitle>More</SheetTitle>
              </SheetHeader>
              <ul className="flex flex-col gap-1">
                {overflow.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <SheetClose asChild>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-14 items-center gap-3 rounded-lg px-3 py-3",
                            "focus-visible:outline-2 focus-visible:outline-ring",
                            active
                              ? "bg-secondary text-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <Icon className="size-5 shrink-0" aria-hidden />
                          <span className="text-sm font-medium">{item.label}</span>
                        </Link>
                      </SheetClose>
                    </li>
                  );
                })}
              </ul>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
