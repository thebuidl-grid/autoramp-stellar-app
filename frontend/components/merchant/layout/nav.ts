import { Home, Landmark, ListChecks, ScrollText, Settings, Smartphone, Key } from "lucide-react";

export interface MerchantNavItem {
  name: string;
  href: string;
  icon: typeof Home;
}

export interface MerchantNavGroup {
  title: string;
  items: MerchantNavItem[];
}

/** Two groups, like the way money and developer tools are used: moving money, then building on it. Settings lives in the account menu. */
export const MERCHANT_NAV: MerchantNavGroup[] = [
  {
    title: "Money",
    items: [
      { name: "Home", href: "/merchant/dashboard", icon: Home },
      { name: "Payments", href: "/merchant/dashboard/transactions", icon: ListChecks },
      { name: "Banking", href: "/merchant/dashboard/bank", icon: Landmark },
      { name: "Airtime & bills", href: "/merchant/dashboard/vas", icon: Smartphone },
    ],
  },
  {
    title: "Developers",
    items: [
      { name: "API keys", href: "/merchant/dashboard/api-keys", icon: Key },
      { name: "Audit log", href: "/merchant/dashboard/audit-logs", icon: ScrollText },
    ],
  },
];

export const MERCHANT_SETTINGS: MerchantNavItem = { name: "Settings", href: "/merchant/dashboard/settings", icon: Settings };

export function isMerchantNavActive(pathname: string, href: string): boolean {
  if (href === "/merchant/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

