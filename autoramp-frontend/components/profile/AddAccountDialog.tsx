"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableBankSelect } from "@/components/ui/searchable-bank-select";
import { useInitiateAddAccount, useVerifyAndAddAccount } from "@/lib/hooks/use-saved-accounts";
import { useBanks } from "@/lib/hooks";
import { useAccountResolution } from "@/lib/hooks/use-account-resolution";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface AddAccountDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AddAccountDialog({ open, onOpenChange }: AddAccountDialogProps) {
    const { toast } = useToast();
    const { data: banks = [] } = useBanks();
    const initiateAddAccount = useInitiateAddAccount();
    const verifyAndAddAccount = useVerifyAndAddAccount();

    const { user } = useAuthStore();
    const [step, setStep] = useState<"input" | "verify">("input");
    const [bankCode, setBankCode] = useState("");
    const [accountNumber, setAccountNumber] = useState("");
    const [otpCode, setOtpCode] = useState("");
    const [savedBankName, setSavedBankName] = useState("");

    // Live account resolution
    const { accountName: resolvedName, accountResolved, resolveAccount } = useAccountResolution({
        activeTab: "sell",
        bankCode,
        accountNumber,
    });

    const handleInitiate = async () => {
        if (!bankCode || !accountNumber || !user?.email) {
            toast({
                title: "Missing fields",
                description: "Please ensure you are logged in, select a bank and enter account number",
                variant: "destructive",
            });
            return;
        }

        if (accountNumber.length !== 10) {
            toast({
                title: "Invalid account number",
                description: "Account number must be 10 digits",
                variant: "destructive",
            });
            return;
        }

        initiateAddAccount.mutate(
            { email: user.email },
            {
                onSuccess: () => {
                    setStep("verify");
                    toast({
                        title: "OTP Sent",
                        description: `Check your email for verification code. Account: ${resolvedName}`,
                    });
                },
                onError: (error) => {
                    toast({
                        title: "Error",
                        description: getErrorMessage(error),
                        variant: "destructive",
                    });
                },
            }
        );
    };

    const handleVerifyAndAdd = async () => {
        if (!otpCode || !user?.email || !resolvedName || !bankCode || !accountNumber) {
            toast({
                title: "Missing Details",
                description: "Please ensure all details are complete",
                variant: "destructive",
            });
            return;
        }

        verifyAndAddAccount.mutate(
            {
                code: otpCode,
                email: user.email,
                bankAccount: {
                    bankCode,
                    accountNumber,
                    accountName: resolvedName,
                    bankName: savedBankName,
                    metadata: { primary: false }
                }
            },
            {
                onSuccess: () => {
                    toast({
                        title: "Success",
                        description: "Bank account added successfully!",
                        variant: "success",
                    });
                    handleClose();
                },
                onError: (error) => {
                    toast({
                        title: "Error",
                        description: getErrorMessage(error),
                        variant: "destructive",
                    });
                },
            }
        );
    };

    const handleClose = () => {
        setStep("input");
        setBankCode("");
        setAccountNumber("");
        setOtpCode("");
        setSavedBankName("");
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[500px] bg-zinc-900 border-zinc-800">
                <DialogHeader>
                    <DialogTitle className="text-white">
                        {step === "input" ? "Add Bank Account" : "Verify Account"}
                    </DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        {step === "input"
                            ? "Enter your bank account details to add it to your saved accounts."
                            : "Enter the OTP sent to your email to verify and add this account."}
                    </DialogDescription>
                </DialogHeader>

                {step === "input" ? (
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="bank" className="text-zinc-200">
                                Bank
                            </Label>
                            <SearchableBankSelect
                                banks={banks}
                                value={bankCode}
                                onValueChange={(code) => {
                                    setBankCode(code);
                                    const bank = banks.find(b => b.institutionCode === code);
                                    if (bank) setSavedBankName(bank.institutionName);
                                }}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="accountNumber" className="text-zinc-200">
                                Account Number
                            </Label>
                            <Input
                                id="accountNumber"
                                placeholder="0123456789"
                                value={accountNumber}
                                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                                maxLength={10}
                                className="bg-zinc-800 border-zinc-700 text-white"
                            />
                            {/* Account Resolution Feedback */}
                            {resolveAccount.isPending && (
                                <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>Resolving account...</span>
                                </div>
                            )}
                            {accountResolved && resolvedName && (
                                <div className="flex items-center gap-2 text-xs text-green-500 mt-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>Account: {resolvedName}</span>
                                </div>
                            )}
                            {resolveAccount.isError && accountNumber.length === 10 && (
                                <div className="flex items-center gap-2 text-xs text-red-500 mt-1">
                                    <AlertCircle className="h-3 w-3" />
                                    <span>Could not resolve account</span>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 py-4">
                        <div className="p-4 bg-zinc-800 rounded-lg space-y-2">
                            <div className="flex items-center gap-2 text-green-500">
                                <CheckCircle2 size={20} />
                                <span className="font-medium">Account Resolved</span>
                            </div>
                            <div className="text-sm text-zinc-300">
                                <p><strong>Account Name:</strong> {resolvedName}</p>
                                <p><strong>Account Number:</strong> {accountNumber}</p>
                                <p><strong>Bank:</strong> {savedBankName}</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="otp" className="text-zinc-200">
                                OTP Code
                            </Label>
                            <Input
                                id="otp"
                                placeholder="Enter 6-digit code"
                                value={otpCode}
                                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                                maxLength={6}
                                className="bg-zinc-800 border-zinc-700 text-white"
                            />
                            <p className="text-xs text-zinc-400">
                                Check your email for the verification code
                            </p>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={handleClose}
                        className="text-zinc-400 hover:text-white"
                    >
                        Cancel
                    </Button>
                    {step === "input" ? (
                        <Button
                            onClick={handleInitiate}
                            disabled={initiateAddAccount.isPending || !accountResolved}
                            className="bg-primary hover:bg-primary/90"
                        >
                            {initiateAddAccount.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            {accountResolved ? "Verify & Send OTP" : "Continue"}
                        </Button>
                    ) : (
                        <Button
                            onClick={handleVerifyAndAdd}
                            disabled={verifyAndAddAccount.isPending || otpCode.length !== 6}
                            className="bg-primary hover:bg-primary/90"
                        >
                            {verifyAndAddAccount.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Add Account
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
