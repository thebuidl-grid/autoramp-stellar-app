"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

export function useSafehavenAccounts(params: { kind?: string; q?: string; limit: number; offset: number }, enabled = true) {
  const token = useAuthStore((s) => s.token);
  return useQuery({ queryKey: ["admin-sh-accounts", params], queryFn: async () => (await adminApi.getSafehavenAccounts(params)).data, enabled: !!token && enabled, staleTime: 15_000 });
}

export function useSafehavenAccount(accountNumber: string | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery({ queryKey: ["admin-sh-account", accountNumber], queryFn: async () => (await adminApi.getSafehavenAccount(accountNumber as string)).data, enabled: !!token && !!accountNumber, retry: false });
}

export function useSafehavenTransactions(params: { status?: string; matched?: boolean; q?: string; limit: number; offset: number }, enabled = true) {
  const token = useAuthStore((s) => s.token);
  return useQuery({ queryKey: ["admin-sh-transactions", params], queryFn: async () => (await adminApi.getSafehavenTransactions(params)).data, enabled: !!token && enabled, staleTime: 15_000 });
}

export function useCctpTransfers(params: { status?: string; q?: string; limit: number; offset: number }) {
  const token = useAuthStore((s) => s.token);
  return useQuery({ queryKey: ["admin-cctp", params], queryFn: async () => (await adminApi.getCctpTransfers(params)).data, enabled: !!token, staleTime: 15_000 });
}
