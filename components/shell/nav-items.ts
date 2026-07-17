import {
  BarChart3,
  CalendarClock,
  Inbox,
  LayoutGrid,
  LayoutTemplate,
  Table2,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Primary navigation — desktop rail order = mobile tab order (5 tabs). Profile
 * lives behind the avatar menu (top-right), alongside Settings, to keep the
 * mobile tab bar from overflowing.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Board", icon: LayoutGrid },
  { href: "/applications", label: "Applications", icon: Table2 },
  { href: "/discovery", label: "Discovery", icon: Inbox },
  { href: "/follow-ups", label: "Follow-ups", icon: CalendarClock },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

/**
 * Hrefs shown as direct tabs in the mobile bottom bar (alongside Search + a
 * "More" sheet holding the remaining sections). Desktop keeps the full rail, so
 * new sections can be added freely without crowding the mobile bar.
 */
export const MOBILE_TAB_HREFS: readonly string[] = ["/", "/discovery"];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/app/");
  return pathname === href || pathname.startsWith(`${href}/`);
}
