"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { formatUnits, parseUnits, hexToBigInt } from "viem";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, ArrowLeft } from "lucide-react";
import { SWAP_CONSTANTS } from "@/lib/constants/swap-constants";
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

  const [quote, setQuote] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getSymbol = (address: string) => {
    if (address.toLowerCase() === SWAP_CONSTANTS.USDC.toLowerCase()) return "USDC";
    if (address.toLowerCase() === SWAP_CONSTANTS.CNGN.toLowerCase()) return "CNGN";
    if (address.toLowerCase() === SWAP_CONSTANTS.USDT.toLowerCase()) return "USDT";
    return "Token";
  };

  const sellSymbol = getSymbol(sellToken);
  const buySymbol = getSymbol(buyToken);

  // 1. Fetch Firm Quote
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
        console.error("Quote fetch error:", err);
        setError(err.response?.data?.description || "Failed to fetch firm quote");
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuote();
  }, [sellToken, buyToken, sellAmount, chainId, address]);

  // 2. Submit Transaction
  const { sendTransaction, data: hash, isPending: isSubmitting, error: txError } = useSendTransaction();
  const { isLoading: isWaitingForConfirmation, isSuccess } = useWaitForTransactionReceipt({ hash });

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

  const handlePlaceOrder = () => {
    if (!address) {
      openConnectModal?.();
      return;
    }
    if (!quote?.transaction) return;

    // Apply 15% gas buffer as recommended
    const gasEstimate = quote.transaction.gas ? safeBigInt(quote.transaction.gas) : undefined;
    const gasWithBuffer = gasEstimate ? (gasEstimate * 115n) / 100n : undefined;

    sendTransaction({
      to: quote.transaction.to as `0x${string}`,
      data: quote.transaction.data as `0x${string}`,
      value: quote.transaction.value ? hexToBigInt(quote.transaction.value) : undefined,
      gas: gasWithBuffer,
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-secondary" />
        <p className="text-white/70">Fetching firm quote and reserving liquidity...</p>
      </div>
    );
  }

  if (isSubmitting) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-secondary" />
        <p className="text-white font-semibold text-lg">Waiting for wallet confirmation...</p>
        <p className="text-white/50 text-sm">Please confirm the transaction in your wallet</p>
      </div>
    );
  }

  if (isWaitingForConfirmation) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-secondary" />
        <p className="text-white font-semibold text-lg">Transaction submitted</p>
        <p className="text-white/50 text-sm">Waiting for on-chain confirmation...</p>
        {hash && <p className="text-white/30 text-xs font-mono">{hash.slice(0, 10)}...{hash.slice(-8)}</p>}
      </div>
    );
  }

  if (error || txError) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
          <AlertTriangle className="text-red-500 w-5 h-5 flex-shrink-0" />
          <p className="text-red-500 text-sm">{error || txError?.message}</p>
        </div>
        <Button onClick={onBack} variant="outline" className="w-full border-white/10 text-white hover:bg-white/5">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  if (!quote) return null;

  const buyAmountFormatted = quote.buyAmount ? formatUnits(safeBigInt(quote.buyAmount), buyDecimals) : "0";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-2">Review Your Order</h2>
        <p className="text-white/50 text-sm">Firm quotes are valid for a limited time</p>
      </div>

      <div className="space-y-4 p-4 bg-black/50 rounded-2xl border border-white/10">
        <div className="flex justify-between">
          <span className="text-white/60 text-sm">You pay</span>
          <span className="text-white font-medium">{sellAmount} {sellSymbol}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/60 text-sm">You receive</span>
          <span className="text-white font-bold text-lg">
            {parseFloat(buyAmountFormatted).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {buySymbol}
          </span>
        </div>
        <div className="pt-4 border-t border-white/5 flex justify-between">
          <span className="text-white/60 text-sm">Slippage Tolerance</span>
          <span className="text-white/80 text-sm">0.5%</span>
        </div>
      </div>

      <div className="flex gap-3">
        <Button 
          onClick={onBack} 
          variant="outline" 
          className="flex-1 border-white/10 text-white hover:bg-white/5 h-14 rounded-xl"
          disabled={isSubmitting || isWaitingForConfirmation}
        >
          Cancel
        </Button>
        <Button
          onClick={handlePlaceOrder}
          className="flex-[2] bg-secondary text-black hover:bg-secondary/90 h-14 rounded-xl font-bold"
        >
          Place Order
        </Button>
      </div>
    </div>
  );
}
