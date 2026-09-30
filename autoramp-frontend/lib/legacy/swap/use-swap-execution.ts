import { useEffect, useRef } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useAccount,
} from "wagmi";
import { parseUnits } from "viem";
import { SWAP_CONSTANTS, SWAP_ROUTER_ABI, ERC20_ABI } from "./swap-constants";
import { useUpdateSwapAfterExecution } from "@/lib/hooks/use-swap";
import { useToast } from "@/components/ui/toast";
import type { TabType, StepType } from "@/lib/hooks/use-transaction-form";

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

export function useSwapExecution({
  swapData,
  step,
  activeTab,
  setStep,
}: UseSwapExecutionProps): UseSwapExecutionReturn {
  const { toast } = useToast();
  const { address } = useAccount();
  const updateSwap = useUpdateSwapAfterExecution();

  // Determine which token to check allowance for based on swap data
  const tokenAddressForAllowance = swapData?.swapParams?.tokenIn
    ? swapData.swapParams.tokenIn.toLowerCase() ===
      SWAP_CONSTANTS.USDC.toLowerCase()
      ? SWAP_CONSTANTS.USDC
      : SWAP_CONSTANTS.CNGN
    : SWAP_CONSTANTS.USDC; // Default to USDC

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddressForAllowance as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "allowance",
    args:
      address && SWAP_CONSTANTS.SWAP_ROUTER
        ? ([
            address as `0x${string}`,
            SWAP_CONSTANTS.SWAP_ROUTER as `0x${string}`,
          ] as const)
        : undefined,
    query: {
      enabled:
        !!address &&
        !!SWAP_CONSTANTS.SWAP_ROUTER &&
        step === "execute" &&
        !!swapData,
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
    writeContract: executeSwap,
    data: swapHash,
    isPending: isExecuting,
  } = useWriteContract();
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
      const parsedAmount = parseFloat(swapData.swapParams.amountIn);
      // Determine token address and decimals based on input token
      const isUSDC =
        swapData.swapParams.tokenIn.toLowerCase() ===
        SWAP_CONSTANTS.USDC.toLowerCase();
      const tokenAddress = isUSDC ? SWAP_CONSTANTS.USDC : SWAP_CONSTANTS.CNGN;
      const decimals = isUSDC
        ? SWAP_CONSTANTS.USDC_DECIMALS
        : SWAP_CONSTANTS.CNGN_DECIMALS;
      const tokenAmount = parseUnits(parsedAmount.toString(), decimals);

      approveToken({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [SWAP_CONSTANTS.SWAP_ROUTER as `0x${string}`, tokenAmount],
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
    if (!address || !swapData || !SWAP_CONSTANTS.SWAP_ROUTER) return;
    const amountIn = parseUnits(
      swapData.swapParams.amountIn,
      SWAP_CONSTANTS.USDC_DECIMALS,
    );
    const slippage = swapData.swapParams.slippage || 0.05;
    const estimatedCngn = parseFloat(swapData.swapParams.amountIn);
    const minAmount = estimatedCngn * (1 - slippage);
    const amountOutMin = parseUnits(
      minAmount.toString(),
      SWAP_CONSTANTS.CNGN_DECIMALS,
    );
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);

    try {
      executeSwap({
        address: SWAP_CONSTANTS.SWAP_ROUTER as `0x${string}`,
        abi: SWAP_ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: swapData.swapParams.tokenIn as `0x${string}`,
            tokenOut: swapData.swapParams.tokenOut as `0x${string}`,
            tickSpacing: 10,
            recipient: swapData.swapParams.recipient as `0x${string}`,
            deadline,
            amountIn,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: BigInt(0),
          },
        ],
      });
    } catch (error: any) {
      toast({
        title: "Swap Failed",
        description: error.message || "Failed to execute swap",
        variant: "destructive",
      });
    }
  };

  // Determine if approval is needed based on the input token
  const needsApproval =
    swapData &&
    allowance !== undefined &&
    (() => {
      const parsedAmount = parseFloat(swapData.swapParams.amountIn);
      const isUSDC =
        swapData.swapParams.tokenIn.toLowerCase() ===
        SWAP_CONSTANTS.USDC.toLowerCase();
      const decimals = isUSDC
        ? SWAP_CONSTANTS.USDC_DECIMALS
        : SWAP_CONSTANTS.CNGN_DECIMALS;
      const amountIn = parseUnits(parsedAmount.toString(), decimals);
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
