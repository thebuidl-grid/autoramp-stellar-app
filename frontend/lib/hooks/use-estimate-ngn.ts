"use client";

import { useQuery } from "@tanstack/react-query";
import { swapApi } from "@/lib/api";
import axios from "axios";

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
    retry: (failureCount, error) => {
      // Don't retry on 401 (authentication required)
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        return false;
      }
      return failureCount < 3;
    },
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
    staleTime: 10 * 60 * 1000, // 10 minutes - cache the price
    gcTime: 15 * 60 * 1000, // Keep in cache for 15 minutes
    retry: (failureCount, error) => {
      // Don't retry on 401 (authentication required)
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        return false;
      }
      return failureCount < 3;
    },
  });
}
