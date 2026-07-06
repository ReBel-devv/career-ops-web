import {
  BarChart3,
  CalendarClock,
  Inbox,
  LayoutGrid,
  Table2,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Primary navigation — desktop rail order = mobile tab order (5 tabs). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Board", icon: LayoutGrid },
  { href: "/applications", label: "Applications", icon: Table2 },
  { href: "/discovery", label: "Discovery", icon: Inbox },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/follow-ups", label: "Follow-ups", icon: CalendarClock },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/app/");
  return pathname === href || pathname.startsWith(`${href}/`);
}
