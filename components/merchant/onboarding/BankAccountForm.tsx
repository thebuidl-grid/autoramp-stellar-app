"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableBankSelect } from "@/components/ui/searchable-bank-select";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage, stablestackApi, Bank } from "@/lib/api";
import { merchantApi } from "@/lib/merchant";
import { useAuthStore } from "@/lib/store";

const bankSchema = z.object({
    bankCode: z.string().min(1, "Bank is required"),
    accountNumber: z.string().length(10, "Account number must be 10 digits"),
    accountName: z.string().min(2, "Account name is required"),
    bankName: z.string().min(1, "Bank name is required"),
});

type BankFormValues = z.infer<typeof bankSchema>;

interface BankAccountFormProps {
    onNext: () => void;
    onBack: () => void;
}

export default function BankAccountForm({ onNext, onBack }: BankAccountFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isResolving, setIsResolving] = useState(false);
    const [banks, setBanks] = useState<Bank[]>([]);
    const { user, updateUser } = useAuthStore();
    const { toast } = useToast();

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors },
    } = useForm<BankFormValues>({
        resolver: zodResolver(bankSchema),
    });

    const accountNumber = watch("accountNumber");
    const bankCode = watch("bankCode");

    // Fetch banks on mount
    useEffect(() => {
        const fetchBanks = async () => {
            try {
                const response = await stablestackApi.getBanks();
                if (response.data?.data) {
                    setBanks(response.data.data);
                }
            } catch (error) {
                toast({
                    title: "Error",
                    description: "Failed to load bank list",
                    variant: "destructive",
                });
            }
        };
        fetchBanks();
    }, [toast]);

    useEffect(() => {
        const resolveAccount = async () => {
            if (accountNumber?.length === 10 && bankCode) {
                setIsResolving(true);
                try {
                    const response = await stablestackApi.resolveAccount(bankCode, accountNumber);
                    // stablestackApi.resolveAccount returns api.get<ResolveAccountResponse>
                    // So response.data is ResolveAccountResponse
                    if (response.data?.data?.accountName) {
                        setValue("accountName", response.data.data.accountName);
                    }
                } catch (error) {
                    toast({
                        title: "Verification Failed",
                        description: "Could not resolve bank account name.",
                        variant: "destructive",
                    });
                } finally {
                    setIsResolving(false);
                }
            }
        };

        resolveAccount();
    }, [accountNumber, bankCode, setValue, toast]);

    const onSubmit = async (data: BankFormValues) => {
        setIsLoading(true);
        try {
            if (!user?.id) throw new Error("User not found");

            await merchantApi.submitBankAccount({
                ...data,
                merchantId: user.id,
            });

            // Update store state to reflect onboarding completion
            //updateUser({ isOnboarded: true });

            toast({
                title: "Success",
                description: "Onboarding completed successfully!",
                variant: "success",
            });
            onNext();
        } catch (error) {
            toast({
                title: "Error",
                description: getErrorMessage(error),
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>Select Bank</Label>
                    <SearchableBankSelect
                        banks={banks}
                        value={bankCode}
                        onValueChange={(code) => {
                            const selectedBank = banks.find(b => b.institutionCode === code);
                            setValue("bankCode", code);
                            if (selectedBank) {
                                setValue("bankName", selectedBank.institutionName);
                            }
                        }}
                    />
                    {errors.bankCode && <p className="text-red-500 text-xs">{errors.bankCode.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="accountNumber">Account Number</Label>
                    <Input
                        id="accountNumber"
                        {...register("accountNumber")}
                        placeholder="10-digit account number"
                        maxLength={10}
                        className="bg-black/50 border-white/10"
                    />
                    {errors.accountNumber && <p className="text-red-500 text-xs">{errors.accountNumber.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="accountName">Account Name</Label>
                    <Input
                        id="accountName"
                        {...register("accountName")}
                        placeholder="Resolved account name"
                        className="bg-black/50 border-white/10"
                        readOnly={isResolving}
                    />
                    {isResolving && <p className="text-blue-400 text-xs animate-pulse">Resolving account name...</p>}
                    {errors.accountName && <p className="text-red-500 text-xs">{errors.accountName.message}</p>}
                </div>
            </div>

            <div className="flex gap-4 pt-4">
                <Button type="button" variant="outline" onClick={onBack} disabled={isLoading} className="flex-1">
                    Back
                </Button>
                <Button type="submit" disabled={isLoading || isResolving} className="flex-1">
                    {isLoading ? "Saving..." : "Finish Onboarding"}
                </Button>
            </div>
        </form>
    );
}
