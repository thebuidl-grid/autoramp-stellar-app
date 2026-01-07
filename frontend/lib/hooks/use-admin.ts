"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";

export function useAdminTransactionSummary() {
    return useQuery({
        queryKey: ["adminTransactionSummary"],
        queryFn: () => adminApi.getAdminTransactionSummary(),
    });
}
