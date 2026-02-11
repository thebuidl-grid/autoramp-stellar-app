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
import { useAccount } from "wagmi";

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
  const { address: evmAddress, connector: evmConnector } = useAccount();
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
        fromAdapter = await createViemAdapterFromProvider({
          provider: provider as any,
        });
      }

      let toAdapter: any;
      if (isToSolana) {
        if (!solanaWallet || !solanaWallet.adapter) {
          throw new Error("Solana wallet not connected");
        }
        toAdapter = isFromSolana
          ? fromAdapter
          : await createSolanaAdapterFromProvider({
              provider: solanaWallet.adapter as any,
            });
      } else {
        if (!evmConnector) throw new Error("EVM wallet not connected");
        toAdapter = !isFromSolana
          ? fromAdapter
          : await createViemAdapterFromProvider({
              provider: (await evmConnector.getProvider()) as any,
            });
      }

      toast({
        title: "Bridge started",
        description: "Please confirm the transaction in your wallet",
      });

      const result: any = await kit.bridge({
        from: { adapter: fromAdapter, chain: params.fromChain as any },
        to: {
          adapter: toAdapter,
          chain: params.toChain as any,
          recipientAddress: params.recipientAddress,
        },
        amount: params.amount,
      });

      setBridgeResult(result);

      // 3. Report Hashes
      if (result.sourceTxHash) {
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
