"use client";

import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { dataApi } from "@/lib/api";

/**
 * Fetch AutoRamp Dashboard stats (GET /api/dashboard) with the admin's bearer token.
 * 401/403 means the session is not an admin session. Other failures fall back to dummy data in the UI.
 */
export function useDataStats(token: string | null, enabled: boolean = true) {
  return useQuery({
    // The token is not part of the key (it would be kept in the cache and devtools); the
    // presence of a session is enough to separate logged-in from logged-out data.
    queryKey: ["autoramp-data-stats", !!token],
    queryFn: async () => {
      const response = await dataApi.getStats(token as string);
      return response.data;
    },
    enabled: enabled && !!token,
    staleTime: 60 * 1000, // 1 minute
    retry: (failureCount, error) => {
      // Don't retry authorization failures
      if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) {
        return false;
      }
      return failureCount < 1;
    },
  });
}
