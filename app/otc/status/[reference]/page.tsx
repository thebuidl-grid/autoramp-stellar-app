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
    AlertCircle,
    Loader2
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
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !transaction) {
        return (
            <Card className="max-w-md mx-auto py-12 text-center space-y-6">
                <div className="p-4 bg-destructive/10 rounded-full inline-block">
                    <AlertCircle className="h-12 w-12 text-destructive" />
                </div>
                <div className="space-y-2 px-6">
                    <h2 className="text-2xl font-bold">Transaction Not Found</h2>
                    <p className="text-muted-foreground text-sm">
                        We couldn't find an OTC transaction with reference <span className="font-mono">{reference}</span>.
                    </p>
                </div>
                <Button asChild className="w-full max-w-xs mx-auto">
                    <Link href="/otc/trade">Return to Trade</Link>
                </Button>
            </Card>
        );
    }

    const isPending = transaction.status === "PENDING" || transaction.status === "PROCESSING";

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-4">
                    <Button asChild variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground">
                        <Link href="/otc/history">
                            <ArrowLeft className="w-4 h-4" />
                            Back to History
                        </Link>
                    </Button>
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold tracking-tight">Transaction Details</h1>
                            <StatusBadge status={transaction.status} />
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground font-mono text-xs">
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
                    onClick={() => refetch()}
                    className="gap-2"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh Status
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Transaction Summary */}
                <Card className="lg:col-span-2 overflow-hidden border-none shadow-none bg-muted/30">
                    <CardHeader className="border-b border-border/50 pb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <Coins className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-lg">Trade Summary</CardTitle>
                                <CardDescription>Key details of your OTC trade request</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/50">
                            <div className="p-6 space-y-6">
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Order Quantity</p>
                                    <p className="text-3xl font-bold tracking-tight">
                                        {transaction.quantity} <span className="text-muted-foreground text-xl">{transaction.token}</span>
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Network</p>
                                    <p className="text-base font-semibold flex items-center gap-2 capitalize">
                                        <Network className="w-4 h-4 text-primary" />
                                        {transaction.network} {transaction.chain && <span className="text-muted-foreground text-xs font-normal">({transaction.chain})</span>}
                                    </p>
                                </div>
                            </div>
                            <div className="p-6 space-y-6">
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Recipient Address</p>
                                    <div className="flex items-center gap-2">
                                        <p className="font-mono text-sm break-all text-muted-foreground">
                                            {transaction.address}
                                        </p>
                                        <button 
                                            onClick={() => handleCopy(transaction.address, "Address")}
                                            className="shrink-0 p-1.5 hover:bg-muted rounded-md transition-colors"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                                {transaction.memo && (
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Memo / Note</p>
                                        <p className="text-sm italic">"{transaction.memo}"</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="bg-muted/50 border-t border-border/50 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Created: {formatDate(transaction.createdAt)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Last Updated: {formatDate(transaction.updatedAt)}</span>
                        </div>
                    </CardFooter>
                </Card>

                {/* Status Timeline */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Live Tracking</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-6 relative ml-3 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-border">
                                <div className="relative pl-8">
                                    <div className={`absolute left-0 top-1 w-4 h-4 rounded-full z-10 ${transaction.status === "FAILED" || transaction.status === "REJECTED" ? "bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]" : "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"}`} />
                                    <p className="text-sm font-semibold">Order Received</p>
                                    <p className="text-[10px] text-muted-foreground uppercase">{formatDate(transaction.createdAt)}</p>
                                </div>

                                <div className="relative pl-8">
                                    <div className={`absolute left-0 top-1 w-4 h-4 rounded-full z-10 ${isPending ? "bg-primary animate-pulse shadow-[0_0_10px_rgba(var(--primary),0.6)]" : (transaction.status === "COMPLETED" ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-muted")}`} />
                                    <p className={`text-sm font-semibold ${isPending ? "text-primary" : ""}`}>Processing Quote</p>
                                    <p className="text-[10px] text-muted-foreground uppercase">{isPending ? "Directing to agents" : (transaction.status === "COMPLETED" ? "Reviewed" : "Pending review")}</p>
                                </div>

                                <div className="relative pl-8">
                                    <div className={`absolute left-0 top-1 w-4 h-4 rounded-full z-10 ${transaction.status === "COMPLETED" ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-muted"}`} />
                                    <p className={`text-sm font-semibold ${transaction.status === "COMPLETED" ? "" : "text-muted-foreground"}`}>Settlement Complete</p>
                                    {transaction.completedAt && <p className="text-[10px] text-muted-foreground uppercase">{formatDate(transaction.completedAt)}</p>}
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl w-full text-center">
                                <p className="text-[10px] text-primary font-bold uppercase tracking-widest mb-1">Estimated Completion</p>
                                <p className="text-xs font-medium">10 - 20 minutes</p>
                            </div>
                        </CardFooter>
                    </Card>

                    <Card className="bg-muted/30">
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-primary" />
                                <CardTitle className="text-sm font-bold">Assistance</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Quote code: <span className="font-mono text-foreground">{transaction.id.slice(0, 8)}</span>
                            </p>
                            <Button asChild size="sm" className="w-full font-bold h-9">
                                <a href="mailto:dev@thebuidlgrid.org" className="gap-2">
                                    Message Agents
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
