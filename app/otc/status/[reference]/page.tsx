"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { otcApi, OtcTransaction } from "@/lib/api";
import { useAuthStore, useIsAuthenticated } from "@/lib/store";
import { 
    ArrowLeft, 
    Clock, 
    CheckCircle2, 
    XCircle, 
    Copy, 
    ExternalLink, 
    RefreshCw,
    Wallet,
    Coins,
    Network,
    FileText,
    Calendar,
    AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate, formatCurrency, truncateAddress, copyToClipboard } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import Image from "next/image";
import Link from "next/link";

export default function OtcTransactionStatusPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const isAuthenticated = useIsAuthenticated();
    const { _hasHydrated } = useAuthStore();
    const reference = params.reference as string;
    const [copied, setCopied] = useState<string | null>(null);

    const { data: transaction, isLoading, error, refetch } = useQuery({
        queryKey: ["otc-status", reference],
        queryFn: async () => {
            const response = await otcApi.getStatus(reference);
            return response.data;
        },
        enabled: !!reference && isAuthenticated,
        refetchInterval: (query) => {
            // Stop polling if transaction is in a final state
            const status = query.state.data?.status;
            if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED" || status === "REJECTED") {
                return false;
            }
            return 5000; // Poll every 5 seconds
        }
    });

    const handleCopy = async (text: string, label: string) => {
        const success = await copyToClipboard(text);
        if (success) {
            setCopied(text);
            setTimeout(() => setCopied(null), 2000);
            toast({
                title: "Copied!",
                description: `${label} copied to clipboard`,
                variant: "success",
            });
        }
    };


    if (isLoading) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
                <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                <p className="text-zinc-400 animate-pulse">Fetching transaction details...</p>
            </div>
        );
    }

    if (error || !transaction) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white/5 border border-white/10 backdrop-blur-xl rounded-3xl p-8 text-center space-y-6">
                    <div className="p-4 bg-red-500/10 rounded-2xl inline-block mx-auto">
                        <AlertCircle className="h-12 w-12 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-white">Transaction Not Found</h2>
                    <p className="text-zinc-400">
                        We couldn't find an OTC transaction with reference <span className="text-white font-mono">{reference}</span>.
                    </p>
                    <Button asChild className="w-full">
                        <Link href="/otc/trade">Return to Trade</Link>
                    </Button>
                </div>
            </div>
        );
    }

    const isPending = transaction.status === "PENDING" || transaction.status === "PROCESSING";

    return (
        <div className="min-h-screen bg-black text-white selection:bg-primary/30 pb-20">
            {/* Background Decor */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 container mx-auto px-4 py-12">
                <div className="max-w-4xl mx-auto space-y-8">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div className="space-y-4">
                            <Button asChild variant="ghost" className="text-zinc-400 hover:text-white -ml-4">
                                <Link href="/otc/trade" className="flex items-center gap-2">
                                    <ArrowLeft className="w-4 h-4" />
                                    Back to Trade
                                </Link>
                            </Button>
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <h1 className="text-3xl font-black tracking-tighter">Transaction Details</h1>
                                    <StatusBadge status={transaction.status} />
                                </div>
                                <div className="flex items-center gap-2 text-zinc-400 font-mono text-sm">
                                    <span>#{transaction.reference}</span>
                                    <button 
                                        onClick={() => handleCopy(transaction.reference, "Reference")}
                                        className="hover:text-primary transition-colors"
                                    >
                                        <Copy className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        </div>
                        <Button 
                            variant="outline" 
                            className="bg-white/5 border-white/10 hover:bg-white/10"
                            onClick={() => refetch()}
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Refresh Status
                        </Button>
                    </div>

                    {/* Main Status Card */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Transaction Summary */}
                        <Card className="lg:col-span-2 border-none bg-white/5 backdrop-blur-md ring-1 ring-white/10 overflow-hidden">
                            <CardHeader className="border-b border-white/5 pb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                                        <Coins className="w-6 h-6 text-primary" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl text-white">Trade Summary</CardTitle>
                                        <CardDescription className="text-zinc-400">Key details of your OTC trade request</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5">
                                    <div className="p-8 space-y-6">
                                        <div className="space-y-1">
                                            <p className="text-sm text-zinc-500 font-medium">Order Quantity</p>
                                            <p className="text-3xl font-black tracking-tighter text-white">
                                                {transaction.quantity} <span className="text-zinc-400 text-xl">{transaction.token}</span>
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm text-zinc-500 font-medium">Network</p>
                                            <p className="text-lg font-bold text-white flex items-center gap-2 capitalize">
                                                <Network className="w-4 h-4 text-primary" />
                                                {transaction.network} {transaction.chain && <span className="text-zinc-500 text-sm">({transaction.chain})</span>}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="p-8 space-y-6">
                                        <div className="space-y-1">
                                            <p className="text-sm text-zinc-500 font-medium">Recipient Address</p>
                                            <div className="flex items-center gap-2">
                                                <p className="font-mono text-sm text-white break-all">
                                                    {transaction.address}
                                                </p>
                                                <button 
                                                    onClick={() => handleCopy(transaction.address, "Address")}
                                                    className="shrink-0 p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                                                >
                                                    <Copy className="w-4 h-4 text-zinc-400" />
                                                </button>
                                            </div>
                                        </div>
                                        {transaction.memo && (
                                            <div className="space-y-1">
                                                <p className="text-sm text-zinc-500 font-medium">Memo / Note</p>
                                                <p className="text-sm text-zinc-400 italic">"{transaction.memo}"</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="bg-white/5 border-t border-white/5 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-center gap-2 text-zinc-400 text-sm">
                                    <Calendar className="w-4 h-4" />
                                    <span>Created: {formatDate(transaction.createdAt)}</span>
                                </div>
                                <div className="flex items-center gap-2 text-zinc-400 text-sm">
                                    <Clock className="w-4 h-4" />
                                    <span>Last Updated: {formatDate(transaction.updatedAt)}</span>
                                </div>
                            </CardFooter>
                        </Card>

                        {/* Status Timeline / Sidebar */}
                        <div className="space-y-6">
                            <Card className="border-none bg-white/5 backdrop-blur-md ring-1 ring-white/10 overflow-hidden h-full">
                                <CardHeader>
                                    <CardTitle className="text-lg text-white">Live Tracking</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-8 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-white/10">
                                        {/* Status steps - simplified visualization */}
                                        <div className="relative pl-8">
                                            <div className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center z-10 ${transaction.status === "FAILED" || transaction.status === "REJECTED" ? "bg-red-500" : "bg-green-500"}`}>
                                                {transaction.status === "FAILED" || transaction.status === "REJECTED" ? <XCircle className="w-4 h-4 text-white" /> : <CheckCircle2 className="w-4 h-4 text-white" />}
                                            </div>
                                            <p className="font-bold text-white">Order Received</p>
                                            <p className="text-xs text-zinc-500">{formatDate(transaction.createdAt)}</p>
                                        </div>

                                        <div className="relative pl-8">
                                            <div className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center z-10 ${isPending ? "bg-primary animate-pulse" : (transaction.status === "COMPLETED" ? "bg-green-500" : "bg-zinc-800")}`}>
                                                {isPending ? <Clock className="w-4 h-4 text-white" /> : <CheckCircle2 className="w-4 h-4 text-white" />}
                                            </div>
                                            <p className={`font-bold ${isPending ? "text-primary" : "text-white"}`}>Processing Quote</p>
                                            <p className="text-xs text-zinc-500">Wait for agent review</p>
                                        </div>

                                        <div className="relative pl-8">
                                            <div className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center z-10 ${transaction.status === "COMPLETED" ? "bg-green-500" : "bg-zinc-800"}`}>
                                                <CheckCircle2 className="w-4 h-4 text-white" />
                                            </div>
                                            <p className={`font-bold ${transaction.status === "COMPLETED" ? "text-white" : "text-zinc-600"}`}>Settlement Complete</p>
                                            {transaction.completedAt && <p className="text-xs text-zinc-500">{formatDate(transaction.completedAt)}</p>}
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter className="pt-8">
                                    <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 w-full text-center">
                                        <p className="text-xs text-primary font-bold uppercase tracking-wider mb-1">Estimated Time</p>
                                        <p className="text-sm text-white">10 - 30 minutes</p>
                                    </div>
                                </CardFooter>
                            </Card>
                        </div>
                    </div>

                    {/* Support Banner */}
                    <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent p-1 rounded-3xl">
                        <div className="bg-black/40 backdrop-blur-xl p-8 rounded-[22px] flex flex-col md:flex-row items-center justify-between gap-6 ring-1 ring-white/5">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-primary/20 rounded-2xl">
                                    <AlertCircle className="w-8 h-8 text-primary" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-lg font-bold">Need Assistance?</h3>
                                    <p className="text-zinc-400 text-sm">Mention support code <span className="text-white font-mono">{transaction.id.slice(0, 8)}</span> when contacting us.</p>
                                </div>
                            </div>
                            <Button asChild className="group h-12 px-8 rounded-xl shrink-0">
                                <a href="mailto:dev@thebuidlgrid.org" className="flex items-center gap-2">
                                    Contact Support
                                    <ExternalLink className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                                </a>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
