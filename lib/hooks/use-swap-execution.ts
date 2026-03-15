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

  const spender =
    swapData?.allowanceTarget || SWAP_CONSTANTS.ZEROEX_EXCHANGE_PROXY;

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
    sendTransactionAsync: executeSwap,
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
    if (!swapData || !address) {
      toast({
        title: "Connection Error",
        description: "Please ensure your wallet is connected.",
        variant: "destructive",
      });
      return;
    }
    try {
      const isUSDC =
        swapData.swapParams.tokenIn.toLowerCase() ===
        SWAP_CONSTANTS.USDC.toLowerCase();
      const tokenAddress = isUSDC ? SWAP_CONSTANTS.USDC : SWAP_CONSTANTS.CNGN;
      const amountIn = BigInt(swapData.swapParams.amountIn.toString());

      const spender =
        swapData?.allowanceTarget || SWAP_CONSTANTS.ZEROEX_EXCHANGE_PROXY;

      console.log("Approving token:", {
        tokenAddress,
        spender,
        amountIn: amountIn.toString(),
      });

      approveToken({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender as `0x${string}`, amountIn],
      });
    } catch (error: any) {
      console.error("Approve error:", error);
      toast({
        title: "Approval Failed",
        description: error.message || "Failed to approve token",
        variant: "destructive",
      });
    }
  };

  const handleExecuteSwap = async () => {
    console.log("handleExecuteSwap details:", { address, swapData });
    if (!address || !swapData) {
      toast({
        title: "Swap Error",
        description: "Missing wallet address or swap data. Please try again.",
        variant: "destructive",
      });
      return;
    }

    const amountIn = BigInt(swapData.swapParams.amountIn.toString());

    try {
      console.log("Fetching firm quote for execution...");
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
      console.log("Quote received:", quote);

      if (!quote || !quote.transaction) {
        throw new Error("Invalid swap quote: missing transaction data");
      }

      console.log("Triggering wallet transaction...");
      // 2. Execute Swap via sendTransaction - v2 returns fields in a nested 'transaction' object
      // Apply 15% buffer to gas as recommended for 0x API
      const gasEstimate = quote.transaction.gas
        ? BigInt(quote.transaction.gas)
        : undefined;
      const gasWithBuffer = gasEstimate
        ? (gasEstimate * 115n) / 100n
        : undefined;

      await executeSwap({
        account: address as `0x${string}`,
        to: quote.transaction.to as `0x${string}`,
        data: quote.transaction.data as `0x${string}`,
        value:
          quote.transaction.value && hexToBigInt(quote.transaction.value) > 0n
            ? hexToBigInt(quote.transaction.value)
            : BigInt(0),
        gas: gasWithBuffer,
        chainId: chainId,
      });
      console.log("Transaction submitted successfully");
    } catch (error: any) {
      console.error("Swap execution error:", error);
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
    }
  };

  // Determine if approval is needed based on the input token
  const needsApproval =
    swapData &&
    allowance !== undefined &&
    (() => {
      const amountIn = BigInt(swapData.swapParams.amountIn.toString());
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
