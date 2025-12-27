"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useBanks, useOffRamp, useEstimateNgn } from "@/lib/hooks";
import { ArrowUpRight, AlertCircle, CheckCircle, Copy, TrendingDown, Wallet, Zap, Sparkles } from "lucide-react";
import { copyToClipboard } from "@/lib/utils";
import { SearchableBankSelect } from "@/components/ui/searchable-bank-select";

export default function OffRampPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const { data: banks = [] } = useBanks();
  const offRamp = useOffRamp();
  
  const [step, setStep] = useState<"form" | "success">("form");
  const [transactionDetails, setTransactionDetails] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  
  const [formData, setFormData] = useState({
    amount: "",
    network: "base", // Always 'base', not shown to user
    bankCode: "",
    accountNumber: "",
  });
  
  // Calculate estimated NGN from CNGN amount
  const cngnAmount = formData.amount ? parseFloat(formData.amount) : null;
  const { data: ngnEstimate } = useEstimateNgn(cngnAmount);

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

    // Validate that we have estimated NGN value
    if (!ngnEstimate?.estimatedNgn) {
      toast({
        title: "Rate calculation in progress",
        description: "Please wait for the estimated NGN value to be calculated",
        variant: "destructive",
      });
      return;
    }

    // Use estimated NGN value (rounded to whole number)
    const amountToSend = Math.round(ngnEstimate.estimatedNgn);
    
    offRamp.mutate({
      network: formData.network,
      amount: amountToSend,
      destination: {
        bankCode: formData.bankCode,
        accountNumber: formData.accountNumber,
      },
    }, {
      onSuccess: (response) => {
        setTransactionDetails(response.data);
        setStep("success");
      },
    });
  };

  return (
    <div className="animate-fade-in">
      <Header 
        title="Sell Crypto"
        description="Convert cryptocurrency to NGN"
      />

      <div className="max-w-2xl mx-auto">
        {step === "form" ? (
          <div className="relative">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-3xl blur-2xl scale-110 -z-10" />
            
            <div className="relative p-8 md:p-10 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
              {/* Header */}
              <div className="mb-8">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs mb-6">
                  <Sparkles size={12} />
                  <span className="text-white/70">Instant conversion</span>
                </div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center">
                    <TrendingDown size={24} className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Sell Crypto</h1>
                    <p className="text-white/50">Convert cryptocurrency to NGN instantly</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Amount Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/70">Amount (CNGN)</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 font-medium">CNGN</div>
                    <input
                      type="number"
                      placeholder="100"
                      min="1"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full h-14 pl-16 pr-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all text-lg font-medium"
                    />
                  </div>
                </div>

                {/* Bank Select */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/70">Bank</label>
                  <SearchableBankSelect
                    banks={banks}
                    value={formData.bankCode}
                    onValueChange={(value) => setFormData({ ...formData, bankCode: value })}
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
                    onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value.replace(/\D/g, "") })}
                    className="w-full h-14 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all font-mono text-sm"
                  />
                </div>

                {/* Conversion Preview */}
                <div className="relative p-6 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl" />
                  <div className="relative">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-white/50">Estimated NGN</p>
                      <Zap size={16} className="text-white/50" />
                    </div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <p className="text-3xl font-bold text-white">
                        {ngnEstimate?.estimatedNgn 
                          ? `₦${Math.round(ngnEstimate.estimatedNgn).toLocaleString('en-NG')}`
                          : formData.amount 
                            ? `₦${Math.round(parseFloat(formData.amount)).toLocaleString('en-NG')}`
                            : "₦0"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white/40">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      <span>
                        {ngnEstimate 
                          ? `Based on current USD/NGN rate: ${ngnEstimate.usdNgnRate.toFixed(2)}`
                          : formData.amount
                            ? 'Calculating...'
                            : 'Enter amount to see estimate'}
                      </span>
                    </div>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-14 rounded-xl text-base font-semibold mt-2" 
                  isLoading={offRamp.isPending}
                >
                  Sell Crypto
                  <ArrowUpRight size={18} className="ml-2" />
                </Button>
              </form>
            </div>
          </div>
        ) : (
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
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Transaction Initiated</h1>
                    <p className="text-white/50">Your crypto sale has been initiated successfully</p>
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
                    <h3 className="font-semibold text-white">Transaction Details</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-3 border-b border-white/10">
                      <span className="text-sm text-white/50">Amount</span>
                      <span className="font-bold text-white">{formData.amount} CNGN</span>
                    </div>
                    
                    <div className="flex justify-between items-center py-3 border-b border-white/10">
                      <span className="text-sm text-white/50">You will receive</span>
                      <span className="font-bold text-white text-lg">₦{parseFloat(formData.amount).toLocaleString()}</span>
                    </div>
                    
                    <div className="flex justify-between items-center py-3 border-b border-white/10">
                      <span className="text-sm text-white/50">Network</span>
                      <span className="font-medium text-white capitalize">{formData.network}</span>
                    </div>
                    
                    {transactionDetails?.databaseRecord?.reference && (
                      <div className="flex justify-between items-center py-3 border-b border-white/10">
                        <span className="text-sm text-white/50">Reference</span>
                        <span className="font-mono text-sm font-medium text-white">{transactionDetails.databaseRecord.reference}</span>
                      </div>
                    )}
                    
                    {transactionDetails?.data?.transactionId && (
                      <div className="flex justify-between items-center py-3">
                        <span className="text-sm text-white/50">Transaction ID</span>
                        <span className="font-mono text-sm font-medium text-white">{transactionDetails.data.transactionId}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Deposit Address */}
                {transactionDetails?.data?.depositAddress && (
                  <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-2 mb-4">
                      <AlertCircle size={20} className="text-amber-400" />
                      <p className="text-sm font-semibold text-amber-400">Deposit Address</p>
                    </div>
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10 mb-3">
                      <code className="font-mono text-sm flex-1 break-all text-white">
                        {transactionDetails.data.depositAddress}
                      </code>
                      <button
                        onClick={async () => {
                          const success = await copyToClipboard(transactionDetails.data.depositAddress);
                          if (success) {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                            toast({
                              title: "Copied!",
                              description: "Deposit address copied to clipboard",
                              variant: "success",
                            });
                          }
                        }}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
                      >
                        {copied ? (
                          <CheckCircle size={18} className="text-green-400" />
                        ) : (
                          <Copy size={18} className="text-white/50" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-white/70 leading-relaxed">
                      Send your crypto to this address. Once confirmed, NGN will be sent to your bank account.
                    </p>
                  </div>
                )}

                {/* Next Steps */}
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
                  <p className="text-sm font-semibold text-white mb-3">Next Steps</p>
                  <ol className="text-sm text-white/70 space-y-2 list-decimal list-inside leading-relaxed">
                    <li>Send <span className="font-medium text-white">{formData.amount} CNGN</span> to the deposit address above</li>
                    <li>Wait for blockchain confirmation (usually takes a few minutes)</li>
                    <li>Once confirmed, NGN will be sent to your bank account</li>
                  </ol>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1 h-12 rounded-xl border-white/10 text-white hover:bg-white/10"
                    onClick={() => {
                      setStep("form");
                      setTransactionDetails(null);
                      setFormData({ ...formData, amount: "" });
                    }}
                  >
                    New Transaction
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
