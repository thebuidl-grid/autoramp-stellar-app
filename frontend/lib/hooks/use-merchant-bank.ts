"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { merchantBankApi } from "@/lib/merchant";
import { useAuthStore } from "@/lib/store";

/**
 * Hook to fetch merchant bank account
 * Pass merchantId to act on behalf of a merchant (admin).
 */
export function useMerchantBankAccount(adminMerchantId?: string) {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ["merchantBankAccount", adminMerchantId || user?.id],
    queryFn: async () => {
      const response = await merchantBankApi.getAccount(adminMerchantId);
      return response.data;
    },
    enabled: !!(adminMerchantId || user),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch merchant sub-accounts
 */
export function useMerchantSubAccounts() {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ["merchantSubAccounts", user?.id],
    queryFn: async () => {
      const response = await merchantBankApi.getSubAccounts();
      return response.data;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch a single sub-account
 */
export function useMerchantSubAccount(id: string) {
  return useQuery({
    queryKey: ["merchantSubAccount", id],
    queryFn: async () => {
      if (!id) return null;
      const response = await merchantBankApi.getSubAccount(id);
      return response.data;
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch balances for multiple sub-accounts in parallel.
 * Returns a map of { [id]: { accountBalance, bookBalance } }.
 * Pass adminMerchantId to add ?merchantId= to the request (admin acting on behalf of merchant).
 */
export function useSubAccountBalances(ids: string[], adminMerchantId?: string) {
  return useQuery({
    queryKey: ["subAccountBalances", ids, adminMerchantId],
    queryFn: async () => {
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await merchantBankApi.getSubAccount(id, adminMerchantId);
            return { id, accountBalance: res.data.accountBalance, bookBalance: res.data.bookBalance, bankName: res.data.bankName };
          } catch {
            return { id, accountBalance: 0, bookBalance: 0, bankName: undefined };
          }
        }),
      );
      return results.reduce(
        (map, r) => {
          map[r.id] = { accountBalance: r.accountBalance, bookBalance: r.bookBalance, bankName: r.bankName };
          return map;
        },
        {} as Record<string, { accountBalance: number; bookBalance: number; bankName?: string }>,
      );
    },
    enabled: ids.length > 0,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch sub-account transfers
 */
export function useMerchantSubAccountTransfers(
  id: string,
  params?: {
    page?: number;
    limit?: number;
    status?: string;
    fromDate?: string;
    toDate?: string;
  },
) {
  return useQuery({
    queryKey: ["merchantSubAccountTransfers", id, params],
    queryFn: async () => {
      if (!id) return null;
      const response = await merchantBankApi.getSubAccountTransfers(id, params);
      return response.data;
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch sub-account transactions
 */
export function useMerchantSubAccountTransactions(
  id: string,
  params?: {
    page?: number;
    limit?: number;
    type?: "onramp" | "offramp" | "swap";
    status?: string;
  },
) {
  return useQuery({
    queryKey: ["merchantSubAccountTransactions", id, params],
    queryFn: async () => {
      if (!id) return null;
      const response = await merchantBankApi.getSubAccountTransactions(id, params);
      return response.data;
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch merchant bank stats
 */
export function useMerchantBankStats() {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ["merchantBankStats", user?.id],
    queryFn: async () => {
      const response = await merchantBankApi.getStats();
      return response.data;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch supported banks
 */
export function useMerchantBanks() {
  return useQuery({
    queryKey: ["merchantBanks"],
    queryFn: async () => {
      const response = await merchantBankApi.getBanks();
      return response.data;
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch merchant transfers
 */
export function useMerchantTransfers(params?: {
  page?: number;
  limit?: number;
  status?: string;
  from_date?: string;
  to_date?: string;
  sub_account_id?: string;
}) {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ["merchantTransfers", user?.id, params],
    queryFn: async () => {
      const response = await merchantBankApi.getTransfers(params);
      return response.data;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch merchant bank transactions (onramp/offramp/swap)
 */
export function useMerchantTransactions(params?: {
  page?: number;
  limit?: number;
  type?: "onramp" | "offramp" | "swap";
  status?: string;
  sub_account_id?: string;
}) {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ["merchantTransactions", user?.id, params],
    queryFn: async () => {
      const response = await merchantBankApi.getTransactions(params);
      return response.data;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch merchant bank analytics (time-series chart data)
 */
export function useMerchantBankAnalytics(
  period: "daily" | "weekly" | "monthly" = "daily",
) {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ["merchantBankAnalytics", user?.id, period],
    queryFn: async () => {
      const response = await merchantBankApi.getAnalytics(period);
      return response.data;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch merchant webhook logs
 */
export function useMerchantWebhookLogs(params?: {
  page?: number;
  limit?: number;
  event?: string;
  success?: boolean;
}) {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ["merchantWebhookLogs", user?.id, params],
    queryFn: async () => {
      const response = await merchantBankApi.getWebhookLogs(params);
      return response.data;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to retry a failed webhook delivery
 */
export function useRetryWebhookLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (logId: string) => merchantBankApi.retryWebhookLog(logId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["merchantWebhookLogs"] });
    },
  });
}

// ============== Mutations ==============

/**
 * Hook to create a sub-account
 */
export function useCreateSubAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: merchantBankApi.createSubAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["merchantSubAccounts"] });
      queryClient.invalidateQueries({ queryKey: ["merchantBankStats"] });
    },
  });
}

/**
 * Hook to update a sub-account
 */
export function useUpdateSubAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data, merchantId }: { id: string; data: any; merchantId?: string }) =>
      merchantBankApi.updateSubAccount(id, data, merchantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["merchantSubAccounts"] });
      queryClient.invalidateQueries({ queryKey: ["merchantSubAccount"] });
      queryClient.invalidateQueries({ queryKey: ["merchantBankStats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-merchant-bank-account"] });
    },
  });
}

/**
 * Hook to perform name enquiry
 */
export function useNameEnquiry() {
  return useMutation({
    mutationFn: merchantBankApi.nameEnquiry,
  });
}

/**
 * Hook to transfer funds
 */
export function useTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: merchantBankApi.transfer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["merchantBankAccount"] });
      queryClient.invalidateQueries({ queryKey: ["merchantTransfers"] });
      queryClient.invalidateQueries({ queryKey: ["merchantBankStats"] });
    },
  });
}

/**
 * Hook to create a virtual account
 */
export function useCreateVirtualAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: merchantBankApi.createVirtualAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["merchantBankStats"] });
    },
  });
}

/**
 * Hook to initiate identity verification
 */
export function useInitiateVerification() {
  return useMutation({
    mutationFn: merchantBankApi.initiateVerification,
  });
}

/**
 * Hook to validate identity verification
 */
export function useValidateVerification() {
  return useMutation({
    mutationFn: merchantBankApi.validateVerification,
  });
}
