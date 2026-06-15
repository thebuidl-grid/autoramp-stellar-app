"use client";

import { Loader2, CheckCircle, AlertCircle, Copy } from "lucide-react";
import { copyToClipboard } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useState } from "react";
import type { TabType } from "@/lib/hooks/use-transaction-form";

interface PendingStepProps {
  activeTab: TabType;
  reference?: string;
  wsConnected?: boolean;
  transactionData: any;
  buyAmount?: string;
  cryptoType?: "CNGN" | "USDC";
}

export function PendingStep({
  activeTab,
  reference,
  wsConnected,
  transactionData,
  buyAmount,
  cryptoType,
}: PendingStepProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl p-6 space-y-4">
      <div className="text-center mb-6">
        <Loader2 className="w-12 h-12 text-secondary animate-spin mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">
          {activeTab === "buy" ? "Waiting for Payment" : "Processing Transaction"}
        </h2>
        <p className="text-white/50">
          {activeTab === "buy" 
            ? "Please complete the bank transfer. We'll automatically detect your payment."
            : "Your transaction is being processed..."}
        </p>
      </div>

      {reference && (
        <div className="p-4 bg-black/50 rounded-xl">
          <p className="text-white/70 mb-2">Reference</p>
          <code className="text-sm text-white font-mono">{reference}</code>
          {wsConnected && (
            <p className="text-sm text-green-400 mt-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Connected for real-time updates
            </p>
          )}
        </div>
      )}

      {activeTab === "buy" && transactionData?.data?.depositAccount && (
        <>
          <div className="p-4 bg-black/50 rounded-xl">
            <p className="text-white/70 mb-2">Amount to Pay</p>
            <p className="text-3xl font-bold text-white">₦{parseFloat(buyAmount || "0").toLocaleString()}</p>
          </div>

          <div className="space-y-4 p-4 bg-black/50 rounded-xl">
            <div className="flex justify-between">
              <span className="text-white/70">Bank Name</span>
              <span className="text-white">{transactionData.data.depositAccount.bankName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/70">Account Number</span>
              <div className="flex items-center gap-2">
                <span className="text-white font-mono font-bold">{transactionData.data.depositAccount.accountNumber}</span>
                <button
                  onClick={async () => {
                    const success = await copyToClipboard(transactionData.data.depositAccount.accountNumber);
                    if (success) {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                      toast({ title: "Copied!", description: "Account number copied", variant: "success" });
                    }
                  }}
                  className="p-1 hover:bg-white/10 rounded"
                >
                  {copied ? <CheckCircle size={16} className="text-green-400" /> : <Copy size={16} className="text-white/50" />}
                </button>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-white/70">Account Name</span>
              <span className="text-white">{transactionData.data.depositAccount.accountName}</span>
            </div>
          </div>
        </>
      )}

      {activeTab === "sell" && cryptoType === "CNGN" && transactionData?.data?.depositAddress && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="text-amber-400" size={20} />
            <span className="text-amber-400 font-semibold">Deposit Address</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-xs text-white flex-1 break-all">{transactionData.data.depositAddress}</code>
            <button
              onClick={async () => {
                const success = await copyToClipboard(transactionData.data.depositAddress);
                if (success) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                  toast({ title: "Copied!", variant: "success" });
                }
              }}
              className="p-1 hover:bg-white/10 rounded"
            >
              {copied ? <CheckCircle size={16} className="text-green-400" /> : <Copy size={16} className="text-white/50" />}
            </button>
          </div>
          <p className="text-xs text-white/70 mt-2">Send your crypto to this address</p>
        </div>
      )}
    </div>
  );
}

