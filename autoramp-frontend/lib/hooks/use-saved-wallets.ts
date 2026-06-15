import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/api';
import type {
    UserWallet,
    CreateUserWalletDto,
    UpdateUserWalletDto,
} from '@/lib/api';

/**
 * Hook to fetch all saved wallets for the authenticated user
 */
export function useSavedWallets() {
    return useQuery({
        queryKey: ['saved-wallets'],
        queryFn: async () => {
            const response = await userApi.getUserWallets();
            return response.data;
        },
    });
}

/**
 * Hook to create a new wallet
 */
export function useCreateWallet() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateUserWalletDto) => {
            const response = await userApi.createUserWallet(data);
            return response.data;
        },
        onSuccess: () => {
            // Invalidate saved wallets query to refetch the list
            queryClient.invalidateQueries({ queryKey: ['saved-wallets'] });
        },
    });
}

/**
 * Hook to update a saved wallet
 */
export function useUpdateWallet() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateUserWalletDto }) => {
            const response = await userApi.updateUserWallet(id, data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['saved-wallets'] });
        },
    });
}

/**
 * Hook to delete a saved wallet
 */
export function useDeleteWallet() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            await userApi.deleteUserWallet(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['saved-wallets'] });
        },
    });
}
