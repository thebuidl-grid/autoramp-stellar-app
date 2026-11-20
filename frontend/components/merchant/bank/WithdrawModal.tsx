"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { SearchableBankSelect } from "@/components/ui/searchable-bank-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUpRight,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Mail,
} from "lucide-react";
import { authApi } from "@/lib/api";
import { merchantBankApi, SubAccount, BankListItem } from "@/lib/merchant";
import { useAuthStore } from "@/lib/store";
import { useNameEnquiry, useTransfer } from "@/lib/hooks/use-merchant-bank";

interface WithdrawModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subAccounts: SubAccount[];
  banks: BankListItem[];
}

type Step = "form" | "otp" | "success";

export function WithdrawModal({
  open,
  onOpenChange,
  subAccounts,
  banks,
}: WithdrawModalProps) {
  const { toast } = useToast();
  const { user } = useAuthStore();

  // ── form state ────────────────────────────────────────────────────────────
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [beneficiaryBankCode, setBeneficiaryBankCode] = useState("");
  const [beneficiaryAccountNumber, setBeneficiaryAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState("");
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");

  // ── OTP state ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("form");
  const [otpCode, setOtpCode] = useState("");
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  const nameEnquiry = useNameEnquiry();
  const transfer = useTransfer();

  // Auto name enquiry when account number is 10 digits and bank selected
  useEffect(() => {
    setResolvedName("");
    if (beneficiaryAccountNumber.length === 10 && beneficiaryBankCode) {
      nameEnquiry.mutate(
        { bankCode: beneficiaryBankCode, accountNumber: beneficiaryAccountNumber },
        {
          onSuccess: (res) => setResolvedName(res.data?.data?.accountName || ""),
          onError: () => setResolvedName(""),
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beneficiaryAccountNumber, beneficiaryBankCode]);

  const sourceAccount = subAccounts.find((s) => s.id === sourceAccountId);

  const isFormValid =
    sourceAccountId &&
    beneficiaryBankCode &&
    beneficiaryAccountNumber.length === 10 &&
    resolvedName &&
    Number(amount) > 0 &&
    narration.trim();

  // ── Step 1: send OTP ─────────────────────────────────────────────────────
  const handleRequestOtp = async () => {
    if (!user?.email) {
      toast({ title: "No email found", description: "Please log in again.", variant: "destructive" });
      return;
    }
    setIsSendingOtp(true);
    try {
      await authApi.sendOtp({ email: user.email, purpose: "TRANSACTION_AUTH" });
      setStep("otp");
      toast({
        title: "OTP sent",
        description: `A verification code was sent to ${user.email}`,
        variant: "success",
      });
    } catch (err: any) {
      toast({
        title: "Failed to send OTP",
        description: err?.response?.data?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSendingOtp(false);
    }
  };

  // ── Step 2: verify OTP then execute transfer ──────────────────────────────
  const handleConfirmTransfer = async () => {
    if (!user?.email || otpCode.length !== 6) return;

    try {
      // Verify OTP first
      await authApi.verifyOtp({
        email: user.email,
        code: otpCode,
        purpose: "TRANSACTION_AUTH",
      });
    } catch (err: any) {
      toast({
        title: "Invalid OTP",
        description: err?.response?.data?.message || "The code is incorrect or expired",
        variant: "destructive",
      });
      return;
    }

    // OTP valid — execute the transfer
    transfer.mutate(
      {
        beneficiaryBankCode,
        beneficiaryAccountNumber,
        amount: Number(amount),
        narration: narration.trim(),
        paymentReference: `WD-${Date.now()}`,
        debitAccountNumber: sourceAccount?.accountNumber,
      },
      {
        onSuccess: () => {
          setStep("success");
        },
        onError: (err: any) => {
          toast({
            title: "Transfer failed",
            description: err?.response?.data?.message || "Something went wrong",
            variant: "destructive",
          });
        },
      },
    );
  };

  // ── Reset on close ────────────────────────────────────────────────────────
  const handleClose = () => {
    if (transfer.isPending || isSendingOtp) return;
    onOpenChange(false);
    setTimeout(() => {
      setStep("form");
      setSourceAccountId("");
      setBeneficiaryBankCode("");
      setBeneficiaryAccountNumber("");
      setResolvedName("");
      setAmount("");
      setNarration("");
      setOtpCode("");
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-black/90 backdrop-blur-xl border-white/10 text-white max-w-md w-[calc(100%-2rem)]">
        {/* ── FORM STEP ─────────────────────────────────────────────────── */}
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <ArrowUpRight className="w-5 h-5 text-primary" />
                Withdraw Funds
              </DialogTitle>
              <DialogDescription className="text-zinc-400">
                Transfer funds from your account to any bank account.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Source account */}
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">From account</Label>
                <Select value={sourceAccountId} onValueChange={setSourceAccountId}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="Select sub-account" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-white/10">
                    {subAccounts.map((sa) => (
                      <SelectItem key={sa.id} value={sa.id}>
                        <span className="font-mono text-xs mr-2">{sa.accountNumber}</span>
                        <span className="text-zinc-400 text-xs">{sa.bankName}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Beneficiary bank */}
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">Beneficiary bank</Label>
                <SearchableBankSelect
                  banks={banks}
                  value={beneficiaryBankCode}
                  onValueChange={setBeneficiaryBankCode}
                  placeholder="Select bank"
                />
              </div>

              {/* Beneficiary account number */}
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">Account number</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  value={beneficiaryAccountNumber}
                  onChange={(e) =>
                    setBeneficiaryAccountNumber(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="0000000000"
                  className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 font-mono"
                />
                {/* Resolved name */}
                {nameEnquiry.isPending && (
                  <p className="text-xs text-zinc-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Resolving…
                  </p>
                )}
                {resolvedName && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {resolvedName}
                  </p>
                )}
                {nameEnquiry.isError && beneficiaryAccountNumber.length === 10 && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Account not found
                  </p>
                )}
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">Amount (NGN)</Label>
                <Input
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600"
                />
              </div>

              {/* Narration */}
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">Narration</Label>
                <Input
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder="Payment description"
                  maxLength={100}
                  className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="text-zinc-400 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleRequestOtp}
                disabled={!isFormValid || isSendingOtp}
                className="bg-primary text-black hover:bg-primary/90"
              >
                {isSendingOtp ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4 mr-2" />
                )}
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── OTP STEP ──────────────────────────────────────────────────── */}
        {step === "otp" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Mail className="w-5 h-5 text-primary" />
                Confirm Transfer
              </DialogTitle>
              <DialogDescription className="text-zinc-400">
                Enter the 6-digit code sent to{" "}
                <span className="text-white font-medium">{user?.email}</span> to
                authorise this transfer.
              </DialogDescription>
            </DialogHeader>

            {/* Summary */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2 text-sm">
              <div className="flex justify-between text-zinc-400">
                <span>To</span>
                <span className="text-white font-medium">{resolvedName}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Account</span>
                <span className="text-white font-mono">{beneficiaryAccountNumber}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Amount</span>
                <span className="text-white font-semibold">
                  ₦{Number(amount).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>From</span>
                <span className="text-white font-mono text-xs">
                  {sourceAccount?.accountNumber}
                </span>
              </div>
            </div>

            {/* OTP inputs */}
            <div className="flex gap-2 justify-between py-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <input
                  key={i}
                  id={`withdraw-otp-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={otpCode[i] || ""}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    if (val.length <= 1) {
                      const arr = otpCode.split("");
                      arr[i] = val;
                      setOtpCode(arr.join("").slice(0, 6));
                      if (val && i < 5) {
                        document.getElementById(`withdraw-otp-${i + 1}`)?.focus();
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !otpCode[i] && i > 0) {
                      document.getElementById(`withdraw-otp-${i - 1}`)?.focus();
                    }
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                    setOtpCode(pasted);
                    if (pasted.length === 6) {
                      document.getElementById(`withdraw-otp-5`)?.focus();
                    }
                  }}
                  disabled={transfer.isPending}
                  className="w-12 h-14 text-center text-2xl font-mono bg-white/5 border border-white/10 focus:border-primary focus:outline-none rounded-lg text-white disabled:opacity-50"
                />
              ))}
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setStep("form"); setOtpCode(""); }}
                disabled={transfer.isPending}
                className="text-zinc-400 hover:text-white"
              >
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmTransfer}
                disabled={otpCode.length !== 6 || transfer.isPending}
                className="bg-primary text-black hover:bg-primary/90"
              >
                {transfer.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4 mr-2" />
                )}
                Confirm & Send
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── SUCCESS STEP ──────────────────────────────────────────────── */}
        {step === "success" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                Transfer Initiated
              </DialogTitle>
              <DialogDescription className="text-zinc-400">
                Your withdrawal is being processed.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 space-y-2 text-sm">
              <div className="flex justify-between text-zinc-400">
                <span>To</span>
                <span className="text-white font-medium">{resolvedName}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Account</span>
                <span className="text-white font-mono">{beneficiaryAccountNumber}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Amount</span>
                <span className="text-emerald-400 font-semibold text-base">
                  ₦{Number(amount).toLocaleString()}
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button
                size="sm"
                onClick={handleClose}
                className="w-full bg-primary text-black hover:bg-primary/90"
              >
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
