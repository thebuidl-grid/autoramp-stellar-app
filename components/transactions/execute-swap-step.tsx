"use client";

import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle } from "lucide-react";
import { SWAP_CONSTANTS } from "@/lib/constants/swap-constants";
import type { UseSwapExecutionReturn } from "@/lib/hooks/use-swap-execution";

interface ExecuteSwapStepProps {
  swapData: any;
  ngnEstimate?: { usdNgnRate?: number; estimatedNgn?: number };
  usdNgnRate?: number;
  swapExecution: UseSwapExecutionReturn;
}

export function ExecuteSwapStep({
  swapData,
  ngnEstimate,
  usdNgnRate,
  swapExecution,
}: ExecuteSwapStepProps) {
  const fromAmount = Number(swapData.swap.fromAmount);
  const fromToken = swapData.swap.fromTokenType || (swapData.swapParams?.tokenIn?.toLowerCase() === SWAP_CONSTANTS.USDC.toLowerCase() ? "USDC" : "CNGN");
  const toToken = swapData.swap.toTokenType || (swapData.swapParams?.tokenOut?.toLowerCase() === SWAP_CONSTANTS.USDC.toLowerCase() ? "USDC" : "CNGN");

  let displayAmount: number;
  let displayCurrency: string;
  let exchangeRateDisplay: React.ReactNode = null;

  if (swapData.swapParams?.tokenOut?.toLowerCase() === SWAP_CONSTANTS.CNGN.toLowerCase() && swapData.swapParams?.tokenIn?.toLowerCase() === SWAP_CONSTANTS.USDC.toLowerCase()) {
    const rate = ngnEstimate?.usdNgnRate || (swapData.swap.exchangeRate && swapData.swap.exchangeRate > 1 ? swapData.swap.exchangeRate : null);
    displayAmount = rate ? fromAmount * rate : (swapData.swap.toAmount ? Number(swapData.swap.toAmount) : 0);
    displayCurrency = "NGN";
    if (rate) {
      exchangeRateDisplay = (
        <div className="flex justify-between">
          <span className="text-white/70">Exchange Rate</span>
          <span className="text-white font-bold">1 USDC = {rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NGN</span>
        </div>
      );
    }
  } else {
    if (fromToken === "CNGN" && toToken === "USDC" && usdNgnRate) {
      displayAmount = fromAmount / usdNgnRate;
      displayCurrency = toToken;
      exchangeRateDisplay = (
        <div className="flex justify-between">
          <span className="text-white/70">Exchange Rate</span>
          <span className="text-white font-bold">1 CNGN = {(1 / usdNgnRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC</span>
        </div>
      );
    } else if (fromToken === "USDC" && toToken === "CNGN" && ngnEstimate?.usdNgnRate) {
      displayAmount = fromAmount * ngnEstimate.usdNgnRate;
      displayCurrency = toToken;
      exchangeRateDisplay = (
        <div className="flex justify-between">
          <span className="text-white/70">Exchange Rate</span>
          <span className="text-white font-bold">1 USDC = {ngnEstimate.usdNgnRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CNGN</span>
        </div>
      );
    } else {
      displayAmount = swapData.swap.toAmount ? Number(swapData.swap.toAmount) : fromAmount;
      displayCurrency = toToken;
      if (swapData.swap.exchangeRate) {
        exchangeRateDisplay = (
          <div className="flex justify-between">
            <span className="text-white/70">Exchange Rate</span>
            <span className="text-white font-bold">1 {fromToken} = {swapData.swap.exchangeRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {toToken}</span>
          </div>
        );
      }
    }
  }

  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl p-6 space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Execute Swap</h2>
        <p className="text-white/50">Complete your swap transaction</p>
      </div>

      <div className="space-y-4 p-4 bg-black/50 rounded-xl">
        <div className="flex justify-between">
          <span className="text-white/70">From</span>
          <span className="text-white font-bold">{fromAmount} {fromToken}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/70">To (estimated)</span>
          <span className="text-white font-bold">
            {displayCurrency === "USDC"
              ? displayAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : displayAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
            } {displayCurrency}
          </span>
        </div>
        {exchangeRateDisplay}
        <div className="flex justify-between">
          <span className="text-white/70">Recipient</span>
          <span className="text-white font-mono text-sm">{swapData.recipientAddress}</span>
        </div>
      </div>

      <Button
        onClick={swapExecution.handleExecuteSwap}
        className="w-full h-14"
        disabled={swapExecution.isApproving || swapExecution.isExecuting || swapExecution.isSwapSuccess}
      >
        {swapExecution.isApproving ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Approving token...
          </>
        ) : swapExecution.isExecuting ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Executing Swap...
          </>
        ) : swapExecution.isSwapSuccess ? (
          <>
            <CheckCircle className="w-5 h-5 mr-2" />
            Swap Successful!
          </>
        ) : (
          "Confirm Swap"
        )}
      </Button>

      {swapExecution.swapHash && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="text-green-400" size={20} />
            <span className="text-green-400 font-semibold">Transaction Submitted</span>
          </div>
          <code className="text-xs text-white/70 break-all">{swapExecution.swapHash}</code>
        </div>
      )}
    </div>
  );
}
