"use client";

import { useQuery } from "@tanstack/react-query";
import { merchantApi } from "@/lib/merchant";
import { userApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

/**
 * Hook to fetch merchant profile data
 */
export function useMerchantProfile(merchantId?: string) {
    const { user } = useAuthStore();

    return useQuery({
        queryKey: ["merchantProfile", merchantId || user?.id],
        queryFn: async () => {
            const response = await merchantApi.getMerchantProfile(merchantId);
            return response.data;
        },
        enabled: !!user || !!merchantId,
        staleTime: 30 * 60 * 1000, // 30 minutes
        refetchOnWindowFocus: false,
    });
}

/**
 * Hook to fetch merchant API key stats
 */
export function useMerchantApiKeyStats() {
    const { user } = useAuthStore();

    return useQuery({
        queryKey: ["merchantApiKeyStats", user?.id],
        queryFn: async () => {
            const response = await userApi.getUserApiKeyStats();
            return response.data;
        },
        enabled: !!user,
        staleTime: 30 * 60 * 1000, // 30 minutes
        refetchOnWindowFocus: false,
    });
}

/**
 * Hook to fetch merchant transaction summary
 */
export function useMerchantTransactionsSummary(merchantId?: string) {
    const { user } = useAuthStore();
    const effectiveMerchantId = merchantId;

    return useQuery({
        queryKey: ["merchantTransactionsSummary", effectiveMerchantId],
        queryFn: async () => {
            if (!effectiveMerchantId) return null;
            const response = await merchantApi.getTransactionsSummary(effectiveMerchantId);
            return response.data;
        },
        enabled: !!user && !!effectiveMerchantId,
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
    });
}

/**
 * Hook to fetch merchant API keys
 */
export function useMerchantApiKeys() {
    const { user } = useAuthStore();

    return useQuery({
        queryKey: ["merchantApiKeys", user?.id],
        queryFn: async () => {
            const response = await merchantApi.getApiKeys();
            return response.data;
        },
        enabled: !!user,
        staleTime: 30 * 60 * 1000, // 30 minutes
        refetchOnWindowFocus: false,
    });
}

/**
 * Hook to fetch merchant directors
 */
export function useMerchantDirectors(merchantId?: string) {
    return useQuery({
        queryKey: ["merchantDirectors", merchantId],
        queryFn: async () => {
            if (!merchantId) return [];
            const response = await merchantApi.getDirectors(merchantId);
            return response.data;
        },
        enabled: !!merchantId,
        staleTime: 30 * 60 * 1000, // 30 minutes
        refetchOnWindowFocus: false,
    });
}

/**
 * Hook to fetch merchant shareholders
 */
export function useMerchantShareholders(merchantId?: string) {
    return useQuery({
        queryKey: ["merchantShareholders", merchantId],
        queryFn: async () => {
            if (!merchantId) return [];
            const response = await merchantApi.getShareholders(merchantId);
            return response.data;
        },
        enabled: !!merchantId,
        staleTime: 30 * 60 * 1000, // 30 minutes
        refetchOnWindowFocus: false,
    });
}

/**
 * Hook to fetch merchant bank accounts
 */
export function useMerchantBankAccounts(merchantId?: string) {
    return useQuery({
        queryKey: ["merchantBankAccounts", merchantId],
        queryFn: async () => {
            if (!merchantId) return [];
            const response = await merchantApi.getBankAccounts(merchantId);
            return response.data;
        },
        enabled: !!merchantId,
        staleTime: 30 * 60 * 1000, // 30 minutes
        refetchOnWindowFocus: false,
    });
}

/**
 * Hook to fetch merchant documentation
 */
export function useMerchantDocumentation(merchantId?: string) {
    return useQuery({
        queryKey: ["merchantDocumentation", merchantId],
        queryFn: async () => {
            if (!merchantId) return null;
            const response = await merchantApi.getDocumentation(merchantId);
            return response.data;
        },
        enabled: !!merchantId,
        staleTime: 30 * 60 * 1000, // 30 minutes
        refetchOnWindowFocus: false,
    });
}

/**
 * Hook to fetch merchant webhook settings
 */
export function useMerchantWebhook(merchantId?: string) {
    return useQuery({
        queryKey: ["merchantWebhook", merchantId],
        queryFn: async () => {
            if (!merchantId) return null;
            const response = await merchantApi.getWebhookUrl(merchantId);
            return response.data;
        },
        enabled: !!merchantId,
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
    });
}
