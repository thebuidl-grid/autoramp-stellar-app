"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, CreateApiKeyDto, getErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { useToast } from "@/components/ui/toast";

/**
 * Fetch All Users Hook
 */
export function useAllUsers(page: number = 1, limit: number = 10) {
  const { isAdmin } = useAuthStore();

  return useQuery({
    queryKey: ["adminUsers", page, limit],
    queryFn: async () => {
      const response = await adminApi.getUsers(page, limit);
      return response.data;
    },
    enabled: isAdmin,
  });
}

/**
 * Fetch User By ID Hook
 */
export function useUserById(id: string) {
  const { isAdmin } = useAuthStore();

  return useQuery({
    queryKey: ["adminUser", id],
    queryFn: async () => {
      const response = await adminApi.getUserById(id);
      return response.data;
    },
    enabled: isAdmin && !!id,
  });
}

/**
 * Fetch All API Keys Hook (Admin)
 */
export function useAllApiKeys(page: number = 1, limit: number = 10) {
  const { isAdmin } = useAuthStore();

  return useQuery({
    queryKey: ["adminApiKeys", page, limit],
    queryFn: async () => {
      const response = await adminApi.getAllApiKeys(page, limit);
      return response.data;
    },
    enabled: isAdmin,
  });
}

/**
 * Fetch User API Keys Hook (Admin)
 */
export function useUserApiKeys(userId: string) {
  const { isAdmin } = useAuthStore();

  return useQuery({
    queryKey: ["adminUserApiKeys", userId],
    queryFn: async () => {
      const response = await adminApi.getUserApiKeys(userId);
      return response.data;
    },
    enabled: isAdmin && !!userId,
  });
}

/**
 * Create API Key for User Mutation Hook (Admin)
 */
export function useCreateApiKeyForUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: CreateApiKeyDto }) =>
      adminApi.createApiKeyForUser(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminApiKeys"] });
      queryClient.invalidateQueries({ queryKey: ["adminUserApiKeys"] });
      toast({
        title: "API Key Created",
        description: "Make sure to copy the key now. It won't be shown again!",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to create API key",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });
}

/**
 * Revoke API Key Mutation Hook (Admin)
 */
export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => adminApi.revokeApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminApiKeys"] });
      queryClient.invalidateQueries({ queryKey: ["adminUserApiKeys"] });
      toast({
        title: "API Key Revoked",
        description: "The API key has been revoked and can no longer be used.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to revoke API key",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });
}

/**
 * Fetch Admin Transaction Summary Hook
 */
export function useAdminTransactionSummary() {
  const { isAdmin } = useAuthStore();

  return useQuery({
    queryKey: ["adminTransactionSummary"],
    queryFn: async () => {
      const response = await adminApi.getAdminTransactionSummary();
      return response.data;
    },
    enabled: isAdmin,
  });
}

