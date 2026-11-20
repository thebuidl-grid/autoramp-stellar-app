"use client";

import { useState, useEffect, useRef } from "react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Send, Wallet, Coins, Network, Info, RefreshCw, Copy, CheckCircle2, Building2, AlertCircle, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { otcApi, OtcInitiateResponse, OtcOnrampInitiateResponse, OtcOfframpInitiateResponse, stablestackApi } from "@/lib/api";
import { useOtcRate, useBanks } from "@/lib/hooks";
import { useRouter } from "next/navigation";
import { copyToClipboard } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { SearchableBankSelect } from "@/components/ui/searchable-bank-select";

type OtcMode = "onramp" | "offramp";

const SUPPORTED_TOKENS = ["USDT", "USDC", "CNGN"];
const SUPPORTED_NETWORKS = ["base", "bsc"] as const;

const otcFormSchema = z.object({
    quantity: z.coerce.number().min(1, "Minimum quantity is 1"),
    token: z.string().min(1, "Token is required"),
    network: z.string().min(1, "Network is required"),
    chain: z.string().optional(),
    address: z.string().min(10, "Valid wallet address is required"),
    memo: z.string().optional(),
    bankCode: z.string().min(1, "Bank is required"),
    accountNumber: z.string().min(10, "Valid account number is required"),
});

type OtcFormValues = z.infer<typeof otcFormSchema>;

const NETWORK_LABELS: Record<string, string> = {
    base: "Base",
    bsc: "BSC",
};

export function InitiateOtcForm() {
    const [mode, setMode] = useState<OtcMode>("onramp");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successData, setSuccessData] = useState<OtcInitiateResponse | null>(null);
    const { toast } = useToast();
    const router = useRouter();
    const { data: banks = [] } = useBanks();

    const form = useForm<OtcFormValues>({
        resolver: zodResolver(otcFormSchema) as any,
        defaultValues: {
            quantity: 0,
            token: "USDC",
            network: "base",
            address: "",
            memo: "",
            chain: "",
            bankCode: "",
            accountNumber: "",
        },
    });
    const selectedToken = form.watch("token");
    const selectedNetwork = form.watch("network") as "base" | "bsc";
    const bankCode = form.watch("bankCode");
    const accountNumber = form.watch("accountNumber");
    const { data: rateData, isLoading: isRateLoading, refetch: refetchRate, isFetching: isRefetching } = useOtcRate(selectedToken, selectedNetwork);
    const currentRate = rateData?.rate || 0;

    const [resolvedName, setResolvedName] = useState<string | null>(null);
    const [isResolving, setIsResolving] = useState(false);
    const [resolveError, setResolveError] = useState(false);
    const lastResolvedRef = useRef<string>("");

    useEffect(() => {
        if (!bankCode || accountNumber.length !== 10) {
            setResolvedName(null);
            setResolveError(false);
            lastResolvedRef.current = "";
            return;
        }

        const key = `${bankCode}-${accountNumber}`;
        if (key === lastResolvedRef.current) return;

        setIsResolving(true);
        setResolveError(false);

        const timer = setTimeout(async () => {
            try {
                const res = await stablestackApi.resolveAccount(bankCode, accountNumber);
                const name = res.data?.data?.accountName;
                if (name) {
                    setResolvedName(name);
                    lastResolvedRef.current = key;
                } else {
                    setResolvedName(null);
                    setResolveError(true);
                }
            } catch {
                setResolvedName(null);
                setResolveError(true);
            } finally {
                setIsResolving(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [bankCode, accountNumber]);

    const handleCopy = async (text: string, label: string) => {
        const success = await copyToClipboard(text);
        if (success) {
            toast({
                title: "Copied!",
                description: `${label} copied to clipboard`,
                variant: "success",
            });
        }
    };

    const onSubmitOnramp = async (data: OtcFormValues) => {
        setIsSubmitting(true);
        try {
            const roundedData = {
                quantity: Number(data.quantity.toFixed(6)),
                token: data.token,
                network: data.network as "base" | "bsc",
                chain: data.chain,
                address: data.address,
                memo: data.memo,
            };
            const response = await otcApi.initiate(roundedData);
            toast({
                title: "Transaction Initiated",
                description: "Your OTC onramp transaction has been created successfully.",
                variant: "success",
            });
            setSuccessData(response.data);
        } catch (error: any) {
            console.error("Initiate OTC onramp error", error);
            toast({
                title: "Initiation Failed",
                description: error.response?.data?.message || error.message || "Failed to initiate transaction. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const onSubmitOfframp = async (data: OtcFormValues) => {
        setIsSubmitting(true);
        try {
            const roundedData = {
                quantity: Number(data.quantity.toFixed(6)),
                token: data.token,
                network: data.network as "base" | "bsc",
                chain: data.chain,
                address: data.address,
                memo: data.memo,
                bankCode: data.bankCode || "",
                accountNumber: data.accountNumber || "",
            };
            const response = await otcApi.initiateOfframp(roundedData);
            toast({
                title: "Offramp Initiated",
                description: "Your OTC offramp transaction has been created successfully.",
                variant: "success",
            });
            setSuccessData(response.data);
        } catch (error: any) {
            console.error("Initiate OTC offramp error", error);
            toast({
                title: "Initiation Failed",
                description: error.response?.data?.message || error.message || "Failed to initiate offramp. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const onSubmit = mode === "onramp" ? form.handleSubmit(onSubmitOnramp) : form.handleSubmit(onSubmitOfframp);

    const displayNetwork = NETWORK_LABELS[selectedNetwork] || selectedNetwork;

    return (
        <Card className="max-w-2xl mx-auto border-none shadow-2xl bg-white/5 backdrop-blur-md ring-1 ring-white/10">
            <CardHeader className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-6">
                <div className="space-y-1.5">
                    <CardTitle className="text-2xl text-white flex items-center gap-2">
                        {mode === "onramp" ? <ArrowDownToLine className="w-6 h-6 text-primary" /> : <ArrowUpFromLine className="w-6 h-6 text-primary" />}
                        {mode === "onramp" ? "OTC Onramp" : "OTC Offramp"}
                    </CardTitle>
                    <CardDescription className="text-zinc-400 max-w-sm">
                        {mode === "onramp"
                            ? "Buy crypto with NGN. Fill in the details below to start your Over-The-Counter onramp."
                            : "Sell crypto for NGN. Fill in the details below to start your Over-The-Counter offramp."}
                    </CardDescription>
                </div>
                <div className="shrink-0 text-right p-3 bg-primary/5 rounded-xl border border-primary/20">
                    <div className="flex items-center justify-end gap-2 mb-1">
                        <p className="text-xs text-primary font-bold uppercase tracking-wider">Current Rate</p>
                        <button
                            type="button"
                            onClick={() => refetchRate()}
                            disabled={isRefetching}
                            className="text-zinc-400 hover:text-primary transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`w-3 h-3 ${(isRefetching && !isRateLoading) ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                    <p className="text-xl font-bold text-white flex items-center justify-end gap-2">
                        {isRateLoading ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : currentRate ? `₦${currentRate.toLocaleString()}` : "---"}
                        <span className="text-sm font-normal text-zinc-400">/ {selectedToken}</span>
                    </p>
                </div>
            </CardHeader>
            <CardContent>
                {/* Mode Toggle */}
                <div className="flex gap-2 mb-6 p-1 bg-zinc-900/50 rounded-lg border border-zinc-700/50">
                    <button
                        type="button"
                        onClick={() => setMode("onramp")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                            mode === "onramp"
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-zinc-400 hover:text-white"
                        }`}
                    >
                        <ArrowDownToLine className="w-4 h-4" />
                        Onramp
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode("offramp")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                            mode === "offramp"
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-zinc-400 hover:text-white"
                        }`}
                    >
                        <ArrowUpFromLine className="w-4 h-4" />
                        Offramp
                    </button>
                </div>

                <Form {...form}>
                    <form onSubmit={onSubmit} className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Quantity */}
                            <FormField
                                control={form.control}
                                name="quantity"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-zinc-200">
                                            {mode === "onramp" ? "Amount (NGN)" : "Amount (Crypto)"}
                                        </FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Input
                                                    type="number"
                                                    placeholder="0.00"
                                                    {...field}
                                                    className="bg-zinc-900/50 border-zinc-700 text-white pl-10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                />
                                                <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Token */}
                            <FormField
                                control={form.control}
                                name="token"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-zinc-200">Token</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="bg-zinc-900/50 border-zinc-700 text-white">
                                                    <SelectValue placeholder="Select token" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                                                {SUPPORTED_TOKENS.map((token) => (
                                                    <SelectItem key={token} value={token}>{token}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Network */}
                            <FormField
                                control={form.control}
                                name="network"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-zinc-200">Network</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="bg-zinc-900/50 border-zinc-700 text-white pl-10">
                                                    <div className="absolute left-3 top-1/2 -translate-y-1/2">
                                                        <Network className="w-4 h-4 text-zinc-500" />
                                                    </div>
                                                    <SelectValue placeholder="Select network" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                                                {SUPPORTED_NETWORKS.map((network) => (
                                                    <SelectItem key={network} value={network}>{NETWORK_LABELS[network]}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Wallet Address */}
                            <FormField
                                control={form.control}
                                name="address"
                                render={({ field }) => (
                                    <FormItem className="col-span-1 md:col-span-2">
                                        <FormLabel className="text-zinc-200">
                                            {mode === "onramp" ? "Recipient Wallet Address" : "Source Wallet Address"}
                                        </FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Input
                                                    placeholder={mode === "onramp" ? "Enter destination wallet address" : "Enter wallet address to send from"}
                                                    {...field}
                                                    className="bg-zinc-900/50 border-zinc-700 text-white pl-10"
                                                />
                                                <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Offramp: Bank Account Fields */}
                            {mode === "offramp" && (
                                <>
                                    <FormField
                                        control={form.control}
                                        name="bankCode"
                                        render={({ field }) => (
                                            <FormItem className="col-span-1 md:col-span-2">
                                                <FormLabel className="text-zinc-200">Bank to Receive NGN</FormLabel>
                                                <SearchableBankSelect
                                                    banks={banks}
                                                    value={field.value || ""}
                                                    onValueChange={field.onChange}
                                                    placeholder="Select your bank"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="accountNumber"
                                        render={({ field }) => (
                                            <FormItem className="col-span-1 md:col-span-2">
                                                <FormLabel className="text-zinc-200">Account Number</FormLabel>
                                                <FormControl>
                                                    <div className="relative">
                                                        <Input
                                                            placeholder="Enter bank account number"
                                                            {...field}
                                                            className="bg-zinc-900/50 border-zinc-700 text-white pl-10"
                                                        />
                                                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                                    </div>
                                                </FormControl>
                                                {isResolving && (
                                                    <p className="text-xs text-zinc-400 flex items-center gap-1 mt-1">
                                                        <Loader2 className="w-3 h-3 animate-spin" /> Resolving account name...
                                                    </p>
                                                )}
                                                {resolvedName && (
                                                    <p className="text-xs text-green-400 flex items-center gap-1 mt-1">
                                                        <CheckCircle2 className="w-3 h-3" /> {resolvedName}
                                                    </p>
                                                )}
                                                {resolveError && accountNumber?.length === 10 && (
                                                    <p className="text-xs text-red-400 flex items-center gap-1 mt-1">
                                                        <AlertCircle className="w-3 h-3" /> Could not resolve account name
                                                    </p>
                                                )}
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </>
                            )}

                            {/* Memo (Optional) */}
                            <FormField
                                control={form.control}
                                name="memo"
                                render={({ field }) => (
                                    <FormItem className="col-span-1 md:col-span-2">
                                        <FormLabel className="text-zinc-200">Memo / Note (Optional)</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="Add an optional memo for your reference"
                                                {...field}
                                                className="bg-zinc-900/50 border-zinc-700 text-white"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full h-14 text-xl font-bold transition-all hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-primary/20"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                                    {mode === "onramp" ? "Initiating Onramp..." : "Initiating Offramp..."}
                                </>
                            ) : (
                                mode === "onramp" ? "Initiate Onramp" : "Initiate Offramp"
                            )}
                        </Button>
                    </form>
                </Form>
            </CardContent>
            <CardFooter className="pb-8 flex items-start gap-3 bg-zinc-900/20 py-4 -mx-px rounded-b-xl border-t border-white/5">
                <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-zinc-400">
                    {mode === "onramp"
                        ? "By initiating this trade, you agree to receive a real-time quote. Final settlement amounts may vary slightly due to market volatility."
                        : "By initiating this offramp, you agree to send crypto to the deposit address. NGN will be sent to your bank account after confirmation."}
                </p>
            </CardFooter>

            {/* Success Details Modal */}
            <Dialog
                open={!!successData}
                onOpenChange={(open) => {
                    if (!open && successData) {
                        router.push("/otc/history");
                    }
                }}
            >
                <DialogContent className="sm:max-w-xl bg-zinc-950 border-zinc-800 text-white">
                    <DialogHeader className="space-y-3 pb-4 border-b border-zinc-800">
                        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-2">
                            <CheckCircle2 className="w-6 h-6 text-green-500" />
                        </div>
                        <DialogTitle className="text-xl text-center">
                            {successData?.type === "onramp" ? "Onramp Initiated Successfully" : "Offramp Initiated Successfully"}
                        </DialogTitle>
                        <DialogDescription className="text-center text-zinc-400">
                            {successData?.type === "onramp"
                                ? "Please transfer the required funds to your dedicated virtual account to execute this swap."
                                : "Please send crypto to the deposit address below to complete this offramp."}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Onramp: Issuance (bank account) details */}
                    {successData?.type === "onramp" && successData.issuance && (
                        <div className="py-2">
                            <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
                                <div className="p-4 border-b border-primary/10 flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-primary" />
                                    <h4 className="font-semibold text-primary">Deposit Details</h4>
                                </div>
                                <div className="p-5 space-y-5">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="space-y-1">
                                            <p className="text-xs text-primary/70 font-medium uppercase tracking-wider">Account Number</p>
                                            <div className="flex items-center gap-2">
                                                <p className="text-2xl font-bold font-mono tracking-tight">{successData.issuance.accountNumber}</p>
                                                <button
                                                    onClick={() => handleCopy(successData.issuance.accountNumber, "Account Number")}
                                                    className="p-1.5 hover:bg-black/20 rounded-md transition-colors text-primary"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-1 md:text-right">
                                            <p className="text-xs text-primary/70 font-medium uppercase tracking-wider">Amount to Send</p>
                                            <div className="flex items-center md:justify-end gap-2">
                                                <p className="text-xl font-bold text-white tracking-tight">₦{successData.quote.sourceAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                                <button
                                                    onClick={() => handleCopy(successData.quote.sourceAmount.toString(), "Amount")}
                                                    className="p-1 hover:bg-black/20 rounded-md transition-colors text-primary"
                                                >
                                                    <Copy className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-primary/10">
                                        <div className="space-y-1">
                                            <p className="text-xs text-primary/70 font-medium uppercase tracking-wider">You Will Receive</p>
                                            <p className="text-lg font-bold text-green-400">{successData.quote.destinationAmount.toLocaleString('en-US', { minimumFractionDigits: 6 })} USDC</p>
                                        </div>
                                        <div className="space-y-1 md:text-right">
                                            <p className="text-xs text-primary/70 font-medium uppercase tracking-wider">Rate</p>
                                            <p className="text-sm font-medium">₦{successData.quote.rate.toLocaleString('en-US', { minimumFractionDigits: 2 })} / USDC</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-primary/10">
                                        <div className="space-y-1">
                                            <p className="text-xs text-primary/70 font-medium uppercase tracking-wider">Bank Name</p>
                                            <p className="text-sm font-medium">{successData.issuance.bankName}</p>
                                        </div>
                                        <div className="space-y-1 md:text-right">
                                            <p className="text-xs text-primary/70 font-medium uppercase tracking-wider">Account Name</p>
                                            <p className="text-sm font-medium">{successData.issuance.accountName}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-primary/10 p-3 flex gap-2 items-start text-xs text-primary/90">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <p>Transfer exactly <strong>₦{successData.quote.sourceAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong> to the account above. Your tokens will be deployed automatically once confirmed.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Offramp: Deposit address details */}
                    {successData?.type === "offramp" && successData.depositAddress && (
                        <div className="py-2">
                            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 overflow-hidden">
                                <div className="p-4 border-b border-orange-500/10 flex items-center gap-2">
                                    <Wallet className="w-4 h-4 text-orange-500" />
                                    <h4 className="font-semibold text-orange-500">Send Crypto To</h4>
                                </div>
                                <div className="p-5 space-y-5">
                                    <div className="space-y-1">
                                        <p className="text-xs text-orange-500/70 font-medium uppercase tracking-wider">Deposit Address</p>
                                        <div className="flex items-center gap-2">
                                            <p className="text-lg font-bold font-mono tracking-tight break-all">{successData.depositAddress.address}</p>
                                            <button
                                                onClick={() => handleCopy(successData.depositAddress.address, "Deposit Address")}
                                                className="p-1.5 hover:bg-black/20 rounded-md transition-colors text-orange-500 shrink-0"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-orange-500/10">
                                        <div className="space-y-1">
                                            <p className="text-xs text-orange-500/70 font-medium uppercase tracking-wider">Send (Crypto)</p>
                                            <p className="text-lg font-bold text-white">{successData.quote.sourceAmount.toLocaleString('en-US', { minimumFractionDigits: 6 })} {successData.depositAddress.token}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs text-orange-500/70 font-medium uppercase tracking-wider">You Will Receive (NGN)</p>
                                            <p className="text-lg font-bold text-green-400">₦{successData.quote.destinationAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-orange-500/10">
                                        <div className="space-y-1">
                                            <p className="text-xs text-orange-500/70 font-medium uppercase tracking-wider">Network</p>
                                            <p className="text-sm font-medium capitalize">{NETWORK_LABELS[successData.depositAddress.network || selectedNetwork] || successData.depositAddress.network || selectedNetwork}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs text-orange-500/70 font-medium uppercase tracking-wider">Rate</p>
                                            <p className="text-sm font-medium">₦{successData.quote.rate.toLocaleString('en-US', { minimumFractionDigits: 2 })} / {successData.depositAddress.token}</p>
                                        </div>
                                    </div>
                                    {successData.depositAddress.memo && (
                                        <div className="space-y-1 pt-2 border-t border-orange-500/10">
                                            <p className="text-xs text-orange-500/70 font-medium uppercase tracking-wider">Memo</p>
                                            <p className="text-sm font-mono">{successData.depositAddress.memo}</p>
                                        </div>
                                    )}
                                    {successData.depositAddress.expiresAt && (
                                        <div className="space-y-1 pt-2 border-t border-orange-500/10">
                                            <p className="text-xs text-orange-500/70 font-medium uppercase tracking-wider">Expires At</p>
                                            <p className="text-sm font-mono">{new Date(successData.depositAddress.expiresAt).toLocaleString()}</p>
                                        </div>
                                    )}
                                </div>
                                <div className="bg-orange-500/10 p-3 flex gap-2 items-start text-xs text-orange-500/90 border-t border-orange-500/10">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <p>Send exactly <strong>{successData.quote.sourceAmount.toLocaleString()} {successData.depositAddress.token}</strong> to the address above on the <strong>{NETWORK_LABELS[successData.depositAddress.network || selectedNetwork] || successData.depositAddress.network || selectedNetwork}</strong> network. NGN will be sent to your bank account after confirmation.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Offramp: Waiting for deposit address */}
                    {successData?.type === "offramp" && !successData.depositAddress && (
                        <div className="py-2">
                            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 overflow-hidden p-5">
                                <div className="flex gap-3 items-start">
                                    <Loader2 className="w-5 h-5 text-orange-500 animate-spin shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-semibold text-orange-500">Deposit address pending</p>
                                        <p className="text-sm text-zinc-400 mt-1">Your deposit address is being generated. Check the status page for details.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="pt-2">
                        <Button
                            className="w-full text-base font-bold h-12"
                            onClick={() => router.push("/otc/history")}
                        >
                            View Transactions
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
