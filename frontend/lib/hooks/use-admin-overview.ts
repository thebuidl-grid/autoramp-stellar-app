"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi, type TransactionAnalyticsDataPoint } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

/** Same query key as the transactions page, so the two share one cached request. */
export function useAdminSummary(period: "today" | "7d" | "30d" | "90d" | "all" = "30d") {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["admin-transactions-summary", period],
    queryFn: async () => (await adminApi.getTransactionsSummary(period)).data,
    enabled: !!token,
    staleTime: 30_000,
  });
}

/** Total volume per day across every transaction type, oldest first (for the trend line). */
export function dailyVolumeSeries(points: TransactionAnalyticsDataPoint[] | undefined): number[] {
  return (points ?? [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) =>
      [p.onrampVolume, p.offrampVolume, p.swapVolume, p.bankTransferVolume, p.vasVolume, p.otcVolume].reduce((sum: number, v) => sum + (Number.isFinite(v) ? v : 0), 0),
    );
}

export function useAdminDailyVolume() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["admin-transactions-analytics", "daily"],
    queryFn: async () => dailyVolumeSeries((await adminApi.getTransactionsAnalytics("daily")).data),
    enabled: !!token,
    staleTime: 60_000,
  });
}

/** Merchants whose KYB is submitted and not yet decided. */
export function usePendingMerchantsCount() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["admin-merchants-pending-count"],
    queryFn: async () => (await adminApi.getMerchants()).data.filter((m) => m.status === "PENDING").length,
    enabled: !!token,
    staleTime: 60_000,
  });
}
