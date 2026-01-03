"use client";

import { useQuery } from "@tanstack/react-query";
import { userApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

/**
 * Fetch User Profile Hook
 */
export function useProfile() {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const response = await userApi.getProfile();
      return response.data;
    },
    enabled: !!user,
  });
}

