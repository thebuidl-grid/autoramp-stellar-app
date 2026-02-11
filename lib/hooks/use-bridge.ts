"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { createSolanaAdapterFromProvider } from "@circle-fin/adapter-solana";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  bridgeApi,
  InitiateBridgeDto,
  UpdateBridgeHashDto,
  getErrorMessage,
} from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useAccount, useSwitchChain } from "wagmi";
import { getChainId } from "@/lib/constants/networks";

export function useSupportedChains() {
  return useQuery({
    queryKey: ["bridge", "supported-chains"],
    queryFn: async () => {
      const response = await bridgeApi.getSupportedChains();
      const chains = response.data.chains;
      // Ensure Solana is in the list
      if (!chains.some((c: string) => c.toLowerCase() === "solana")) {
        return [...chains, "Solana"];
      }
      return chains;
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });
}

export function useBridgeStatus(reference?: string) {
  return useQuery({
    queryKey: ["bridge", "status", reference],
    queryFn: async () => {
      if (!reference) return null;
      const response = await bridgeApi.getStatus(reference);
      return response.data;
    },
    enabled: !!reference,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === "COMPLETED" || data?.status === "FAILED")
        return false;
      return 5000; // Poll every 5 seconds
    },
  });
}

export function useBridge() {
  const { toast } = useToast();
  const {
    address: evmAddress,
    connector: evmConnector,
    chainId: currentChainId,
  } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { publicKey: solanaPublicKey, wallet: solanaWallet } = useWallet();
  const [isBridging, setIsBridging] = useState(false);
  const [bridgeResult, setBridgeResult] = useState<any>(null);

  const initiateMutation = useMutation({
    mutationFn: (data: InitiateBridgeDto) => bridgeApi.initiate(data),
  });

  const updateHashMutation = useMutation({
    mutationFn: (data: UpdateBridgeHashDto) => bridgeApi.updateHash(data),
  });

  const executeBridge = async (params: {
    fromChain: string;
    toChain: string;
    amount: string;
    recipientAddress: string;
  }) => {
    const isFromSolana = params.fromChain.toLowerCase() === "solana";
    const isToSolana = params.toChain.toLowerCase() === "solana";

    const sourceAddress = isFromSolana
      ? solanaPublicKey?.toBase58()
      : evmAddress;

    if (!sourceAddress) {
      toast({
        title: "Connection required",
        description: `Please connect your ${isFromSolana ? "Solana" : "EVM"} wallet`,
        variant: "destructive",
      });
      return;
    }

    // Ensure we are on the correct source chain for EVM
    if (!isFromSolana) {
      const requiredChainId = getChainId(params.fromChain);
      if (requiredChainId && currentChainId !== requiredChainId) {
        try {
          await switchChainAsync({ chainId: requiredChainId });
        } catch (error) {
          console.error("Failed to switch chain:", error);
          toast({
            title: "Network Switch Failed",
            description: `Please switch to ${params.fromChain} to continue.`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    setIsBridging(true);
    try {
      // 1. Initiate on Backend
      const initResponse = await initiateMutation.mutateAsync({
        fromChain: params.fromChain,
        toChain: params.toChain,
        amount: params.amount,
        sourceAddress,
        destinationAddress: params.recipientAddress,
      });

      const reference = initResponse.data.reference;

      // 2. Prepare Adapters
      const kit = new BridgeKit();

      // Helper to wrap provider with auto-switching logic
      const createSwitchingProvider = (provider: any, chainId: number) => {
        if (!provider || !chainId) return provider;
        return {
          ...provider,
          request: async (args: any) => {
            if (
              args.method === "eth_sendTransaction" ||
              args.method === "eth_estimateGas" ||
              args.method === "eth_call"
            ) {
              try {
                const currentChainIdHex = await provider.request({
                  method: "eth_chainId",
                });
                const currentChainId = parseInt(currentChainIdHex, 16);
                if (currentChainId !== chainId) {
                  await provider.request({
                    method: "wallet_switchEthereumChain",
                    params: [{ chainId: `0x${chainId.toString(16)}` }],
                  });
                }
              } catch (e) {
                console.warn("Failed to switch chain automatically", e);
              }
            }
            return provider.request(args);
          },
        };
      };

      let fromAdapter: any;
      if (isFromSolana) {
        if (!solanaWallet || !solanaWallet.adapter) {
          throw new Error("Solana wallet not connected");
        }
        fromAdapter = await createSolanaAdapterFromProvider({
          provider: solanaWallet.adapter as any,
        });
      } else {
        if (!evmConnector) throw new Error("EVM wallet not connected");
        const provider = await evmConnector.getProvider();
        // Use raw provider for source chain since we already enforced the switch at the start
        // This avoids wrapping interference with the burn simulation
        fromAdapter = await createViemAdapterFromProvider({
          provider: provider as any,
        });
      }

      let toAdapter: any;
      if (isToSolana) {
        if (!solanaWallet || !solanaWallet.adapter) {
          throw new Error("Solana wallet not connected");
        }
        // Reuse adapter if also from Solana (unlikely for bridge but possible in generic context)
        toAdapter = isFromSolana
          ? fromAdapter // Same chain, same adapter
          : await createSolanaAdapterFromProvider({
              provider: solanaWallet.adapter as any,
            });
      } else {
        if (!evmConnector) throw new Error("EVM wallet not connected");
        const provider = await evmConnector.getProvider();
        const toChainId = getChainId(params.toChain);

        // Always create a new adapter for destination with strict chain enforcement
        // This ensures mint transactions (on destination) trigger a switch
        const switchingProvider = toChainId
          ? createSwitchingProvider(provider, toChainId)
          : provider;

        console.log("Switching provider:", switchingProvider);

        toAdapter = await createViemAdapterFromProvider({
          provider: switchingProvider as any,
        });
      }

      toast({
        title: "Bridge started",
        description: "Please confirm the transaction in your wallet",
      });

      console.log("Bridging initiated with Circle SDK...");
      const result: any = await kit.bridge({
        from: { adapter: fromAdapter, chain: params.fromChain as any },
        to: {
          adapter: toAdapter,
          chain: params.toChain as any,
          recipientAddress: params.recipientAddress,
        },
        amount: params.amount,
      });

      console.log("Bridge transaction result:", result);
      setBridgeResult(result);

      // 3. Report Hashes
      if (result.sourceTxHash) {
        console.log("Reporting source hash to backend...", result.sourceTxHash);
        await updateHashMutation.mutateAsync({
          reference,
          step: "SOURCE_TX",
          hash: result.sourceTxHash,
          status: "PROCESSING",
        });
      }

      toast({
        title: "Transaction sent",
        description: "Your bridge transaction is being processed",
        variant: "success",
      });

      return reference;
    } catch (error: any) {
      console.error("Bridge error:", error);
      toast({
        title: "Bridge failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsBridging(false);
    }
  };

  return {
    executeBridge,
    isBridging,
    bridgeResult,
    initiateStatus: initiateMutation.status,
    updateStatus: updateHashMutation.status,
  };
}
