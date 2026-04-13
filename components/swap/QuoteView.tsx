"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { formatUnits, parseUnits, hexToBigInt, maxUint256 } from "viem";
import {
  useAccount,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
  useConfig,
} from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, ArrowLeft } from "lucide-react";
import { SWAP_CONSTANTS, ERC20_ABI } from "@/lib/constants/swap-constants";
import { safeBigInt } from "@/lib/utils";

interface QuoteViewProps {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  sellDecimals: number;
  buyDecimals: number;
  chainId: number;
  priceData: any;
  onBack: () => void;
  onSuccess: (hash: string) => void;
  onTxSubmitted?: (hash: string, buyAmount: string) => void;
}

export function QuoteView({
  sellToken,
  buyToken,
  sellAmount,
  sellDecimals,
  buyDecimals,
  chainId,
  priceData,
  onBack,
  onSuccess,
  onTxSubmitted,
}: QuoteViewProps) {
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const config = useConfig();

  const [quote, setQuote] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);

  const getSymbol = (addr: string) => {
    if (addr.toLowerCase() === SWAP_CONSTANTS.USDC.toLowerCase()) return "USDC";
    if (addr.toLowerCase() === SWAP_CONSTANTS.CNGN.toLowerCase()) return "CNGN";
    if (addr.toLowerCase() === SWAP_CONSTANTS.USDT.toLowerCase()) return "USDT";
    return "Token";
  };

  const sellSymbol = getSymbol(sellToken);
  const buySymbol = getSymbol(buyToken);

  // Fetch firm quote from allowance-holder endpoint
  useEffect(() => {
    const fetchQuote = async () => {
      if (!address || !sellToken || !buyToken || !sellAmount) return;
      setIsLoading(true);
      setError(null);
      try {
        const response = await axios.get("/api/swap/quote", {
          params: {
            sellToken,
            buyToken,
            sellAmount: parseUnits(sellAmount.replace(/,/g, ""), sellDecimals).toString(),
            taker: address,
            chainId,
            slippagePercentage: 0.05,
          },
        });
        setQuote(response.data);
      } catch (err: any) {
        setError(err.response?.data?.description || "Failed to fetch firm quote");
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuote();
  }, [sellToken, buyToken, sellAmount, chainId, address]);

  const { writeContractAsync } = useWriteContract();
  const {
    sendTransactionAsync,
    data: hash,
    isPending: isSubmitting,
  } = useSendTransaction();
  const {
    isLoading: isWaitingForConfirmation,
    isSuccess,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (hash && onTxSubmitted && quote) {
      const buyAmountFormatted = quote.buyAmount
        ? formatUnits(safeBigInt(quote.buyAmount), buyDecimals)
        : "0";
      onTxSubmitted(hash, buyAmountFormatted);
    }
  }, [hash]);

  useEffect(() => {
    if (isSuccess && hash) {
      onSuccess(hash);
    }
  }, [isSuccess, hash, onSuccess]);

  const [isApproving, setIsApproving] = useState(false);

  const handlePlaceOrder = async () => {
    if (!address) {
      openConnectModal?.();
      return;
    }
    if (!quote?.transaction) return;

    setError(null);

    try {
      // Step 1: Approve if needed (MaxUint256 — one-time per token, never needs repeating)
      if (quote.issues?.allowance) {
        const spender = quote.issues.allowance.spender as `0x${string}`;
        setIsApproving(true);
        setStatusText("Approving token... (1/2)");

        const approveHash = await writeContractAsync({
          address: sellToken as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [spender, maxUint256],
        });

        // Wait for approval to confirm on-chain before proceeding
        await waitForTransactionReceipt(config, { hash: approveHash });
        setIsApproving(false);
        setStatusText(null);
      }

      // Step 2: Execute swap
      setStatusText("Confirm the swap... (2/2)");
      const gasEstimate = quote.transaction.gas ? safeBigInt(quote.transaction.gas) : undefined;
      const gasWithBuffer = gasEstimate ? (gasEstimate * 115n) / 100n : undefined;

      await sendTransactionAsync({
        to: quote.transaction.to as `0x${string}`,
        data: quote.transaction.data as `0x${string}`,
        value: quote.transaction.value ? hexToBigInt(quote.transaction.value) : undefined,
        gas: gasWithBuffer,
      });

      setStatusText(null);
    } catch (err: any) {
      setIsApproving(false);
      setStatusText(null);
      // User rejected wallet prompt — don't show an error, just go back to review screen
      if (err?.message?.toLowerCase().includes("user rejected") ||
          err?.message?.toLowerCase().includes("user denied")) {
        return;
      }
      setError(err?.message || "Transaction failed");
    }
  };

  // ── Loading states ──────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-secondary" />
        <p className="text-white/70">Fetching firm quote...</p>
      </div>
    );
  }

  if (isApproving) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-secondary" />
        <p className="text-white font-semibold text-lg">Approving {sellSymbol}...</p>
        <p className="text-white/50 text-sm">Confirm in your wallet — this is a one-time approval</p>
      </div>
    );
  }

  if (isSubmitting) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-secondary" />
        <p className="text-white font-semibold text-lg">Confirm the swap in your wallet...</p>
      </div>
    );
  }

  if (isWaitingForConfirmation) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-secondary" />
        <p className="text-white font-semibold text-lg">Transaction submitted</p>
        <p className="text-white/50 text-sm">Waiting for on-chain confirmation...</p>
        {hash && (
          <p className="text-white/30 text-xs font-mono">
            {hash.slice(0, 10)}...{hash.slice(-8)}
          </p>
        )}
        <Button
          onClick={onBack}
          variant="outline"
          className="mt-4 border-white/10 text-white/50 hover:bg-white/5 text-xs"
        >
          Go back (transaction still processing)
        </Button>
      </div>
    );
  }

  if (isReceiptError || error) {
    const errMsg = receiptError?.message || error || "Transaction failed";
    return (
      <div className="space-y-4">
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
          <AlertTriangle className="text-red-500 w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-500 text-sm font-semibold mb-1">Transaction failed</p>
            <p className="text-red-400/80 text-xs">{errMsg}</p>
          </div>
        </div>
        <Button
          onClick={onBack}
          variant="outline"
          className="w-full border-white/10 text-white hover:bg-white/5"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  if (!quote) return null;

  const buyAmountFormatted = quote.buyAmount
    ? formatUnits(safeBigInt(quote.buyAmount), buyDecimals)
    : "0";

  const needsApproval = !!quote.issues?.allowance;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-2">Review Your Order</h2>
        <p className="text-white/50 text-sm">Firm quotes are valid for a limited time</p>
      </div>

      <div className="space-y-4 p-4 bg-black/50 rounded-2xl border border-white/10">
        <div className="flex justify-between">
          <span className="text-white/60 text-sm">You pay</span>
          <span className="text-white font-medium">
            {sellAmount} {sellSymbol}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/60 text-sm">You receive</span>
          <span className="text-white font-bold text-lg">
            {parseFloat(buyAmountFormatted).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 6,
            })}{" "}
            {buySymbol}
          </span>
        </div>
        <div className="pt-4 border-t border-white/5 flex justify-between">
          <span className="text-white/60 text-sm">Slippage Tolerance</span>
          <span className="text-white/80 text-sm">0.5%</span>
        </div>
        {needsApproval && (
          <div className="pt-2 border-t border-white/5 flex justify-between">
            <span className="text-white/60 text-sm">Steps</span>
            <span className="text-white/80 text-sm">Approve → Swap</span>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button
          onClick={onBack}
          variant="outline"
          className="flex-1 border-white/10 text-white hover:bg-white/5 h-14 rounded-xl"
        >
          Cancel
        </Button>
        <Button
          onClick={handlePlaceOrder}
          className="flex-[2] bg-secondary text-black hover:bg-secondary/90 h-14 rounded-xl font-bold"
        >
          {needsApproval ? `Approve & Swap` : "Place Order"}
        </Button>
      </div>
    </div>
  );
}
