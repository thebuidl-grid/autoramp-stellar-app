import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { userApi } from "@/lib/api";
import type {
  SavedAccountNumber,
  InitiateAddAccountDto,
  VerifyAndAddAccountDto,
  UpdateSavedAccountDto,
} from "@/lib/api";

/**
 * Hook to fetch all saved bank accounts for the authenticated user
 */
export function useSavedAccounts() {
  return useQuery({
    queryKey: ["saved-accounts"],
    queryFn: async () => {
      const response = await userApi.getSavedAccounts();
      return response.data;
    },
  });
}

/**
 * Hook to initiate adding a new account (resolves account name and sends OTP)
 */
export function useInitiateAddAccount() {
  return useMutation({
    mutationFn: async (data: InitiateAddAccountDto) => {
      const response = await userApi.initiateAddAccount(data);
      return response.data;
    },
  });
}

/**
 * Hook to verify OTP and add the account
 */
export function useVerifyAndAddAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: VerifyAndAddAccountDto) => {
      const response = await userApi.verifyAndAddAccount(data);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate saved accounts query to refetch the list
      queryClient.invalidateQueries({ queryKey: ["saved-accounts"] });
    },
  });
}

/**
 * Hook to update a saved account
 */
export function useUpdateSavedAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateSavedAccountDto;
    }) => {
      const response = await userApi.updateSavedAccount(id, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-accounts"] });
    },
  });
}

/**
 * Hook to delete a saved account
 */
export function useDeleteSavedAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await userApi.deleteSavedAccount(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-accounts"] });
    },
  });
}
