import type { MerchantUser } from "@/lib/api";

export type KybFilter = "all" | "PENDING" | "VERIFIED" | "REJECTED";

/** KYB (business verification) status in the words an admin uses. */
export function kybLabel(status: string | null | undefined): string {
  switch (String(status ?? "").toUpperCase()) {
    case "VERIFIED":
      return "Approved";
    case "PENDING":
      return "Pending review";
    case "REJECTED":
      return "Rejected";
    default:
      return "No KYB";
  }
}

/** Merchants matching a KYB status and a search over business name and contact email. Everything is loaded, so this is client-side. */
export function filterMerchants(merchants: MerchantUser[], status: KybFilter, term: string): MerchantUser[] {
  const needle = term.trim().toLowerCase();
  return merchants.filter(
    (m) =>
      (status === "all" || m.status === status) &&
      (!needle || (m.name ?? "").toLowerCase().includes(needle) || (m.user?.email ?? "").toLowerCase().includes(needle)),
  );
}

export function countByKyb(merchants: MerchantUser[]): Record<KybFilter, number> {
  return {
    all: merchants.length,
    PENDING: merchants.filter((m) => m.status === "PENDING").length,
    VERIFIED: merchants.filter((m) => m.status === "VERIFIED").length,
    REJECTED: merchants.filter((m) => m.status === "REJECTED").length,
  };
}

/** A site address for a link, always with a scheme so it opens the site and not a path on ours. */
export function websiteHref(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
