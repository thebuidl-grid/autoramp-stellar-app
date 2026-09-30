/**
 * Swap Hook
 * 
 * React Query hooks for swap operations
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { swapApi, InitializeSwapDto, UpdateSwapDto, CreateSimpleSwapDto } from '@/lib/api';
import { getErrorMessage } from '@/lib/api';

/**
 * Hook to initialize a swap transaction
 */
export function useInitializeSwap() {
  return useMutation({
    mutationFn: (data: InitializeSwapDto) => swapApi.initializeSwap(data),
    onError: (error) => {
      console.error('Failed to initialize swap:', getErrorMessage(error));
    },
  });
}

/**
 * Hook to update swap after execution
 */
export function useUpdateSwapAfterExecution() {
  return useMutation({
    mutationFn: ({ reference, data }: { reference: string; data: UpdateSwapDto }) =>
      swapApi.updateSwapAfterExecution(reference, data),
    onError: (error) => {
      console.error('Failed to update swap:', getErrorMessage(error));
    },
  });
}

/**
 * Hook to create a simple swap transaction (just store in database)
 */
export function useCreateSimpleSwap() {
  return useMutation({
    mutationFn: (data: CreateSimpleSwapDto) => swapApi.createSimpleSwap(data),
    onError: (error) => {
      console.error('Failed to create swap:', getErrorMessage(error));
    },
  });
}

/**
 * Hook to get token balance
 */
export function useTokenBalance(token: string, address?: string) {
  return useQuery({
    queryKey: ['tokenBalance', token, address],
    queryFn: () => {
      if (!address) throw new Error('Address is required');
      return swapApi.getTokenBalance(token, address);
    },
    enabled: !!address && !!token,
    refetchInterval: 10000, // Refetch every 10 seconds
  });
}

/**
 * Hook to get token balances (USDC and CNGN)
 */
export function useTokenBalances(address?: string) {
  return useQuery({
    queryKey: ['tokenBalances', address],
    queryFn: () => swapApi.getTokenBalances(address),
    enabled: !!address,
    refetchInterval: 10000, // Refetch every 10 seconds
  });
}

