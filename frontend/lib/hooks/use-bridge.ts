/**
 * Bridge (CCTP cross-chain USDC) hooks — React Query wrappers around
 * bridgeApi, same shape as use-swap.ts's useCorridors/useInitializeSwap.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { bridgeApi, CreateBridgeTransferDto, BuildEvmSwapDto, getErrorMessage } from '@/lib/api';

/** Chains the bridge can move USDC to/from — drives chain selectors instead of hardcoding Stellar/Base/Ethereum. */
export function useBridgeChains() {
  return useQuery({
    queryKey: ['bridgeChains'],
    queryFn: async () => {
      const response = await bridgeApi.getChains();
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Non-USDC stablecoins bridgeable-in from a given chain — drives the Swap tab's source-token selector. Plain USDC is always available regardless, so this is only consulted for the "or a stablecoin like..." options. */
export function useChainTokens(chain: string | null | undefined) {
  return useQuery({
    queryKey: ['bridgeChainTokens', chain],
    queryFn: async () => {
      const response = await bridgeApi.getChainTokens(chain as string);
      return response.data;
    },
    enabled: !!chain,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateBridgeTransfer() {
  return useMutation({
    mutationFn: (data: CreateBridgeTransferDto) => bridgeApi.createTransfer(data),
    onError: (error) => {
      console.error('Failed to create bridge transfer:', getErrorMessage(error));
    },
  });
}

/** Same-chain EVM swap (no bridging) — powers the Swap tab once a non-Stellar chain is picked. */
export function useBuildEvmSwap() {
  return useMutation({
    mutationFn: (data: BuildEvmSwapDto) => bridgeApi.buildEvmSwap(data),
    onError: (error) => {
      console.error('Failed to build EVM swap:', getErrorMessage(error));
    },
  });
}

/** EVM destination follow-up swap — once a transfer with payoutTokenCode is COMPLETED. */
export function useBuildDestinationSwap() {
  return useMutation({
    mutationFn: (reference: string) => bridgeApi.buildDestinationSwap(reference),
    onError: (error) => {
      console.error('Failed to build destination swap:', getErrorMessage(error));
    },
  });
}

export function useRegisterBridgeBurn() {
  return useMutation({
    mutationFn: ({ reference, burnTxHash }: { reference: string; burnTxHash: string }) =>
      bridgeApi.registerBurn(reference, burnTxHash),
    onError: (error) => {
      console.error('Failed to register bridge burn:', getErrorMessage(error));
    },
  });
}

/** Stellar-source step 2 of 2 — call after the approve XDR is confirmed on-chain. */
export function useBuildBridgeBurnTransaction() {
  return useMutation({
    mutationFn: ({ reference, sourceAddress }: { reference: string; sourceAddress: string }) =>
      bridgeApi.buildBurnTransaction(reference, sourceAddress),
    onError: (error) => {
      console.error('Failed to build bridge burn transaction:', getErrorMessage(error));
    },
  });
}

/**
 * Read-only USDC balance for an address on a given chain — powers the
 * "you have $X available" display under the amount field on Send/Swap.
 */
export function useBridgeUsdcBalance(chain: string | undefined, address: string | undefined) {
  return useQuery({
    queryKey: ['bridgeUsdcBalance', chain, address],
    queryFn: async () => {
      const response = await bridgeApi.getBalance(chain as string, address as string);
      return response.data;
    },
    enabled: !!chain && !!address,
    staleTime: 10_000,
    retry: false,
  });
}

/**
 * Polls a bridge transfer's status — plain React Query polling rather
 * than a new WebSocket channel, lower risk for a first cut (see plan).
 * Stops polling once the transfer reaches a terminal state.
 */
export function useBridgeTransferStatus(reference: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['bridgeTransferStatus', reference],
    queryFn: async () => {
      const response = await bridgeApi.getStatus(reference as string);
      return response.data;
    },
    enabled: !!reference && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'COMPLETED' || status === 'FAILED' ? false : 5000;
    },
  });
}
