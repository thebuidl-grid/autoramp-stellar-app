"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { stablestackApi, OnRampDto, OffRampDto, getErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { useToast } from "@/components/ui/toast";

/**
 * Fetch Transactions Hook
 */
export function useTransactions(id?: string, reference?: string) {
  return useQuery({
    queryKey: ["transactions", id, reference],
    queryFn: async () => {
      const response = await stablestackApi.getTransactions(id, reference);
      return response.data;
    },
  });
}

/**
 * Fetch Banks Hook
 *
 * currency (ISO 4217) selects the corridor's bank list — omit for the
 * app-wide default (NGN).
 */
export function useBanks(currency?: string) {
  return useQuery({
    queryKey: ["banks", currency],
    queryFn: async () => {
      const response = await stablestackApi.getBanks(currency);
      return response.data.data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * OnRamp Mutation Hook
 */
export function useOnRamp() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: OnRampDto) => stablestackApi.onRamp(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({
        title: "Transaction initiated",
        description: "Please complete the bank transfer to proceed",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Transaction failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });
}

/**
 * OffRamp Mutation Hook
 */
export function useOffRamp() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: OffRampDto) => stablestackApi.offRamp(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({
        title: "Transaction initiated",
        description: "Your crypto sale has been initiated",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Transaction failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });
}

/**
 * Resolve Account Hook
 */
export function useResolveAccount() {
  return useMutation({
    mutationFn: ({
      bankCode,
      accountNumber,
      currency,
    }: {
      bankCode: string;
      accountNumber: string;
      currency?: string;
    }) => stablestackApi.resolveAccount(bankCode, accountNumber, currency),
  });
}

