"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useOnRamp } from "@/lib/hooks";
import { ArrowDownLeft, AlertCircle, Copy, CheckCircle, TrendingUp, Wallet, Zap, Sparkles } from "lucide-react";
import { copyToClipboard } from "@/lib/utils";

export default function OnRampPage() {
  const router = useRouter();
  const { toast } = useToast();
  const onRamp = useOnRamp();
  
  const [step, setStep] = useState<"form" | "payment">("form");
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  
  const [formData, setFormData] = useState({
    amount: "",
    network: "base", // Always 'base', not shown to user
    walletAddress: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.amount || !formData.walletAddress) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    onRamp.mutate({
      network: formData.network,
      amount: parseFloat(formData.amount),
      destination: {
        address: formData.walletAddress,
      },
    }, {
      onSuccess: (response) => {
        setPaymentDetails(response.data);
        setStep("payment");
      },
    });
  };

  const handleCopy = async (text: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied!",
        description: "Account details copied to clipboard",
        variant: "success",
      });
    }
  };

  return (
    <div className="animate-fade-in">
      <Header 
        title="Buy Crypto"
        description="Convert NGN to cryptocurrency"
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
                 
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Buy Crypto</h1>
                    <p className="text-white/50">Convert NGN to cryptocurrency instantly</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Amount Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/70">Amount (NGN)</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 font-medium">₦</div>
                    <input
                      type="number"
                      placeholder="10,000"
                      min="1000"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full h-14 pl-10 pr-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all text-lg font-medium"
                    />
                  </div>
                </div>

                {/* Wallet Address Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/70 flex items-center gap-2">
                    <Wallet size={16} />
                    Wallet Address
                  </label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={formData.walletAddress}
                    onChange={(e) => setFormData({ ...formData, walletAddress: e.target.value })}
                    className="w-full h-14 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all font-mono text-sm"
                  />
                </div>

                {/* Conversion Preview */}
                <div className="relative p-6 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl" />
                  <div className="relative">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-white/50">You will receive</p>
                      <Zap size={16} className="text-white/50" />
                    </div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <p className="text-3xl font-bold text-white">
                        {formData.amount ? `${(parseFloat(formData.amount) / 1600).toFixed(2)}` : "0.00"}
                      </p>
                      <span className="text-xl font-semibold text-white/70">CNGN</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white/40">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      <span>Rate: 1 CNGN ≈ 1 NGN</span>
                    </div>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-14 rounded-xl text-base font-semibold mt-2" 
                  isLoading={onRamp.isPending}
                >
                  Continue to Payment
                  <ArrowDownLeft size={18} className="ml-2" />
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
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Complete Payment</h1>
                    <p className="text-white/50">Transfer the exact amount to the account below</p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* Amount Display */}
                <div className="relative p-6 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl" />
                  <div className="relative">
                    <p className="text-sm text-white/50 mb-2">Amount to Pay</p>
                    <p className="text-4xl font-bold text-white">₦{parseFloat(formData.amount).toLocaleString()}</p>
                  </div>
                </div>

                {/* Payment Details */}
                {paymentDetails?.data?.depositAccount && (
                  <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                        <Wallet size={16} className="text-white/70" />
                      </div>
                      <h3 className="font-semibold text-white">Bank Account Details</h3>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex justify-between items-center py-3 border-b border-white/10">
                        <span className="text-sm text-white/50">Bank Name</span>
                        <span className="font-medium text-white">{paymentDetails.data.depositAccount.bankName}</span>
                      </div>
                      
                      <div className="flex justify-between items-center py-3 border-b border-white/10">
                        <span className="text-sm text-white/50">Account Number</span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-white text-lg">{paymentDetails.data.depositAccount.accountNumber}</span>
                          <button
                            onClick={() => handleCopy(paymentDetails.data.depositAccount.accountNumber)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                          >
                            {copied ? (
                              <CheckCircle size={18} className="text-green-400" />
                            ) : (
                              <Copy size={18} className="text-white/50" />
                            )}
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center py-3">
                        <span className="text-sm text-white/50">Account Name</span>
                        <span className="font-medium text-white">{paymentDetails.data.depositAccount.accountName}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Reference */}
                {paymentDetails?.data?.reference && (
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-white/50">Reference Code</span>
                      <span className="font-mono text-sm font-medium text-white">{paymentDetails.data.reference}</span>
                    </div>
                  </div>
                )}

                {/* Important Notice */}
                <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={20} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-400 mb-1">Important</p>
                      <p className="text-sm text-white/70 leading-relaxed">
                        Please transfer the exact amount shown above. Your cryptocurrency will be sent to your wallet once payment is confirmed.
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
                      setPaymentDetails(null);
                    }}
                  >
                    Start New
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
