import { useEffect, useRef, useState, useCallback } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useSendTransaction,
  useSignTypedData,
  useConfig,
} from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import { hexToBigInt, maxUint256, concat } from "viem";
import { SWAP_CONSTANTS, ERC20_ABI } from "@/lib/constants/swap-constants";
import { safeBigInt } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useUpdateSwapAfterExecution } from "./use-swap";
import { useToast } from "@/components/ui/toast";
import axios from "axios";
import type { TabType, StepType } from "./use-transaction-form";

export interface UseSwapExecutionProps {
  swapData: any;
  step: StepType;
  activeTab: TabType;
  setStep: (step: StepType) => void;
  setSwapData: (data: any) => void;
}

export interface UseSwapExecutionReturn {
  isApproving: boolean;
  isSigning: boolean;
  isExecuting: boolean;
  isSwapSuccess: boolean;
  swapHash: `0x${string}` | undefined;
  handleExecuteSwap: () => void;
}

export function useSwapExecution({
  swapData,
  step,
  activeTab,
  setStep,
}: UseSwapExecutionProps): UseSwapExecutionReturn {
  const { toast } = useToast();
  const { address, chainId } = useAccount();
  const config = useConfig();
  const updateSwap = useUpdateSwapAfterExecution();
  const router = useRouter();

  const [isApproving, setIsApproving] = useState(false);
  const [isSigning, setIsSigning] = useState(false);

  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();

  const {
    sendTransactionAsync: executeSwap,
    data: swapHash,
    isPending: isExecuting,
  } = useSendTransaction();
  const { isLoading: isWaitingSwap, isSuccess: isSwapSuccess } =
    useWaitForTransactionReceipt({ hash: swapHash });

  const hasUpdatedSwap = useRef(false);
  const isSubmittingSwap = useRef(false);

  useEffect(() => {
    if (
      isSwapSuccess &&
      swapHash &&
      swapData &&
      address &&
      !hasUpdatedSwap.current &&
      step === "execute"
    ) {
      hasUpdatedSwap.current = true;
      updateSwap.mutate(
        {
          reference: swapData.swap.reference,
          data: { transactionHash: swapHash, sourceAddress: address },
        },
        {
          onSuccess: () => {
            if (activeTab === "swap") {
              setStep("completed");
              toast({
                title: "Swap Completed",
                description: "Your swap transaction has been completed successfully!",
                variant: "default",
              });
              setTimeout(() => {
                router.push("/history");
              }, 2000);
            } else {
              setStep("pending");
            }
          },
          onError: (error: any) => {
            console.error("Failed to update swap after execution:", error);
            hasUpdatedSwap.current = false;
            toast({
              title: "Update Failed",
              description:
                "Transaction was successful but we couldn't update the record. Please contact support.",
              variant: "destructive",
            });
          },
        },
      );
    }
  }, [isSwapSuccess, swapHash, swapData, address, step, updateSwap, activeTab, toast, setStep]);

  useEffect(() => {
    hasUpdatedSwap.current = false;
  }, [swapHash]);

  const handleExecuteSwap = useCallback(async () => {
    if (isSubmittingSwap.current) return;
    isSubmittingSwap.current = true;

    if (!swapData || !address) {
      toast({
        title: "Connection Error",
        description: "Please ensure your wallet is connected.",
        variant: "destructive",
      });
      isSubmittingSwap.current = false;
      return;
    }

    const isTokenInUSDC =
      swapData.swapParams.tokenIn.toLowerCase() === SWAP_CONSTANTS.USDC.toLowerCase();
    const isTokenInUSDT =
      swapData.swapParams.tokenIn.toLowerCase() === SWAP_CONSTANTS.USDT.toLowerCase();
    const tokenAddress = isTokenInUSDC
      ? SWAP_CONSTANTS.USDC
      : isTokenInUSDT
        ? SWAP_CONSTANTS.USDT
        : SWAP_CONSTANTS.CNGN;

    const amountIn = safeBigInt(swapData.swapParams.amountIn);
    const slippage = isTokenInUSDT
      ? Math.max(swapData.swapParams.slippage || 0.05, 0.1)
      : swapData.swapParams.slippage || 0.05;

    const fetchPermit2Quote = async () => {
      const res = await axios.get("/api/swap/permit2-quote", {
        params: {
          sellToken: swapData.swapParams.tokenIn,
          buyToken: swapData.swapParams.tokenOut,
          sellAmount: amountIn.toString(),
          taker: address,
          slippagePercentage: slippage,
          chainId: chainId || 8453,
        },
      });
      return res.data;
    };

    try {
      // 1. Fetch Permit2 quote
      let quote = await fetchPermit2Quote();

      if (!quote?.transaction) {
        throw new Error("Invalid swap quote: missing transaction data");
      }

      // 2. One-time approval if needed — await on-chain confirmation, then re-fetch a fresh quote
      if (quote.issues?.allowance) {
        const spender = quote.issues.allowance.spender as `0x${string}`;
        setIsApproving(true);

        const approveHash = await writeContractAsync({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [spender, maxUint256],
        });

        await waitForTransactionReceipt(config, { hash: approveHash });
        setIsApproving(false);

        // Re-fetch quote now that approval is confirmed — old quote may have expired
        quote = await fetchPermit2Quote();
        if (!quote?.transaction) {
          throw new Error("Failed to get fresh quote after approval");
        }
      }

      // 3. Sign EIP-712 Permit2 message (off-chain, free — no gas)
      //    Strip EIP712Domain from types: wagmi derives it from the domain field and
      //    passing it explicitly causes MetaMask to produce a malformed signature.
      let txData = quote.transaction.data as `0x${string}`;
      if (quote.permit2?.eip712) {
        setIsSigning(true);
        const { domain, types, message, primaryType } = quote.permit2.eip712;
        const { EIP712Domain: _removed, ...cleanTypes } = types as Record<string, unknown>;
        const signature = await signTypedDataAsync({
          domain,
          types: cleanTypes as any,
          primaryType,
          message,
        });
        txData = concat([txData, signature]) as `0x${string}`;
        setIsSigning(false);
      }

      // 4. Execute swap — single on-chain transaction
      const gasEstimate = quote.transaction.gas ? safeBigInt(quote.transaction.gas) : undefined;
      const gasWithBuffer = gasEstimate ? (gasEstimate * 115n) / 100n : undefined;

      await executeSwap({
        account: address as `0x${string}`,
        to: quote.transaction.to as `0x${string}`,
        data: txData,
        value:
          quote.transaction.value && hexToBigInt(quote.transaction.value) > 0n
            ? hexToBigInt(quote.transaction.value)
            : BigInt(0),
        gas: gasWithBuffer,
        chainId: chainId,
      });
    } catch (error: any) {
      console.error("Swap execution error:", error);
      setIsApproving(false);
      setIsSigning(false);
      // User rejected a wallet popup — silently exit, don't toast
      if (
        error?.message?.toLowerCase().includes("user rejected") ||
        error?.message?.toLowerCase().includes("user denied")
      ) {
        isSubmittingSwap.current = false;
        return;
      }
      const errorMessage =
        error.response?.data?.reason ||
        error.response?.data?.description ||
        error.message ||
        "Failed to execute swap";
      toast({
        title: "Swap Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      isSubmittingSwap.current = false;
    }
  }, [swapData, address, chainId, config, writeContractAsync, signTypedDataAsync, executeSwap, toast]);

  return {
    isApproving,
    isSigning,
    isExecuting: isExecuting || isWaitingSwap,
    isSwapSuccess,
    swapHash,
    handleExecuteSwap,
  };
}
