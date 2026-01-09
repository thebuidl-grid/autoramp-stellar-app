import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";

export function useAdminSwapTransactions(reference?: string) {
  return useQuery({
    queryKey: ["adminSwapTransactions", reference],
    queryFn: () => adminApi.getAdminSwapTransactions(reference),
  });
}
