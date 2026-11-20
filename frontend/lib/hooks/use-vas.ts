"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  merchantVasApi,
  VASPayAirtimeRequest,
  VASPayDataRequest,
  VASPayCableTvRequest,
  VASPayUtilityRequest,
  VASVerifyRequest,
} from "@/lib/merchant";

export function useVASServices() {
  return useQuery({
    queryKey: ["vasServices"],
    queryFn: async () => {
      const response = await merchantVasApi.getServices();
      return Array.isArray(response.data) ? response.data : response.data?.data || [];
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useVASCategories(serviceId: string) {
  return useQuery({
    queryKey: ["vasCategories", serviceId],
    queryFn: async () => {
      const response = await merchantVasApi.getCategories(serviceId);
      return Array.isArray(response.data) ? response.data : response.data?.data || [];
    },
    enabled: !!serviceId,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useVASProducts(categoryId: string) {
  return useQuery({
    queryKey: ["vasProducts", categoryId],
    queryFn: async () => {
      const response = await merchantVasApi.getProducts(categoryId);
      return Array.isArray(response.data) ? response.data : response.data?.data || [];
    },
    enabled: !!categoryId,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useVASVerify() {
  return useMutation({
    mutationFn: (data: VASVerifyRequest) => merchantVasApi.verify(data),
  });
}

export function useVASPayAirtime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: VASPayAirtimeRequest) => merchantVasApi.payAirtime(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vasTransactions"] });
    },
  });
}

export function useVASPayData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: VASPayDataRequest) => merchantVasApi.payData(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vasTransactions"] });
    },
  });
}

export function useVASPayCableTv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: VASPayCableTvRequest) => merchantVasApi.payCableTv(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vasTransactions"] });
    },
  });
}

export function useVASPayUtility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: VASPayUtilityRequest) => merchantVasApi.payUtility(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vasTransactions"] });
    },
  });
}

export function useVASTransactions(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ["vasTransactions", params],
    queryFn: async () => {
      const response = await merchantVasApi.getTransactions(params);
      return Array.isArray(response.data) ? response.data : response.data?.data || [];
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useVASTransaction(transactionId: string) {
  return useQuery({
    queryKey: ["vasTransaction", transactionId],
    queryFn: async () => {
      const response = await merchantVasApi.getTransaction(transactionId);
      return response.data;
    },
    enabled: !!transactionId,
  });
}

export function useVASTransactionSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transactionId: string) => merchantVasApi.syncTransaction(transactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vasTransactions"] });
    },
  });
}
