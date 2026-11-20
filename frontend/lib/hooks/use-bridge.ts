"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BridgeKit, type BridgeResult } from "@circle-fin/bridge-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { createSolanaAdapterFromProvider } from "@circle-fin/adapter-solana";
import { Connection } from "@solana/web3.js";
import {
  bridgeApi,
  InitiateBridgeDto,
  UpdateBridgeHashDto,
  getErrorMessage,
} from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useAccount, useSwitchChain } from "wagmi";
import {
  createPublicClient,
  http,
  type Chain,
  type PublicClient,
  parseUnits,
} from "viem";
import { writeContract, waitForTransactionReceipt } from "wagmi/actions";
import { wagmiConfig } from "@/lib/wagmi-config";
import {
  getChainId,
  getRpcUrl,
  getSolanaRpcUrl,
  isSolanaChain,
  isStellarChain,
} from "@/lib/constants/networks";
import { CCTPV2BridgingProvider } from "@circle-fin/provider-cctp-v2";
import { getSolanaProvider } from "@/lib/hooks/use-solana-wallet";
import { bridgeEvmToStellarViaCctp } from "@/lib/cctp-stellar-bridge";
import { bridgeStellarToEvmViaCctp } from "@/lib/cctp-stellar-source";

/**
 * CORS-safe RPCs for BridgeKit's public-client reads (balance checks and gas
 * simulation). Circle's default Ethereum endpoint (eth.merkle.io) omits
 * Access-Control-Allow-Origin on browser preflights, so those reads fail on
 * localhost — same fix as FALLBACK_RPC_URLS in lib/wagmi-config.ts.
 * NEXT_PUBLIC_RPC_* env vars (via getRpcUrl) take precedence when set.
 */
const FALLBACK_RPC_URLS: Record<number, string | undefined> = {
  1: "https://ethereum-rpc.publicnode.com",
  8453: "https://mainnet.base.org",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  84532: "https://sepolia.base.org",
};

const publicClientCache = new Map<number, PublicClient>();

/** Circle CCTPv2 TokenMessenger (v2 contracts) per source chain.
 *  TokenMessengerV2 is deployed at the same address across EVM chains for a
 *  given network, so mainnet and testnet share one address each. */
const CCTP_V2_TOKEN_MESSENGER: Record<number, `0x${string}`> = {
  1: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
  8453: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
  11155111: "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa",
  84532: "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa",
};

/** USDC contract addresses per source chain. */
const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  1: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

/** Minimal ERC-20 approve ABI for the manual pre-approve workaround. */
const APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/** Public-client factory injected into the viem adapters so BridgeKit never
 *  falls back to Circle's CORS-blocking default endpoints. */
const getPublicClient = ({ chain }: { chain: Chain }): PublicClient => {
  const cached = publicClientCache.get(chain.id);
  if (cached) return cached;
  const rpcUrl = getRpcUrl(chain.id) || FALLBACK_RPC_URLS[chain.id];
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl || undefined),
  }) as PublicClient;
  publicClientCache.set(chain.id, client);
  return client;
};

export function useSupportedChains() {
  return useQuery({
    queryKey: ["bridge", "supported-chains"],
    queryFn: async () => {
      const response = await bridgeApi.getSupportedChains();
      return response.data.chains;
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

/** What a finished `executeBridge` call knows about the transfer. */
export interface BridgeOutcome {
  reference: string;
  /** Circle CCTP flow state as returned by BridgeKit. */
  state: "pending" | "success" | "error";
  sourceTxHash?: string;
  destinationTxHash?: string;
}

type BridgeStepLike = BridgeResult["steps"][number];

/**
 * Pull the real source/destination tx hashes out of BridgeKit's step list.
 * Steps are ordered approve → burn → mint; the source tx is the burn (not
 * the approval), the destination tx is the mint.
 */
export const extractStepHashes = (result: Pick<BridgeResult, "steps">) => {
  const steps = result.steps ?? [];
  const txSteps = steps.filter((s) => s.txHash);
  const destinationTxHash = txSteps.find((s) => /mint/i.test(s.name))?.txHash;
  const burnStep = txSteps.find((s) => /burn/i.test(s.name));
  const nonMintTx = txSteps.filter((s) => !/mint/i.test(s.name));
  const sourceTxHash =
    burnStep?.txHash ?? nonMintTx[nonMintTx.length - 1]?.txHash;
  const failed: BridgeStepLike | undefined = steps.find((s) => s.state === "error");
  return { sourceTxHash, destinationTxHash, failed };
};

export function useBridge() {
  const { toast } = useToast();
  const {
    address: evmAddress,
    connector: evmConnector,
    chainId: currentChainId,
  } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [isBridging, setIsBridging] = useState(false);
  const [bridgeResult, setBridgeResult] = useState<BridgeOutcome | null>(null);

  const initiateMutation = useMutation({
    mutationFn: (data: InitiateBridgeDto) => bridgeApi.initiate(data),
  });

  const updateHashMutation = useMutation({
    mutationFn: (data: UpdateBridgeHashDto) => bridgeApi.updateHash(data),
  });

  /** Report a step hash to the backend (best effort — records/history only). */
  const reportStep = async (
    reference: string,
    step: "SOURCE_TX" | "DESTINATION_TX",
    hash: string,
    status: "PROCESSING" | "COMPLETED",
  ) => {
    try {
      await updateHashMutation.mutateAsync({ reference, step, hash, status });
    } catch (e) {
      console.warn(`Failed to report ${step} hash:`, e);
    }
  };

  const executeBridge = async (
    params: {
      fromChain: string;
      toChain: string;
      amount: string;
      /** The connected wallet address on the source chain. */
      sourceAddress?: string;
      recipientAddress: string;
      /** Off-ramp payout order this bridge funds (links funding + holds expiry). */
      offrampReference?: string;
      /** Stellar wallet signer; required when the source chain is Stellar. */
      stellarSigner?: (xdr: string) => Promise<string>;
      /** Connected Stellar wallet address; with stellarSigner it lets the user sign the Stellar mint. */
      stellarWalletAddress?: string;
    },
    onInitiated?: (reference: string) => void,
  ): Promise<BridgeOutcome | undefined> => {
    const sourceAddress = params.sourceAddress || evmAddress;

    if (!sourceAddress) {
      toast({
        title: "Connection required",
        description: "Please connect a wallet for the source chain",
        variant: "destructive",
      });
      return;
    }

    const sourceIsSolana = isSolanaChain(params.fromChain);
    const sourceIsStellar = isStellarChain(params.fromChain);

    // Stellar as a source runs on CCTP directly (Bridge Kit has no Stellar
    // adapter) and needs the Stellar wallet's signer; Stellar -> EVM only.
    if (
      sourceIsStellar &&
      (!params.stellarSigner ||
        isStellarChain(params.toChain) ||
        isSolanaChain(params.toChain))
    ) {
      toast({
        title: "Stellar source not supported for this route",
        description:
          "Bridging from Stellar needs a connected Stellar wallet and an EVM destination chain.",
        variant: "destructive",
      });
      return;
    }

    // Ensure we are on the correct EVM source chain. Solana and Stellar sign
    // with their own wallets instead of an EVM chain switch.
    const requiredChainId =
      sourceIsSolana || sourceIsStellar
        ? undefined
        : getChainId(params.fromChain);
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

    setIsBridging(true);
    try {
      // Fresh state for this attempt — a previous success must not leak in.
      setBridgeResult(null);

      // 1. Initiate on Backend (amount in USDC base units).
      const amountBase = parseUnits(params.amount, 6).toString();
      const initResponse = await initiateMutation.mutateAsync({
        fromChain: params.fromChain,
        toChain: params.toChain,
        amount: amountBase,
        sourceAddress,
        destinationAddress: params.recipientAddress,
        ...(params.offrampReference
          ? { offrampReference: params.offrampReference }
          : {}),
        // The wallet signs the bridge client-side; the backend only records
        // the transfer and tracks status to avoid double-execution.
        recordOnly: true,
      });

      const reference = initResponse.data.reference;
      onInitiated?.(reference);

      // Stellar -> EVM: burn on Stellar (Soroban), attest, mint on the EVM chain.
      if (sourceIsStellar && params.stellarSigner) {
        const destChainId = getChainId(params.toChain);
        if (!destChainId) {
          throw new Error(`Unsupported destination chain: ${params.toChain}`);
        }
        toast({
          title: "Bridge started",
          description: "Please confirm the transactions in your wallets",
        });
        const { sourceTxHash, destinationTxHash } = await bridgeStellarToEvmViaCctp({
          stellarAddress: sourceAddress,
          amount: params.amount,
          evmRecipient: params.recipientAddress,
          destChainId,
          signXdr: params.stellarSigner,
          onSourceTx: async (hash) => {
            setBridgeResult({ reference, state: "pending", sourceTxHash: hash });
            await reportStep(reference, "SOURCE_TX", hash, "PROCESSING");
          },
        });
        const outcomeFromStellar: BridgeOutcome = {
          reference,
          state: "success",
          sourceTxHash,
          destinationTxHash,
        };
        setBridgeResult(outcomeFromStellar);
        await reportStep(reference, "DESTINATION_TX", destinationTxHash, "COMPLETED");
        toast({
          title: "Bridge complete",
          description: `USDC arrived on ${params.toChain.replace(/_/g, " ")}`,
          variant: "success",
        });
        return outcomeFromStellar;
      }

      // EVM -> Stellar: Bridge Kit (<= 1.17.1) has no Stellar chain, so this leg
      // runs directly on CCTP v2 (burn with CctpForwarder hook, relayed mint).
      if (isStellarChain(params.toChain) && !sourceIsSolana) {
        const tokenMessenger = requiredChainId
          ? CCTP_V2_TOKEN_MESSENGER[requiredChainId]
          : undefined;
        const usdcAddress = requiredChainId ? USDC_ADDRESSES[requiredChainId] : undefined;
        if (!requiredChainId || !tokenMessenger || !usdcAddress) {
          throw new Error(`Unsupported source chain for Stellar bridge: ${params.fromChain}`);
        }

        toast({
          title: "Bridge started",
          description: "Please confirm the transactions in your wallet",
        });

        const { sourceTxHash, destinationTxHash } = await bridgeEvmToStellarViaCctp({
          chainId: requiredChainId,
          amountBase: parseUnits(params.amount, 6).toString(),
          stellarRecipient: params.recipientAddress,
          usdc: usdcAddress,
          tokenMessenger,
          stellarWalletAddress: params.stellarWalletAddress,
          stellarSigner: params.stellarSigner,
          onSourceTx: async (hash) => {
            setBridgeResult({ reference, state: "pending", sourceTxHash: hash });
            await reportStep(reference, "SOURCE_TX", hash, "PROCESSING");
          },
        });

        const stellarOutcome: BridgeOutcome = {
          reference,
          state: "success",
          sourceTxHash,
          destinationTxHash,
        };
        setBridgeResult(stellarOutcome);
        await reportStep(reference, "DESTINATION_TX", destinationTxHash, "COMPLETED");
        toast({
          title: "Bridge complete",
          description: "USDC arrived on Stellar",
          variant: "success",
        });
        return stellarOutcome;
      }

      // 2. Prepare Adapters

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

      const destinationIsStellar = isStellarChain(params.toChain);

      // Source adapter:
      //  - Solana: sign through the injected wallet (Phantom/Solflare).
      //  - EVM: viem adapter with a CORS-safe public client + manual approve.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let fromAdapter: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let toAdapter: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let kit: any;

      if (sourceIsSolana) {
        const solanaProvider = getSolanaProvider();
        if (!solanaProvider) {
          throw new Error(
            "No Solana wallet found. Install Phantom or Solflare to bridge from Solana.",
          );
        }
        if (!solanaProvider.publicKey) {
          await solanaProvider.connect();
        }
        const connection = new Connection(getSolanaRpcUrl(), "confirmed");
        fromAdapter = await createSolanaAdapterFromProvider({
          provider: solanaProvider as unknown as Parameters<
            typeof createSolanaAdapterFromProvider
          >[0]["provider"],
          connection,
        });
        // Circle's default providers handle Solana token delegation internally;
        // the EVM ERC-20 approve workaround below does not apply.
        kit = new BridgeKit();
      } else {
        if (!evmConnector) throw new Error("EVM wallet not connected");

        // Log every wallet RPC request so a wallet-side risk modal can be
        // traced to the exact method that triggered it (DevTools console).
        type RpcArgs = { method: string; params?: unknown };
        const withRequestLog = (provider: unknown, label: string): unknown => {
          const maybeRpc = provider as { request?: (args: RpcArgs) => Promise<unknown> } | null;
          if (!maybeRpc?.request) return provider;
          const original = maybeRpc.request.bind(maybeRpc);
          return new Proxy(provider as object, {
            get(target, prop, receiver) {
              if (prop === "request") {
                return async (args: RpcArgs) => {
                  console.debug(`[bridge:${label}] ${args?.method}`);
                  return original(args);
                };
              }
              const value = Reflect.get(target, prop, receiver);
              return typeof value === "function"
                ? (value as (...fnArgs: unknown[]) => unknown).bind(target)
                : value;
            },
          });
        };

        // Use raw provider for source chain since we already enforced the switch at the start.
        // Destination adapter wraps the provider so mint transactions auto-switch networks.
        const sourceProvider = withRequestLog(
          await evmConnector.getProvider(),
          "src",
        );
        fromAdapter = await createViemAdapterFromProvider({
          provider: sourceProvider as any,
          getPublicClient,
        });

        const toChainId = getChainId(params.toChain);

        // Stellar has no EVM adapter. Circle's CctpForwarder submits the mint on
        // Stellar, so the source EVM adapter is reused (mirrors the backend's
        // BridgeKit call). EVM destinations still get their own switching adapter.
        toAdapter = fromAdapter;
        if (!destinationIsStellar) {
          const destinationProvider = await evmConnector.getProvider();
          const switchingProvider = withRequestLog(
            toChainId
              ? createSwitchingProvider(destinationProvider, toChainId)
              : destinationProvider,
            "dst",
          );

          toAdapter = await createViemAdapterFromProvider({
            provider: switchingProvider as any,
            getPublicClient,
          });
        }

        if (!requiredChainId) {
          throw new Error(`Unsupported source chain: ${params.fromChain}`);
        }

        // 3. Pre-approve USDC with a standard ERC-20 approve.
        // BridgeKit internally calls `usdc.increaseAllowance`, which OKX rejects
        // as a "risky signature". We do a normal `approve` tx ourselves, then
        // tell BridgeKit to skip its own approval step.
        const tokenMessenger = CCTP_V2_TOKEN_MESSENGER[requiredChainId];
        const usdcAddress = USDC_ADDRESSES[requiredChainId];
        if (!tokenMessenger || !usdcAddress) {
          throw new Error("Unsupported source chain for CCTP bridge");
        }

        const approveTxHash = await writeContract(wagmiConfig, {
          address: usdcAddress,
          abi: APPROVE_ABI,
          functionName: "approve",
          args: [tokenMessenger, BigInt(amountBase)] as const,
          chainId: requiredChainId,
        } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

        await waitForTransactionReceipt(wagmiConfig, {
          hash: approveTxHash,
          chainId: requiredChainId,
        });

        // Make BridgeKit's own approve a no-op since we already handled it.
        const provider = new CCTPV2BridgingProvider();
        (provider as unknown as { approve: () => Promise<{ type: "noop" }> }).approve =
          async () => ({ type: "noop" });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        kit = new BridgeKit({ providers: [provider as any] });
      }

      toast({
        title: "Bridge started",
        description: "Please confirm the transaction in your wallet",
      });

      // 4. Run the full CCTPv2 flow: approve (skipped) -> burn -> attestation -> mint.
      // This call blocks until Circle attests and the destination mint lands.
      const result = await kit.bridge({
        from: {
          adapter: fromAdapter,
          chain: params.fromChain as any,
        },
        to: sourceIsSolana
          ? {
              // Forwarder-only destination: Circle's relayer submits the mint,
              // so no destination wallet/adapter is required.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              chain: params.toChain as any,
              recipientAddress: params.recipientAddress,
              useForwarder: true,
            }
          : destinationIsStellar
          ? {
              adapter: fromAdapter,
              chain: params.toChain as any,
              recipientAddress: params.recipientAddress,
              // Circle's Orbit relayer submits the Stellar mint.
              useForwarder: true,
            }
          : {
              adapter: toAdapter,
              chain: params.toChain as any,
              recipientAddress: params.recipientAddress,
              // Circle's Orbit relayer submits the mint (relay fee deducted from
              // the minted USDC). Without this, kit.preflight aborts when the
              // wallet has 0 native gas on the destination chain.
              useForwarder: true,
            },
        amount: amountBase,
        // EVM only: sequential approve -> burn as two plain transactions. The
        // EIP-5792 batched path (wallet_sendCalls) trips risk modals in wallets
        // such as OKX that don't fully support it.
        ...(sourceIsSolana ? {} : { config: { batchTransactions: false } }),
      });

      const { sourceTxHash, destinationTxHash, failed } = extractStepHashes(result);

      if (result?.state === "error" || failed) {
        throw new Error(failed?.errorMessage || "Bridge transaction failed");
      }

      const outcome: BridgeOutcome = {
        reference,
        state: result?.state === "success" ? "success" : "pending",
        sourceTxHash,
        destinationTxHash,
      };
      setBridgeResult(outcome);

      // 4. Report hashes so backend records/history show real explorer links.
      if (sourceTxHash) await reportStep(reference, "SOURCE_TX", sourceTxHash, "PROCESSING");
      if (destinationTxHash)
        await reportStep(reference, "DESTINATION_TX", destinationTxHash, "COMPLETED");

      if (outcome.state === "success") {
        toast({
          title: "Bridge complete",
          description: `USDC arrived on ${params.toChain.replace(/_/g, " ")}`,
          variant: "success",
        });
      } else {
        toast({
          title: "Transaction sent",
          description: "Your bridge transaction is being processed",
          variant: "success",
        });
      }

      return outcome;
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
