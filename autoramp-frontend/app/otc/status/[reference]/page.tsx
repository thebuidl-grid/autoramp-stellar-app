"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { otcApi, OtcStatusResponse } from "@/lib/api";
import { useAuthStore, useIsAuthenticated } from "@/lib/store";
import { 
    ArrowLeft, 
    Copy, 
    RefreshCw,
    Wallet,
    Coins,
    Network,
    AlertCircle,
    Loader2,
    Building2,
    ArrowDownToLine,
    ArrowUpFromLine
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { copyToClipboard } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import Link from "next/link";

const NETWORK_LABELS: Record<string, string> = {
    base: "Base",
    bsc: "BSC",
};

export default function OtcTransactionStatusPage() {
    const params = useParams();
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
            const status = query.state.data?.status;
            if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED" || status === "REJECTED") {
                return false;
            }
            return 5000;
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
    const isOnramp = !!transaction.issuance;
    const isOfframp = !!transaction.deposit;
    const providerNotes = transaction.providerResponse?.data?.deposit?.note;
    const expiresAt = transaction.expiresAt || transaction.deposit?.expiresAt;
    const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;
    const displayNetwork = NETWORK_LABELS[transaction.network] || transaction.network;

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
                            {isOfframp && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                                    <ArrowUpFromLine className="w-3 h-3" />
                                    Offramp
                                </span>
                            )}
                            {isOnramp && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                    <ArrowDownToLine className="w-3 h-3" />
                                    Onramp
                                </span>
                            )}
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
                {/* Main Content Area */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Onramp: Issuance (bank deposit) card */}
                    {isOnramp && transaction.issuance && isPending && (
                        <Card className="overflow-hidden border-primary/20 bg-primary/5">
                            <CardHeader className="border-b border-primary/10 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                                        <Building2 className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg text-primary">Deposit Details</CardTitle>
                                        <CardDescription className="text-primary/70">Please transfer NGN to this virtual account to proceed.</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6">
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <p className="text-xs text-primary/70 font-medium uppercase tracking-wider">Amount to Send (NGN)</p>
                                            <div className="flex items-center gap-2">
                                                <p className="text-2xl font-bold text-white">₦{Number(transaction.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                                <button 
                                                    onClick={() => handleCopy(transaction.amount?.toString() || "", "Amount")}
                                                    className="p-1 hover:bg-black/20 rounded-md transition-colors text-primary"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs text-primary/70 font-medium uppercase tracking-wider">You Will Receive</p>
                                            <p className="text-lg font-bold text-green-400">{transaction.tokenAmountSent.toLocaleString('en-US', { minimumFractionDigits: 6 })} {transaction.token}</p>
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-primary/10 space-y-1">
                                        <p className="text-xs text-primary/70 font-medium uppercase tracking-wider">Account Number</p>
                                        <div className="flex items-center gap-2">
                                            <p className="text-3xl font-bold tracking-tight text-white font-mono">{transaction.issuance.accountNumber}</p>
                                            <button 
                                                onClick={() => handleCopy(transaction.issuance!.accountNumber, "Account Number")}
                                                className="p-2 hover:bg-black/20 rounded-md transition-colors text-primary"
                                            >
                                                <Copy className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-primary/10">
                                        <div className="space-y-1">
                                            <p className="text-xs text-primary/70 font-medium uppercase tracking-wider">Bank Name</p>
                                            <p className="text-sm font-medium">{transaction.issuance.bankName}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs text-primary/70 font-medium uppercase tracking-wider">Account Name</p>
                                            <p className="text-sm font-medium">{transaction.issuance.accountName}</p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="bg-primary/10 border-t border-primary/10 p-4">
                                <div className="flex items-start gap-3 w-full">
                                    <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                    <p className="text-sm text-primary/90">
                                        Transfer exactly <span className="font-bold">₦{Number(transaction.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> to the account above. Your tokens will be deployed automatically once the deposit is confirmed.
                                    </p>
                                </div>
                            </CardFooter>
                        </Card>
                    )}

                    {/* Offramp: Send crypto to deposit address card */}
                    {isOfframp && transaction.deposit && isPending && (
                        <Card className="overflow-hidden border-orange-500/20 bg-orange-500/5">
                            <CardHeader className="border-b border-orange-500/10 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                                        <Wallet className="w-5 h-5 text-orange-500" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg text-orange-500">Send Crypto</CardTitle>
                                        <CardDescription className="text-orange-500/70">Send crypto to the address below to complete your offramp.</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6">
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <p className="text-xs text-orange-500/70 font-medium uppercase tracking-wider">Deposit Address</p>
                                        <div className="flex items-center gap-2">
                                            <p className="text-lg font-bold tracking-tight text-white font-mono break-all">{transaction.deposit.address}</p>
                                            <button
                                                onClick={() => handleCopy(transaction.deposit!.address, "Deposit Address")}
                                                className="p-2 hover:bg-black/20 rounded-md transition-colors text-orange-500 shrink-0"
                                            >
                                                <Copy className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-orange-500/10">
                                        <div className="space-y-1">
                                            <p className="text-xs text-orange-500/70 font-medium uppercase tracking-wider">Send (Crypto)</p>
                                            <p className="text-lg font-bold text-white">{transaction.tokenAmountSent.toLocaleString('en-US', { minimumFractionDigits: 6 })} {transaction.token}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs text-orange-500/70 font-medium uppercase tracking-wider">You Will Receive (NGN)</p>
                                            <p className="text-lg font-bold text-green-400">₦{transaction.fiatAmountReceived.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs text-orange-500/70 font-medium uppercase tracking-wider">Network</p>
                                            <p className="text-base font-semibold text-white capitalize">{displayNetwork}</p>
                                        </div>
                                    </div>
                                    {transaction.deposit?.memo && (
                                        <div className="space-y-1 pt-2 border-t border-orange-500/10">
                                            <p className="text-xs text-orange-500/70 font-medium uppercase tracking-wider">Memo</p>
                                            <p className="text-sm font-mono text-white">{transaction.deposit.memo}</p>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                            <CardFooter className="bg-orange-500/10 border-t border-orange-500/10 p-4">
                                <div className="flex items-start gap-3 w-full">
                                    <AlertCircle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                                    <p className="text-sm text-orange-500/90">
                                        Send exactly <span className="font-bold">{transaction.tokenAmountSent.toLocaleString('en-US', { minimumFractionDigits: 6 })} {transaction.token}</span> to the address above on the <span className="font-bold capitalize">{displayNetwork}</span> network. NGN will be sent to your bank after confirmation.
                                    </p>
                                </div>
                            </CardFooter>
                        </Card>
                    )}

                    {/* Expiry warning */}
                    {isPending && isOfframp && isExpired && (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex gap-3 items-start">
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-semibold text-red-500">Deposit address expired</p>
                                <p className="text-sm text-red-400/80 mt-1">This deposit address has expired. Please initiate a new transaction to get a fresh address.</p>
                            </div>
                        </div>
                    )}

                    {/* Provider notes */}
                    {isPending && providerNotes && providerNotes.length > 0 && (
                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                            {providerNotes.map((note, idx) => (
                                <div key={idx} className="flex gap-2 items-start text-xs text-primary/90">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <p>{note}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Transaction Summary */}
                    <Card className="overflow-hidden border-none shadow-none bg-muted/30">
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
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Crypto Quantity</p>
                                        <p className="text-3xl font-bold tracking-tight">
                                            {transaction.tokenAmountSent.toLocaleString('en-US', { minimumFractionDigits: 6 })} <span className="text-muted-foreground text-xl">{transaction.token}</span>
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">NGN Amount</p>
                                        <p className="text-xl font-bold text-foreground">
                                            ₦{transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Network</p>
                                        <p className="text-base font-semibold flex items-center gap-2 capitalize">
                                            <Network className="w-4 h-4 text-primary" />
                                            {displayNetwork}
                                        </p>
                                    </div>
                                </div>
                                <div className="p-6 space-y-6">
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Exchange Rate</p>
                                        <p className="text-base font-semibold text-foreground">
                                            ₦{transaction.rate.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-muted-foreground text-sm font-normal">/ {transaction.token}</span>
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Fees</p>
                                        <p className="text-base font-semibold text-foreground">
                                            ₦{transaction.feeCollected.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Reference</p>
                                        <div className="flex items-center gap-2">
                                            <p className="font-mono text-sm break-all text-muted-foreground">
                                                {transaction.reference}
                                            </p>
                                            <button 
                                                onClick={() => handleCopy(transaction.reference, "Reference")}
                                                className="shrink-0 p-1.5 hover:bg-muted rounded-md transition-colors"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                                            {isOfframp ? "Source Address" : "Destination Address"}
                                        </p>
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
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

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
                                </div>

                                <div className="relative pl-8">
                                    <div className={`absolute left-0 top-1 w-4 h-4 rounded-full z-10 ${isPending ? "bg-primary animate-pulse shadow-[0_0_10px_rgba(var(--primary),0.6)]" : (transaction.status === "COMPLETED" ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-muted")}`} />
                                    <p className={`text-sm font-semibold ${isPending ? "text-primary" : ""}`}>Processing Quote</p>
                                    <p className="text-[10px] text-muted-foreground uppercase">{isPending ? "Directing to agents" : (transaction.status === "COMPLETED" ? "Reviewed" : "Pending review")}</p>
                                </div>

                                <div className="relative pl-8">
                                    <div className={`absolute left-0 top-1 w-4 h-4 rounded-full z-10 ${transaction.status === "COMPLETED" ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-muted"}`} />
                                    <p className={`text-sm font-semibold ${transaction.status === "COMPLETED" ? "" : "text-muted-foreground"}`}>Settlement Complete</p>
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
                                </a>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
