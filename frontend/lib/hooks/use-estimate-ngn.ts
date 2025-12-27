"use client";

import { useQuery } from "@tanstack/react-query";
import { swapApi } from "@/lib/api";

/**
 * Hook to get USD/NGN rate from MonieRate API
 */
export function useUsdNgnRate() {
  return useQuery({
    queryKey: ["usdNgnRate"],
    queryFn: async () => {
      const response = await swapApi.getUsdNgnRate();
      return response.data.rate;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
}

/**
 * Hook to estimate NGN value from CNGN amount
 */
export function useEstimateNgn(cngnAmount: number | null) {
  return useQuery({
    queryKey: ["estimateNgn", cngnAmount],
    queryFn: async () => {
      if (!cngnAmount || cngnAmount <= 0) return null;
      const response = await swapApi.estimateNgn(cngnAmount);
      return response.data;
    },
    enabled: !!cngnAmount && cngnAmount > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

