import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";

export function useAdminOffRampTransactions(reference?: string) {
  return useQuery({
    queryKey: ["adminOffRampTransactions", reference],
    queryFn: () => adminApi.getAdminOffRampTransactions(reference),
  });
}
