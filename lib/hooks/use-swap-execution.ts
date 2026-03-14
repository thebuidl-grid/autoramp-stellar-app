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
  allowance: bigint | undefined;
  isApproving: boolean;
  isApproved: boolean;
  isExecuting: boolean;
  isSwapSuccess: boolean;
  swapHash: `0x${string}` | undefined;
  needsApproval: boolean;
  handleApprove: () => void;
  handleExecuteSwap: () => void;
  refetchAllowance: () => void;
}

// Add these imports at the top
import { useEffect, useRef, useState } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useAccount,
  useSendTransaction,
} from "wagmi";
import { parseUnits, hexToBigInt } from "viem";
import { SWAP_CONSTANTS, ERC20_ABI } from "@/lib/constants/swap-constants";

export function useSwapExecution({
  swapData,
  step,
  activeTab,
  setStep,
}: UseSwapExecutionProps): UseSwapExecutionReturn {
  const { toast } = useToast();
  const { address, chainId } = useAccount();
  const updateSwap = useUpdateSwapAfterExecution();

  // Determine which token to check allowance for based on swap data
  const tokenAddressForAllowance = swapData?.swapParams?.tokenIn
    ? swapData.swapParams.tokenIn.toLowerCase() ===
      SWAP_CONSTANTS.USDC.toLowerCase()
      ? SWAP_CONSTANTS.USDC
      : SWAP_CONSTANTS.CNGN
    : SWAP_CONSTANTS.USDC; // Default to USDC

  const spender = SWAP_CONSTANTS.ZEROEX_EXCHANGE_PROXY;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddressForAllowance as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "allowance",
    args:
      address && spender
        ? ([address as `0x${string}`, spender as `0x${string}`] as const)
        : undefined,
    query: {
      enabled: !!address && !!spender && step === "execute" && !!swapData,
    },
  });

  const {
    writeContract: approveToken,
    data: approveHash,
    isPending: isApproving,
  } = useWriteContract();
  const { isLoading: isWaitingApproval, isSuccess: isApproved } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const {
    sendTransaction: executeSwap,
    data: swapHash,
    isPending: isExecuting,
  } = useSendTransaction();
  const { isLoading: isWaitingSwap, isSuccess: isSwapSuccess } =
    useWaitForTransactionReceipt({ hash: swapHash });

  const hasUpdatedSwap = useRef(false);

  useEffect(() => {
    if (isApproved) refetchAllowance();
  }, [isApproved, refetchAllowance]);

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
            // For swap tab, mark as completed immediately (no WebSocket needed)
            // For sell tab, go to pending state (uses WebSocket for offramp updates)
            if (activeTab === "swap") {
              setStep("completed");
              toast({
                title: "Swap Completed",
                description:
                  "Your swap transaction has been completed successfully!",
                variant: "default",
              });
            } else {
              setStep("pending");
            }
          },
          onError: () => {
            hasUpdatedSwap.current = false;
          },
        },
      );
    }
  }, [
    isSwapSuccess,
    swapHash,
    swapData,
    address,
    step,
    updateSwap,
    activeTab,
    toast,
    setStep,
  ]);

  useEffect(() => {
    hasUpdatedSwap.current = false;
  }, [swapHash]);

  const handleApprove = async () => {
    if (!swapData || !address) return;
    try {
      const rawAmount = swapData.swapParams.amountIn;
      // If the amount has many decimal places (more than 15), parseFloat will fail with precision error.
      // Standardize: if it doesn't look like units (no large numbers), treat as human readable.
      // But actually, we should just ensure we never pass "dirty" numbers.
      const isUSDC =
        swapData.swapParams.tokenIn.toLowerCase() ===
        SWAP_CONSTANTS.USDC.toLowerCase();
      const tokenAddress = isUSDC ? SWAP_CONSTANTS.USDC : SWAP_CONSTANTS.CNGN;
      const decimals = isUSDC
        ? SWAP_CONSTANTS.USDC_DECIMALS
        : SWAP_CONSTANTS.CNGN_DECIMALS;

      // Safety: If rawAmount looks like a unit string already (no dots, large number),
      // but usually the backend should return human readable in swapParams.
      // For now, let's just make sure we don't parseFloat it.
      const amountIn = parseUnits(
        swapData.swapParams.amountIn.toString(),
        decimals,
      );

      const spender =
        swapData?.allowanceTarget || SWAP_CONSTANTS.ZEROEX_EXCHANGE_PROXY;

      approveToken({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender as `0x${string}`, amountIn],
      });
    } catch (error: any) {
      toast({
        title: "Approval Failed",
        description: error.message || "Failed to approve token",
        variant: "destructive",
      });
    }
  };

  const handleExecuteSwap = async () => {
    if (!address || !swapData) return;

    const isUSDC =
      swapData.swapParams.tokenIn.toLowerCase() ===
      SWAP_CONSTANTS.USDC.toLowerCase();
    const decimals = isUSDC
      ? SWAP_CONSTANTS.USDC_DECIMALS
      : SWAP_CONSTANTS.CNGN_DECIMALS;
    const amountIn = parseUnits(swapData.swapParams.amountIn, decimals);

    try {
      // Use 0x API exclusively
      const response = await axios.get("/api/swap/quote", {
        params: {
          sellToken: swapData.swapParams.tokenIn,
          buyToken: swapData.swapParams.tokenOut,
          sellAmount: amountIn.toString(),
          taker: address,
          slippagePercentage: swapData.swapParams.slippage || 0.05,
          chainId: chainId || 8453,
        },
      });

      const quote = response.data;

      if (!quote || !quote.transaction) {
        throw new Error("Invalid swap quote: missing transaction data");
      }

      // 2. Execute Swap via sendTransaction - v2 returns fields in a nested 'transaction' object
      executeSwap({
        to: quote.transaction.to as `0x${string}`,
        data: quote.transaction.data as `0x${string}`,
        value: quote.transaction.value
          ? hexToBigInt(quote.transaction.value)
          : BigInt(0),
      });
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.reason ||
        error.message ||
        "Failed to execute swap";
      toast({
        title: "Swap Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Determine if approval is needed based on the input token
  const needsApproval =
    swapData &&
    allowance !== undefined &&
    (() => {
      const isUSDC =
        swapData.swapParams.tokenIn.toLowerCase() ===
        SWAP_CONSTANTS.USDC.toLowerCase();
      const decimals = isUSDC
        ? SWAP_CONSTANTS.USDC_DECIMALS
        : SWAP_CONSTANTS.CNGN_DECIMALS;
      const amountIn = parseUnits(
        swapData.swapParams.amountIn.toString(),
        decimals,
      );
      return amountIn > allowance;
    })();

  return {
    allowance,
    isApproving: isApproving || isWaitingApproval,
    isApproved,
    isExecuting: isExecuting || isWaitingSwap,
    isSwapSuccess,
    swapHash,
    needsApproval: !!needsApproval,
    handleApprove,
    handleExecuteSwap,
    refetchAllowance,
  };
}
