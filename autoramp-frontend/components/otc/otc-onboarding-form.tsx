"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, Fingerprint, Building2, AlertCircle } from "lucide-react";
import { otcApi, OtcIdentityType, OnboardOtcDto } from "@/lib/api";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useBanks } from "@/lib/hooks";
import { SearchableBankSelect } from "@/components/ui/searchable-bank-select";
import { useAccountResolution } from "@/lib/hooks/use-account-resolution";

const onboardingSchema = z.object({
    identityType: z.enum([OtcIdentityType.BVN, OtcIdentityType.NIN]),
    identityNumber: z.string().min(10, "Identity number must be at least 10 characters"),
    bankCode: z.string().optional(),
    bankName: z.string().optional(),
    accountName: z.string().optional(),
    accountNumber: z.string().optional(),
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

export function OtcOnboardingForm() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);
    const { toast } = useToast();
    const { data: banks = [] } = useBanks();
    const [isLoaded, setIsLoaded] = useState(false);

    const form = useForm<OnboardingFormValues>({
        resolver: zodResolver(onboardingSchema) as any,
        defaultValues: {
            identityType: OtcIdentityType.BVN,
            identityNumber: "",
            bankCode: "",
            bankName: "",
            accountName: "",
            accountNumber: "",
        },
    });

    const bankCode = form.watch("bankCode");
    const accountNumber = form.watch("accountNumber");

    const { accountName: resolvedName, accountResolved, resolveAccount } = useAccountResolution({
        activeTab: "sell",
        bankCode: bankCode || "",
        accountNumber: accountNumber || "",
    });

    useEffect(() => {
        if (accountResolved && resolvedName) {
            form.setValue("accountName", resolvedName);
        }
    }, [accountResolved, resolvedName, form]);

    // Persistence: Load progress on mount
    useEffect(() => {
        const savedProgress = localStorage.getItem("otc_onboarding_progress");
        if (savedProgress) {
            try {
                const { formData } = JSON.parse(savedProgress);
                form.reset(formData);
            } catch (error) {
                console.error("Error loading OTC progress:", error);
            }
        }
        setIsLoaded(true);
    }, [form]);

    // Persistence: Save progress on changes
    useEffect(() => {
        if (!isLoaded) return;

        let timer: NodeJS.Timeout;
        const subscription = form.watch((value) => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                localStorage.setItem("otc_onboarding_progress", JSON.stringify({
                    formData: value
                }));
            }, 1000);
        });

        return () => {
            clearTimeout(timer);
            subscription.unsubscribe();
        };
    }, [form, isLoaded]);

    const onSubmit = async (data: OnboardingFormValues) => {
        setIsSubmitting(true);
        try {
            // Send ONLY identity fields to isolate validation error
            const payload: OnboardOtcDto = {
                identityType: data.identityType,
                identityNumber: data.identityNumber,
            };

            const response = await otcApi.onboard(payload);
            
            if (response.data.success) {
                toast({
                    title: "Success",
                    description: response.data.message || "Identity verification submitted successfully.",
                    variant: "success",
                });
                setIsCompleted(true);
                localStorage.removeItem("otc_onboarding_progress");
            } else {
                throw new Error(response.data.message || "Failed to submit onboarding.");
            }
        } catch (error: any) {
            console.error("OTC onboarding error", error);
            toast({
                title: "Error",
                description: error.response?.data?.message || error.message || "Failed to submit onboarding. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isCompleted) {
        return (
            <Card className="max-w-2xl mx-auto border-none shadow-2xl bg-white/5 backdrop-blur-md">
                <CardContent className="pt-12 pb-12 flex flex-col items-center text-center space-y-6">
                    <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-12 h-12 text-green-500" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-3xl font-bold tracking-tight text-white">Verification Complete!</h2>
                        <p className="text-gray-400 max-w-md mx-auto">
                            Your identity details and bank account have been verified. You can now access OTC trading features.
                        </p>
                    </div>
                    <Button asChild className="mt-4">
                        <Link href="/otc/trade">Proceed to Trade</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="max-w-xl mx-auto border-none shadow-2xl bg-white/5 backdrop-blur-md ring-1 ring-white/10">
            <CardHeader>
                <CardTitle className="text-2xl text-white flex items-center gap-2">
                    <Fingerprint className="w-6 h-6 text-primary" />
                    Identity & Settlement Details
                </CardTitle>
                <CardDescription className="text-zinc-400">
                    Provide your identity verification and bank details to unlock premium OTC trading.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-primary/80">Identity</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="identityType"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-zinc-400 text-xs uppercase">Type</FormLabel>
                                            <Select
                                                onValueChange={field.onChange}
                                                defaultValue={field.value}
                                            >
                                                <FormControl>
                                                    <SelectTrigger className="bg-zinc-900/50 border-white/10 text-white h-12">
                                                        <SelectValue placeholder="Select type" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                                    <SelectItem value={OtcIdentityType.BVN}>BVN</SelectItem>
                                                    <SelectItem value={OtcIdentityType.NIN}>NIN</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="identityNumber"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-zinc-400 text-xs uppercase">Number</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder={`Enter ${form.watch("identityType")}`}
                                                    {...field}
                                                    className="bg-zinc-900/50 border-white/10 text-white focus:ring-primary h-12"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-white/5">
                            <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-secondary" />
                                <h3 className="text-sm font-bold uppercase tracking-wider text-secondary/80">Settlement Bank (Optional)</h3>
                            </div>
                            
                            <FormField
                                control={form.control}
                                name="bankCode"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-zinc-400 text-xs uppercase">Select Bank</FormLabel>
                                        <FormControl>
                                            <SearchableBankSelect
                                                banks={banks}
                                                value={field.value || ""}
                                                onValueChange={(code) => {
                                                    field.onChange(code);
                                                    const bank = banks.find(b => b.institutionCode === code);
                                                    if (bank) form.setValue("bankName", bank.institutionName);
                                                }}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="accountNumber"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-zinc-400 text-xs uppercase">Account Number</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="0123456789"
                                                {...field}
                                                onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
                                                maxLength={10}
                                                className="bg-zinc-900/50 border-white/10 text-white focus:ring-secondary h-12"
                                            />
                                        </FormControl>
                                        {resolveAccount.isPending && (
                                            <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                <span>Resolving account...</span>
                                            </div>
                                        )}
                                        {accountResolved && resolvedName && (
                                            <div className="flex items-center gap-2 text-xs text-green-500 mt-1">
                                                <CheckCircle2 className="h-3 w-3" />
                                                <span>Account Name: {resolvedName}</span>
                                            </div>
                                        )}
                                        {resolveAccount.isError && accountNumber?.length === 10 && (
                                            <div className="flex items-center gap-2 text-xs text-red-500 mt-1">
                                                <AlertCircle className="h-3 w-3" />
                                                <span>Could not resolve account</span>
                                            </div>
                                        )}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={isSubmitting || (accountNumber?.length === 10 && !accountResolved)}
                            className="w-full h-14 text-lg font-bold transition-all hover:scale-[1.02] active:scale-[0.98] bg-primary hover:bg-primary/90 mt-4 shadow-lg shadow-primary/20"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Submitting Identity...
                                </>
                            ) : (
                                "Complete Onboarding"
                            )}
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
