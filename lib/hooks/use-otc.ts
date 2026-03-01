"use client";

import { useQuery } from "@tanstack/react-query";
import { otcApi, OtcTransaction } from "@/lib/api";
import { useIsAuthenticated } from "@/lib/store";

/**
 * Hook to fetch OTC transactions and compute summary statistics
 */
export function useOtcStats() {
  const isAuthenticated = useIsAuthenticated();

  return useQuery({
    queryKey: ["otc-stats"],
    queryFn: async () => {
      const response = await otcApi.getTransactions();
      const transactions = response.data || [];

      const stats = transactions.reduce(
        (acc, tx) => {
          acc.totalTrades += 1;
          if (tx.status === "COMPLETED") {
            acc.totalVolume += tx.quantity;
          } else if (tx.status === "PENDING" || tx.status === "PROCESSING") {
            acc.pendingTrades += 1;
          }
          return acc;
        },
        { totalTrades: 0, totalVolume: 0, pendingTrades: 0 },
      );

      return {
        transactions,
        stats,
      };
    },
    enabled: isAuthenticated,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch the current OTC exchange rate for CNGN to USDC or USDT
 */
export function useOtcRate(token: string = "USDC") {
  const isAuthenticated = useIsAuthenticated();

  return useQuery({
    queryKey: ["otc-rate", token],
    queryFn: async () => {
      const response = await otcApi.getRate(token);
      return response.data;
    },
    enabled: isAuthenticated,
    staleTime: 60 * 1000, // 1 minute
  });
}
