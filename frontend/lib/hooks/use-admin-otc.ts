"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi, AdminUser } from "@/lib/api";

/**
 * Hook to fetch OTC-enabled users for the admin panel
 */
export function useAdminOtcUsers(page: number = 1, limit: number = 10) {
  return useQuery({
    queryKey: ["admin-otc-users", page, limit],
    queryFn: async () => {
      const response = await adminApi.getOtcUsers(page, limit);
      return response.data;
    },
  });
}

/**
 * Hook to fetch OTC transactions for the admin panel
 */
export function useAdminOtcTransactions(
  limit: number = 10,
  status?: string,
  startDate?: string,
  endDate?: string,
  search?: string,
  cursor?: string,
) {
  return useQuery({
    queryKey: [
      "admin-otc-transactions",
      limit,
      status,
      startDate,
      endDate,
      search,
      cursor,
    ],
    queryFn: async () => {
      const response = await adminApi.getOtcTransactions(
        limit,
        status,
        startDate,
        endDate,
        search,
        cursor,
      );
      return response.data;
    },
    staleTime: 30 * 1000,
  });
}
