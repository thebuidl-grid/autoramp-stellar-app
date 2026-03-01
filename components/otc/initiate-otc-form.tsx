"use client";

import { useState } from "react";
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
import { Loader2, Send, Wallet, Coins, Network, Info, RefreshCw, Copy, CheckCircle2, Building2, AlertCircle } from "lucide-react";
import { otcApi, InitiateOtcTransactionDto, OtcTransaction } from "@/lib/api";
import { useOtcRate } from "@/lib/hooks";
import { useRouter } from "next/navigation";
import { copyToClipboard } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const initiateSchema = z.object({
    quantity: z.coerce.number().positive("Quantity must be greater than 0"),
    token: z.string().min(1, "Token is required"),
    network: z.string().min(1, "Network is required"),
    chain: z.string().optional(),
    address: z.string().min(10, "Valid wallet address is required"),
    memo: z.string().optional(),
});

type InitiateFormValues = z.infer<typeof initiateSchema>;

const SUPPORTED_TOKENS = ["USDT", "USDC", "CNGN"];
const SUPPORTED_NETWORKS = ["Base"];

export function InitiateOtcForm() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successData, setSuccessData] = useState<OtcTransaction | null>(null);
    const { toast } = useToast();
    const router = useRouter();
    const form = useForm<InitiateFormValues>({
        resolver: zodResolver(initiateSchema) as any,
        defaultValues: {
            quantity: 0,
            token: "USDC",
            network: "Base",
            address: "",
            memo: "",
            chain: "",
        },
    });

    const selectedToken = form.watch("token");
    const { data: rateData, isLoading: isRateLoading, refetch: refetchRate, isFetching: isRefetching } = useOtcRate(selectedToken);
    const currentRate = rateData?.rate || 0;

    const onSubmit = async (data: InitiateFormValues) => {
        setIsSubmitting(true);
        try {
            const response = await otcApi.initiate(data);
            
            toast({
                title: "Transaction Initiated",
                description: "Your OTC transaction has been created successfully.",
                variant: "success",
            });
            
            // Show modal with deposit details
            setSuccessData(response.data);
        } catch (error: any) {
            console.error("Initiate OTC error", error);
            toast({
                title: "Initiation Failed",
                description: error.response?.data?.message || error.message || "Failed to initiate transaction. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

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

    return (
        <Card className="max-w-2xl mx-auto border-none shadow-2xl bg-white/5 backdrop-blur-md ring-1 ring-white/10">
            <CardHeader className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-6">
                <div className="space-y-1.5">
                    <CardTitle className="text-2xl text-white flex items-center gap-2">
                        <Send className="w-6 h-6 text-primary" />
                        Initiate OTC Trade
                    </CardTitle>
                    <CardDescription className="text-zinc-400 max-w-sm">
                        Fill in the details below to start your Over-The-Counter transaction and receive a custom quote.
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
                        <span className="text-sm font-normal text-zinc-400">/ USDC</span>
                    </p>
                </div>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Quantity */}
                            <FormField
                                control={form.control}
                                name="quantity"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-zinc-200">Quantity</FormLabel>
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
                                                    <SelectItem key={network} value={network}>{network}</SelectItem>
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
                                        <FormLabel className="text-zinc-200">Recipient Wallet Address</FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Input
                                                    placeholder="Enter destination wallet address"
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
                                    Initiating Trade...
                                </>
                            ) : (
                                "Initiate Transaction"
                            )}
                        </Button>
                    </form>
                </Form>
            </CardContent>
            <CardFooter className="pb-8 flex items-start gap-3 bg-zinc-900/20 py-4 -mx-px rounded-b-xl border-t border-white/5">
                <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-zinc-400">
                    By initiating this trade, you agree to receive a real-time quote. Final settlement amounts may vary slightly due to market volatility.
                </p>
            </CardFooter>

            {/* Success Details Modal */}
            <Dialog 
                open={!!successData} 
                onOpenChange={(open) => {
                    if (!open && successData) {
                        router.push(`/otc/status/${successData.reference}`);
                    }
                }}
            >
                <DialogContent className="sm:max-w-xl bg-zinc-950 border-zinc-800 text-white">
                    <DialogHeader className="space-y-3 pb-4 border-b border-zinc-800">
                        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-2">
                            <CheckCircle2 className="w-6 h-6 text-green-500" />
                        </div>
                        <DialogTitle className="text-xl text-center">Trade Initiated Successfully</DialogTitle>
                        <DialogDescription className="text-center text-zinc-400">
                            Please transfer the required funds to your dedicated virtual account to execute this swap.
                        </DialogDescription>
                    </DialogHeader>

                    {successData?.issuance && (
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
                                                    onClick={() => handleCopy(successData.issuance!.accountNumber, "Account Number")}
                                                    className="p-1.5 hover:bg-black/20 rounded-md transition-colors text-primary"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-1 md:text-right">
                                            <p className="text-xs text-primary/70 font-medium uppercase tracking-wider">Amount to Send</p>
                                            <div className="flex items-center md:justify-end gap-2">
                                                <p className="text-xl font-bold text-white tracking-tight">₦{successData.amount?.toLocaleString()}</p>
                                                <button 
                                                    onClick={() => handleCopy(successData.amount?.toString() || "", "Amount")}
                                                    className="p-1 hover:bg-black/20 rounded-md transition-colors text-primary"
                                                >
                                                    <Copy className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-primary/10">
                                        <div className="space-y-1">
                                            <p className="text-xs text-primary/70 font-medium uppercase tracking-wider">Bank Name</p>
                                            <p className="text-sm font-medium">SafeHaven MFB</p>
                                        </div>
                                        <div className="space-y-1 md:text-right">
                                            <p className="text-xs text-primary/70 font-medium uppercase tracking-wider">Account Name</p>
                                            <p className="text-sm font-medium">{successData.issuance.accountName}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-primary/10 p-3 flex gap-2 items-start text-xs text-primary/90">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <p>Transfer exactly <strong>₦{successData.amount?.toLocaleString()}</strong> to the account above. Your tokens will be deployed automatically once confirmed.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="pt-2">
                        <Button 
                            className="w-full text-base font-bold h-12"
                            onClick={() => router.push(`/otc/status/${successData?.reference}`)}
                        >
                            View Live Tracking
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
