import { Activity, ArrowLeftRight, BadgeCheck, Building2, History, Landmark, Banknote, LayoutDashboard, MailPlus, Users, Webhook, type LucideIcon } from "lucide-react";

export interface AdminNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export interface AdminNavSection {
  /** Heading shown when the sidebar is expanded; a thin divider when it is a rail. */
  title: string;
  items: AdminNavItem[];
}

/** Admin navigation, grouped by what people go there to do. Transfer Logs lives inside Transactions as a tab. */
export const ADMIN_NAV: AdminNavSection[] = [
  { title: "Overview", items: [{ name: "Dashboard", href: "/admin", icon: LayoutDashboard }] },
  {
    title: "Money",
    items: [
      { name: "Transactions", href: "/admin/transactions", icon: History },
      { name: "Safehaven", href: "/admin/safehaven", icon: Banknote },
      { name: "CCTP", href: "/admin/cctp", icon: ArrowLeftRight },
      { name: "Bitnob", href: "/admin/bitnob", icon: Landmark },
      { name: "Webhooks", href: "/admin/webhooks", icon: Webhook },
      { name: "OTC Service", href: "/admin/otc", icon: BadgeCheck },
    ],
  },
  {
    title: "People",
    items: [
      { name: "Users", href: "/admin/users", icon: Users },
      { name: "Merchants", href: "/admin/merchants", icon: Building2 },
      { name: "Waitlist", href: "/admin/waitlist", icon: MailPlus },
    ],
  },
  { title: "Insights", items: [{ name: "User Analytics", href: "/admin/user-analytics", icon: Activity }] },
];

/**
 * Whether `href` is the current section. The dashboard only matches itself; everything else matches its sub-pages too, so
 * /admin/users/123 keeps "Users" lit. Boundary-checked: /admin/users2 is not "Users".
 */
export function isNavActive(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Old URLs that now live inside another page. The sidebar highlights the new home for them. */
export const ADMIN_NAV_ALIASES: Record<string, string> = {
  "/admin/transfer-logs": "/admin/transactions",
};

export function resolveNavPath(pathname: string | null | undefined): string {
  if (!pathname) return "";
  for (const [from, to] of Object.entries(ADMIN_NAV_ALIASES)) {
    if (pathname === from || pathname.startsWith(`${from}/`)) return pathname.replace(from, to);
  }
  return pathname;
}
