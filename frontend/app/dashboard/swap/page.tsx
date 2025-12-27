"use client";

/**
 * Swap Page
 *
 * Allows users to swap USDC to CNGN and then offramp to Naira
 * Uses RainbowKit for wallet connection and executes swap on-chain
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  useInitializeSwap,
  useUpdateSwapAfterExecution,
} from "@/lib/hooks/use-swap";
import { useSwapWebSocket } from "@/lib/hooks/use-swap-websocket";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  SWAP_CONSTANTS,
  SWAP_ROUTER_ABI,
  ERC20_ABI,
} from "@/lib/constants/swap-constants";
import { parseUnits, formatUnits, maxUint256 } from "viem";
import {
  ArrowUpRight,
  AlertCircle,
  CheckCircle,
  Wallet,
  TrendingUp,
  Loader2,
  Sparkles,
  Zap,
} from "lucide-react";
import { useBanks, useEstimateNgn } from "@/lib/hooks";
import { copyToClipboard } from "@/lib/utils";
import { SearchableBankSelect } from "@/components/ui/searchable-bank-select";
import { Skeleton } from "@/components/ui/skeleton";

interface SwapState {
  amount: string;
  slippage: string;
  network: string;
  bankCode: string;
  accountNumber: string;
}

export default function SwapPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  const initializeSwap = useInitializeSwap();
  const updateSwap = useUpdateSwapAfterExecution();

  const [step, setStep] = useState<
    "form" | "execute" | "pending" | "completed"
  >("form");
  const [swapData, setSwapData] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState<SwapState>({
    amount: "",
    slippage: "0.05",
    network: "base", // Always 'base', not shown to user
    bankCode: "",
    accountNumber: "",
  });

  const { data: banks = [] } = useBanks();

  // Calculate estimated NGN when we have CNGN amount
  const estimatedCngn = swapData?.swap?.toAmount
    ? Number(swapData.swap.toAmount)
    : formData.amount
    ? parseFloat(formData.amount)
    : null;
  const { data: ngnEstimate } = useEstimateNgn(estimatedCngn);

  // WebSocket connection for real-time updates
  // Use useCallback to stabilize the onUpdate callback and prevent WebSocket reconnection loops
  const handleWebSocketUpdate = useCallback((update: any) => {
    console.log("WebSocket update received:", update);
    if (update.status === "COMPLETED") {
      setStep("completed");
      toast({
        title: "Transaction Completed",
        description:
          "Your swap and offramp transaction has been completed successfully!",
        variant: "default",
      });
    }
  }, [setStep, toast]); // setStep is stable from useState, toast should be stable from useToast hook
  
  const { isConnected: wsConnected, lastUpdate } = useSwapWebSocket({
    reference: swapData?.swap?.reference,
    token:
      typeof window !== "undefined"
        ? localStorage.getItem("token") || undefined
        : undefined,
    enabled: !!swapData?.swap?.reference && step === "pending",
    onUpdate: handleWebSocketUpdate,
  });

  // Check allowance for USDC
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: SWAP_CONSTANTS.USDC as `0x${string}`,
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
      enabled: !!address && !!SWAP_CONSTANTS.SWAP_ROUTER && step === "execute",
    },
  });

  // Approve USDC
  const {
    writeContract: approveToken,
    data: approveHash,
    isPending: isApproving,
  } = useWriteContract();
  const { isLoading: isWaitingApproval, isSuccess: isApproved } =
    useWaitForTransactionReceipt({
      hash: approveHash,
    });

  // Execute swap
  const {
    writeContract: executeSwap,
    data: swapHash,
    isPending: isExecuting,
  } = useWriteContract();
  const { isLoading: isWaitingSwap, isSuccess: isSwapSuccess } =
    useWaitForTransactionReceipt({
      hash: swapHash,
    });

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.amount || !formData.bankCode || !formData.accountNumber) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (!address) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to continue",
        variant: "destructive",
      });
      return;
    }

    // Validate that we have estimated NGN value
    if (!ngnEstimate?.estimatedNgn) {
      toast({
        title: "Rate calculation in progress",
        description: "Please wait for the estimated NGN value to be calculated",
        variant: "destructive",
      });
      return;
    }

    const usdcAmount = parseFloat(formData.amount);
    if (isNaN(usdcAmount) || usdcAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Amount must be greater than 0",
        variant: "destructive",
      });
      return;
    }

    // Use estimated NGN value for offramp (backend expects NGN amount)
    const ngnAmount = Math.round(ngnEstimate.estimatedNgn);

    initializeSwap.mutate(
      {
        amount: ngnAmount, // NGN amount for offramp
        usdcAmount: usdcAmount, // USDC amount for swap
        slippage: parseFloat(formData.slippage || "0.05"),
        network: formData.network,
        offrampDestination: {
          bankCode: formData.bankCode,
          accountNumber: formData.accountNumber,
        },
      },
      {
        onSuccess: (response) => {
          // axios returns { data: SwapResponse }
          setSwapData(response.data);
          setStep("execute");
          toast({
            title: "Swap Initialized",
            description: "Please execute the swap transaction from your wallet",
            variant: "default",
          });
        },
        onError: (error: any) => {
          toast({
            title: "Initialization Failed",
            description:
              error.response?.data?.message || "Failed to initialize swap",
            variant: "destructive",
          });
        },
      }
    );
  };

  // Handle approval
  const handleApprove = async () => {
    if (!swapData || !address) return;

    try {
      // Approve the specific USDC amount needed for the swap
      const usdcAmount = parseUnits(
        swapData.swapParams.amountIn,
        SWAP_CONSTANTS.USDC_DECIMALS
      );
      approveToken({
        address: SWAP_CONSTANTS.USDC as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [SWAP_CONSTANTS.SWAP_ROUTER as `0x${string}`, usdcAmount],
      });
    } catch (error: any) {
      toast({
        title: "Approval Failed",
        description: error.message || "Failed to approve USDC",
        variant: "destructive",
      });
    }
  };

  // Handle swap execution
  const handleExecuteSwap = async () => {
    if (!address || !swapData || !SWAP_CONSTANTS.SWAP_ROUTER) return;

    const amountIn = parseUnits(
      swapData.swapParams.amountIn,
      SWAP_CONSTANTS.USDC_DECIMALS
    );
    
    // Calculate minimum amount out based on slippage tolerance
    // If amountOutMinimum is not provided, estimate it from the USDC amount
    // Using a simple 1:1 approximation with slippage applied
    const slippage = swapData.swapParams.slippage || 0.05;
    let amountOutMin: bigint;
    
    if (swapData.swapParams.amountOutMinimum) {
      amountOutMin = parseUnits(
        swapData.swapParams.amountOutMinimum,
        SWAP_CONSTANTS.CNGN_DECIMALS
      );
    } else {
      // Estimate: 1 USDC ≈ 1 CNGN (approximate), apply slippage
      const estimatedCngn = parseFloat(swapData.swapParams.amountIn);
      const minAmount = estimatedCngn * (1 - slippage);
      amountOutMin = parseUnits(
        minAmount.toString(),
        SWAP_CONSTANTS.CNGN_DECIMALS
      );
    }
    
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 120); // 2 minutes

    // Get tick spacing - for now use 10 (should match backend)
    const tickSpacing = 10;

    try {
      executeSwap({
        address: SWAP_CONSTANTS.SWAP_ROUTER as `0x${string}`,
        abi: SWAP_ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: swapData.swapParams.tokenIn as `0x${string}`,
            tokenOut: swapData.swapParams.tokenOut as `0x${string}`,
            tickSpacing,
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

  // Update swap after successful execution (only once)
  // This sends the transaction hash to the backend, then we wait for WebSocket notification for completion
  const hasUpdatedSwap = useRef(false);
  useEffect(() => {
    // Only update if swap succeeded, we have all required data, haven't updated yet, and we're still in execute step
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
          data: {
            transactionHash: swapHash,
            sourceAddress: address,
          },
        },
        {
          onSuccess: () => {
            // Move to pending step - WebSocket will notify us when offramp completes
            setStep("pending");
          },
          onError: (error: any) => {
            // Reset flag on error so user can retry
            hasUpdatedSwap.current = false;
            console.error("Failed to update swap after execution:", error);
          },
        }
      );
    }
  }, [isSwapSuccess, swapHash, swapData, address, step]);
  
  // Reset the flag when swapHash changes (new swap initiated)
  useEffect(() => {
    hasUpdatedSwap.current = false;
  }, [swapHash]);

  // Refetch allowance after approval
  useEffect(() => {
    if (isApproved) {
      refetchAllowance();
    }
  }, [isApproved, refetchAllowance]);

  const needsApproval =
    swapData &&
    allowance !== undefined &&
    parseUnits(swapData.swapParams.amountIn, SWAP_CONSTANTS.USDC_DECIMALS) >
      allowance;

  return (
    <div className="animate-fade-in">
      <Header
        title="Swap"
        description="Swap USDC to CNGN and automatically offramp to your bank account"
      />

      <div className="max-w-2xl mx-auto">
        {step === "form" && (
          <div className="relative">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-3xl blur-2xl scale-110 -z-10" />

            <div className="relative p-8 md:p-10 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
              {/* Header */}
              <div className="mb-8">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs mb-6">
                  <Sparkles size={12} />
                  <span className="text-white/70">Instant swap & offramp</span>
                </div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center">
                    <TrendingUp size={24} className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-1">
                      Swap USDC to NGN
                    </h1>
                    <p className="text-white/50">
                      Convert USDC and receive NGN in your bank
                    </p>
                  </div>
                </div>

                {/* Wallet Connection Button */}
                <div className="mt-6 flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-3">
                    <Wallet size={20} className="text-white/70" />
                    <div>
                      <p className="text-sm font-medium text-white">
                        Wallet Connection
                      </p>
                      <p className="text-xs text-white/50">
                        {isConnected
                          ? `Connected: ${address?.slice(
                              0,
                              6
                            )}...${address?.slice(-4)}`
                          : "Connect your wallet to continue"}
                      </p>
                    </div>
                  </div>
                  <ConnectButton />
                </div>
              </div>

              {!isConnected ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-16 h-16 text-white/30 mx-auto mb-4" />
                  <p className="text-white/70 mb-6">
                    Please connect your wallet to start swapping
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Amount Input */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/70">
                      Amount (USDC)
                    </label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 font-medium">
                        USDC
                      </div>
                      <input
                        type="number"
                        step="0.000001"
                        placeholder="100"
                        min="1"
                        value={formData.amount}
                        onChange={(e) =>
                          setFormData({ ...formData, amount: e.target.value })
                        }
                        className="w-full h-14 pl-16 pr-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all text-lg font-medium"
                        required
                      />
                    </div>
                  </div>

                  {/* Slippage Tolerance */}
                  {/* <div className="space-y-2">
                    <label className="text-sm font-medium text-white/70">
                      Slippage Tolerance
                    </label>
                    <div className="relative">
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 font-medium">
                        %
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.05"
                        value={formData.slippage}
                        onChange={(e) =>
                          setFormData({ ...formData, slippage: e.target.value })
                        }
                        className="w-full h-14 pr-12 pl-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                      />
                    </div>
                    <p className="text-xs text-white/50">
                      {parseFloat(formData.slippage || "0.05") * 100}% slippage
                      tolerance
                    </p>
                  </div> */}

                  {/* Bank Select */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/70">
                      Bank
                    </label>
                    <SearchableBankSelect
                      banks={banks}
                      value={formData.bankCode}
                      onValueChange={(value) =>
                        setFormData({ ...formData, bankCode: value })
                      }
                      placeholder="Select a bank"
                      required
                    />
                  </div>

                  {/* Account Number Input */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/70 flex items-center gap-2">
                      <Wallet size={16} />
                      Account Number
                    </label>
                    <input
                      type="text"
                      placeholder="0123456789"
                      maxLength={10}
                      value={formData.accountNumber}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          accountNumber: e.target.value.replace(/\D/g, ""),
                        })
                      }
                      className="w-full h-14 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all font-mono text-sm"
                      required
                    />
                  </div>

                  {/* Conversion Preview */}
                  {formData.amount && parseFloat(formData.amount) > 0 && (
                    <div className="relative p-6 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl" />
                      <div className="relative">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm text-white/50">Estimated NGN</p>
                          <Zap size={16} className="text-white/50" />
                        </div>
                        <div className="flex items-baseline gap-2 mb-2">
                          {ngnEstimate?.estimatedNgn ? (
                            <p className="text-3xl font-bold text-white">
                              ₦
                              {Math.round(
                                ngnEstimate.estimatedNgn
                              ).toLocaleString("en-NG")}
                            </p>
                          ) : (
                            <Skeleton className="h-9 w-40" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-white/40">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                          {ngnEstimate ? (
                            <span>
                              Based on current USD/NGN rate:{" "}
                              {ngnEstimate.usdNgnRate.toFixed(2)}
                            </span>
                          ) : (
                            <Skeleton className="h-4 w-48" />
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-14 rounded-xl text-base font-semibold mt-2"
                    isLoading={initializeSwap.isPending}
                  >
                    Initialize Swap
                    <ArrowUpRight size={18} className="ml-2" />
                  </Button>
                </form>
              )}
            </div>
          </div>
        )}

        {isConnected && step === "execute" && swapData && (
          <div className="relative">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-3xl blur-2xl scale-110 -z-10" />

            <div className="relative p-8 md:p-10 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
              {/* Header */}
              <div className="mb-8">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center">
                    <TrendingUp size={24} className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-1">
                      Execute Swap
                    </h1>
                    <p className="text-white/50">
                      Complete your swap transaction on-chain
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* Transaction Summary */}
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <Wallet size={16} className="text-white/70" />
                    </div>
                    <h3 className="font-semibold text-white">Swap Details</h3>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-3 border-b border-white/10">
                      <span className="text-sm text-white/50">From</span>
                      <span className="font-bold text-white">
                        {Number(swapData.swap.fromAmount)} USDC
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-3 border-b border-white/10">
                      <span className="text-sm text-white/50">
                        To (estimated)
                      </span>
                      <span className="font-bold text-white text-lg">
                        {estimatedCngn ? estimatedCngn.toFixed(6) : '0.000000'} CNGN
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-3 border-b border-white/10">
                      <span className="text-sm text-white/50">
                        Exchange Rate
                      </span>
                      {ngnEstimate?.estimatedNgn ? (
                        <span className="font-medium text-white">
                          1 USDC = ₦
                          {Math.round(ngnEstimate?.estimatedNgn).toLocaleString(
                            "en-NG"
                          )}
                        </span>
                      ) : (
                        <Skeleton className="h-9 w-40" />
                      )}
                    </div>

                    <div className="flex justify-between items-center py-3 border-b border-white/10">
                      <span className="text-sm text-white/50">Recipient</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-white max-w-[200px] truncate">
                          {swapData.recipientAddress}
                        </span>
                        <button
                          onClick={async () => {
                            const success = await copyToClipboard(
                              swapData.recipientAddress
                            );
                            if (success) {
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                              toast({
                                title: "Copied!",
                                description:
                                  "Recipient address copied to clipboard",
                                variant: "success",
                              });
                            }
                          }}
                          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                        >
                          {copied ? (
                            <CheckCircle size={16} className="text-green-400" />
                          ) : (
                            <Wallet size={16} className="text-white/50" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-between items-center py-3">
                      <span className="text-sm text-white/50">Reference</span>
                      <span className="font-mono text-sm font-medium text-white">
                        {swapData.swap.reference}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Approval/Execute Buttons */}
                {needsApproval && !isApproved && (
                  <Button
                    onClick={handleApprove}
                    className="w-full h-14 rounded-xl text-base font-semibold"
                    disabled={isApproving || isWaitingApproval}
                  >
                    {isApproving || isWaitingApproval ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Approving USDC...
                      </>
                    ) : (
                      <>
                        Approve USDC
                        <ArrowUpRight size={18} className="ml-2" />
                      </>
                    )}
                  </Button>
                )}

                {(!needsApproval || isApproved) && (
                  <Button
                    onClick={handleExecuteSwap}
                    className="w-full h-14 rounded-xl text-base font-semibold"
                    disabled={isExecuting || isWaitingSwap}
                  >
                    {isExecuting || isWaitingSwap ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Executing Swap...
                      </>
                    ) : (
                      <>
                        Execute Swap
                        <ArrowUpRight size={18} className="ml-2" />
                      </>
                    )}
                  </Button>
                )}

                {swapHash && (
                  <div className="p-6 rounded-2xl bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle size={20} className="text-green-400" />
                      <p className="text-sm font-semibold text-green-400">
                        Transaction Submitted
                      </p>
                    </div>
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
                      <code className="font-mono text-sm flex-1 break-all text-white">
                        {swapHash}
                      </code>
                      <button
                        onClick={async () => {
                          const success = await copyToClipboard(swapHash);
                          if (success) {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                            toast({
                              title: "Copied!",
                              description:
                                "Transaction hash copied to clipboard",
                              variant: "success",
                            });
                          }
                        }}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
                      >
                        {copied ? (
                          <CheckCircle size={18} className="text-green-400" />
                        ) : (
                          <Wallet size={18} className="text-white/50" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {step === "pending" && swapData && (
          <div className="relative">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-3xl blur-2xl scale-110 -z-10" />

            <div className="relative p-8 md:p-10 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
              {/* Header */}
              <div className="mb-8">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                    <Loader2 size={24} className="text-blue-400 animate-spin" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-1">
                      Processing Transaction
                    </h1>
                    <p className="text-white/50">
                      Your swap has been executed. Waiting for offramp
                      completion...
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* Transaction Info */}
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <Wallet size={16} className="text-white/70" />
                    </div>
                    <h3 className="font-semibold text-white">
                      Transaction Reference
                    </h3>
                  </div>
                  <p className="font-mono text-sm text-white mb-2">
                    {swapData.swap.reference}
                  </p>
                  {wsConnected && (
                    <p className="text-sm text-green-400 flex items-center gap-2 mt-3">
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      Connected for real-time updates
                    </p>
                  )}
                </div>

                {/* Info Box */}
                <div className="p-5 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={20} className="text-blue-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-blue-400 mb-2">
                        Transaction in Progress
                      </p>
                      <p className="text-sm text-white/70 leading-relaxed">
                        Your swap transaction has been submitted to the
                        blockchain. Once the offramp is completed, you will
                        receive NGN in your bank account.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === "completed" && swapData && (
          <div className="relative">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-3xl blur-2xl scale-110 -z-10" />

            <div className="relative p-8 md:p-10 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
              {/* Header */}
              <div className="mb-8">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-500/10 border border-green-500/20 flex items-center justify-center">
                    <CheckCircle size={24} className="text-green-400" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-1">
                      Transaction Completed
                    </h1>
                    <p className="text-white/50">
                      Your swap and offramp transaction has been completed
                      successfully
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* Transaction Summary */}
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <CheckCircle size={16} className="text-green-400" />
                    </div>
                    <h3 className="font-semibold text-white">
                      Transaction Details
                    </h3>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-3 border-b border-white/10">
                      <span className="text-sm text-white/50">Reference</span>
                      <span className="font-mono text-sm font-medium text-white">
                        {swapData.swap.reference}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-3 border-b border-white/10">
                      <span className="text-sm text-white/50">
                        Amount Swapped
                      </span>
                      <span className="font-bold text-white">
                        {Number(swapData.swap.fromAmount)} USDC
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-3">
                      <span className="text-sm text-white/50">
                        CNGN Received
                      </span>
                      <span className="font-bold text-white text-lg">
                      {ngnEstimate?.estimatedNgn ? Math.round(ngnEstimate.estimatedNgn).toLocaleString(
                            "en-NG"
                          ) : '0'} NGN
                      </span>
                    </div>
                  </div>
                </div>

                {/* Success Message */}
                <div className="p-5 rounded-2xl bg-green-500/10 border border-green-500/20">
                  <div className="flex items-start gap-3">
                    <CheckCircle size={20} className="text-green-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-green-400 mb-2">
                        Transaction Successful
                      </p>
                      <p className="text-sm text-white/70 leading-relaxed">
                        Your swap has been completed and NGN will be sent to
                        your bank account shortly.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1 h-12 rounded-xl border-white/10 text-white hover:bg-white/10"
                    onClick={() => {
                      setStep("form");
                      setSwapData(null);
                      setFormData({
                        amount: "",
                        slippage: "0.05",
                        network: "base",
                        bankCode: "",
                        accountNumber: "",
                      });
                    }}
                  >
                    New Swap
                  </Button>
                  <Button
                    className="flex-1 h-12 rounded-xl font-semibold"
                    onClick={() => router.push("/dashboard")}
                  >
                    View Dashboard
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
