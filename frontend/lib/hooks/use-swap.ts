/**
 * Swap Hook
 * 
 * React Query hooks for swap operations
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { swapApi, InitializeSwapDto, UpdateSwapDto, CreateSimpleSwapDto } from '@/lib/api';
import { getErrorMessage } from '@/lib/api';

/**
 * Hook to list active corridors (fiat/stablecoin pairs) — drives currency
 * selectors instead of hardcoding NGN/CNGN.
 */
export function useCorridors() {
  return useQuery({
    queryKey: ['corridors'],
    queryFn: async () => {
      const response = await swapApi.getCorridors();
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

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
    queryFn: async () => {
      if (!address) throw new Error('Address is required');
      const response = await swapApi.getTokenBalance(token, address);
      return response.data;
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
    queryFn: async () => {
      const response = await swapApi.getTokenBalances(address as string);
      return response.data;
    },
    enabled: !!address,
    refetchInterval: 10000, // Refetch every 10 seconds
  });
}

/**
 * Hook to get a live swap quote between USDC and a corridor stablecoin
 * (e.g. CNGN, CGHS) via Stellar's native path-payment routing.
 */
export function useSwapQuote(
  fromToken: string | undefined,
  toToken: string | undefined,
  amount: number | null,
) {
  return useQuery({
    queryKey: ['swapQuote', fromToken, toToken, amount],
    queryFn: async () => {
      const response = await swapApi.getQuote(fromToken as string, toToken as string, amount as number);
      return response.data;
    },
    enabled: !!fromToken && !!toToken && !!amount && amount > 0,
    staleTime: 10_000,
    // Retry only transient failures (rate limiting, network blips, server
    // errors) — a 400 (e.g. "no payment path found") is permanent and
    // retrying it just delays a legitimate error message.
    retry: (failureCount, error: any) => {
      const status = error?.response?.status;
      const isTransient = status === 429 || status === undefined || status >= 500;
      return isTransient && failureCount < 2;
    },
    retryDelay: (attempt) => 500 * Math.pow(2, attempt),
  });
}

