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
 */
export function useBanks() {
  return useQuery({
    queryKey: ["banks"],
    queryFn: async () => {
      const response = await stablestackApi.getBanks();
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
    mutationFn: ({ bankCode, accountNumber }: { bankCode: string; accountNumber: string }) =>
      stablestackApi.resolveAccount(bankCode, accountNumber),
  });
}

