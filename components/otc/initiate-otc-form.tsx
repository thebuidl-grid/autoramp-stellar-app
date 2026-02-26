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
import { Loader2, Send, Wallet, Coins, Network, Info } from "lucide-react";
import { otcApi, InitiateOtcTransactionDto } from "@/lib/api";
import { useRouter } from "next/navigation";
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
const SUPPORTED_NETWORKS = ["Polygon", "Base", "Ethereum", "Solana"];

export function InitiateOtcForm() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

    const form = useForm<InitiateFormValues>({
        resolver: zodResolver(initiateSchema) as any,
        defaultValues: {
            quantity: 0,
            token: "USDT",
            network: "Polygon",
            address: "",
            memo: "",
            chain: "",
        },
    });

    const onSubmit = async (data: InitiateFormValues) => {
        setIsSubmitting(true);
        try {
            const response = await otcApi.initiate(data);
            
            toast({
                title: "Transaction Initiated",
                description: "Your OTC transaction has been created successfully.",
                variant: "success",
            });
            
            // Redirect to transaction details or history
            router.push(`/otc/status/${response.data.reference}`);
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

    return (
        <Card className="max-w-2xl mx-auto border-none shadow-2xl bg-white/5 backdrop-blur-md ring-1 ring-white/10">
            <CardHeader>
                <CardTitle className="text-2xl text-white flex items-center gap-2">
                    <Send className="w-6 h-6 text-primary" />
                    Initiate OTC Trade
                </CardTitle>
                <CardDescription className="text-zinc-400">
                    Fill in the details below to start your Over-The-Counter transaction and receive a custom quote.
                </CardDescription>
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
                                                    className="bg-zinc-900/50 border-zinc-700 text-white pl-10"
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
        </Card>
    );
}
