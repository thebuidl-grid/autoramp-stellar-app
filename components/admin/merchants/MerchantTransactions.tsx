"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
    CheckCircle2,
    Clock,
    XCircle,
    ArrowUpRight,
    ArrowDownLeft,
    RefreshCcw,
    Search,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, Transaction, SwapTransaction, TransactionsResponse } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface MerchantTransactionsProps {
    merchantId: string;
}

type PlatformTransaction =
    | (Transaction & { _type: "onramp" })
    | (Transaction & { _type: "offramp" })
    | (SwapTransaction & { _type: "swap" });

export function MerchantTransactions({ merchantId }: MerchantTransactionsProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [page, setPage] = useState(1);
    const limit = 10;
    const [activeTab, setActiveTab] = useState("all");

    const { data: onrampData, isLoading: isLoadingOnramp } = useQuery({
        queryKey: ["merchant-transactions-onramp", merchantId, page],
        queryFn: async () => {
            const { data } = await adminApi.getMerchantTransactionsOnramp(merchantId, page, limit);
            return data;
        },
        enabled: activeTab === "all" || activeTab === "onramp",
    });

    const { data: offrampData, isLoading: isLoadingOfframp } = useQuery({
        queryKey: ["merchant-transactions-offramp", merchantId, page],
        queryFn: async () => {
            const { data } = await adminApi.getMerchantTransactionsOfframp(merchantId, page, limit);
            return data;
        },
        enabled: activeTab === "all" || activeTab === "offramp",
    });

    const { data: swapData, isLoading: isLoadingSwap } = useQuery({
        queryKey: ["merchant-transactions-swap", merchantId, page],
        queryFn: async () => {
            const { data } = await adminApi.getMerchantTransactionsSwap(merchantId, page, limit);
            return data;
        },
        enabled: activeTab === "all" || activeTab === "swap",
    });

    const isLoading = isLoadingOnramp || isLoadingOfframp || isLoadingSwap;

    // Combine transactions based on available data
    const allTransactions: PlatformTransaction[] = [];

    if (onrampData?.onramp) {
        allTransactions.push(...onrampData.onramp.map(tx => ({ ...tx, _type: "onramp" as const })));
    }
    if (offrampData?.offramp) {
        allTransactions.push(...offrampData.offramp.map(tx => ({ ...tx, _type: "offramp" as const })));
    }
    if (swapData?.swap) {
        allTransactions.push(...swapData.swap.map(tx => ({ ...tx, _type: "swap" as const })));
    }

    const sortedTransactions = allTransactions.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const getStatusBadge = (status: string) => {
        switch (status.toUpperCase()) {
            case "COMPLETED":
                return (
                    <Badge className="bg-green-500/10 text-green-500 border-green-500/20 flex items-center gap-1 w-fit">
                        <CheckCircle2 className="h-3 w-3" /> Completed
                    </Badge>
                );
            case "PENDING":
                return (
                    <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 flex items-center gap-1 w-fit">
                        <Clock className="h-3 w-3" /> Pending
                    </Badge>
                );
            case "FAILED":
                return (
                    <Badge className="bg-red-500/10 text-red-500 border-red-500/20 flex items-center gap-1 w-fit">
                        <XCircle className="h-3 w-3" /> Failed
                    </Badge>
                );
            default:
                return (
                    <Badge variant="outline" className="border-white/10 text-white flex items-center gap-1 w-fit">
                        {status}
                    </Badge>
                );
        }
    };

    const getTypeBadge = (type: string) => {
        switch (type.toLowerCase()) {
            case "onramp":
                return (
                    <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/20 flex items-center gap-1 w-fit">
                        <ArrowDownLeft className="h-3 w-3" /> Onramp
                    </Badge>
                );
            case "offramp":
                return (
                    <Badge variant="secondary" className="bg-purple-500/10 text-purple-500 border-purple-500/20 flex items-center gap-1 w-fit">
                        <ArrowUpRight className="h-3 w-3" /> Offramp
                    </Badge>
                );
            case "swap":
                return (
                    <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 flex items-center gap-1 w-fit">
                        <RefreshCcw className="h-3 w-3" /> Swap
                    </Badge>
                );
            default:
                return <Badge variant="outline" className="border-white/10 text-white">{type}</Badge>;
        }
    };

    const filteredTransactions = sortedTransactions.filter(
        (tx) => tx.reference.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const currentResponse = activeTab === "onramp" ? onrampData : activeTab === "offramp" ? offrampData : activeTab === "swap" ? swapData : null;

    return (
        <Card className="bg-white/5 border-white/10">
            <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <CardTitle className="text-white">Transaction Logs</CardTitle>
                    <div className="relative w-full md:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                        <Input
                            placeholder="Search reference..."
                            className="pl-9 bg-white/5 border-white/10 text-white focus:ring-primary h-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="all" className="w-full" onValueChange={setActiveTab}>
                    <TabsList className="bg-white/5 border-white/10 mb-6">
                        <TabsTrigger value="all">All</TabsTrigger>
                        <TabsTrigger value="onramp">Onramp</TabsTrigger>
                        <TabsTrigger value="offramp">Offramp</TabsTrigger>
                        <TabsTrigger value="swap">Swap</TabsTrigger>
                    </TabsList>

                    {["all", "onramp", "offramp", "swap"].map((tab) => (
                        <TabsContent key={tab} value={tab} className="mt-0">
                            <div className="rounded-xl border border-white/10 overflow-hidden bg-black/20">
                                <table className="w-full text-sm">
                                    <thead className="bg-white/5 border-b border-white/10 text-zinc-400">
                                        <tr>
                                            <th className="p-4 text-left font-medium">Reference</th>
                                            <th className="p-4 text-left font-medium">Type</th>
                                            <th className="p-4 text-left font-medium">Amount</th>
                                            <th className="p-4 text-left font-medium">Status</th>
                                            <th className="p-4 text-left font-medium">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan={5} className="p-12 text-center">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                                        <p className="text-zinc-500">Loading transactions...</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : filteredTransactions.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="p-12 text-center text-zinc-500">
                                                    No transactions found for this merchant.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredTransactions
                                                .filter(tx => tab === "all" || tx._type === tab)
                                                .map((tx) => (
                                                    <tr key={tx.id} className="hover:bg-white/5 transition-colors group">
                                                        <td className="p-4 font-mono text-xs text-zinc-300">
                                                            {tx.reference}
                                                        </td>
                                                        <td className="p-4">
                                                            {getTypeBadge(tx._type || "unknown")}
                                                        </td>
                                                        <td className="p-4 font-medium text-white">
                                                            {tx._type === "swap" ? (
                                                                <span className="flex items-center gap-1">
                                                                    {tx.fromAmount} {tx.fromTokenType}
                                                                    <RefreshCcw className="h-3 w-3 text-zinc-500" />
                                                                    {tx.toAmount} {tx.toTokenType}
                                                                </span>
                                                            ) : (
                                                                `₦${Number(tx.amount || tx.fiatAmount || 0).toLocaleString()}`
                                                            )}
                                                        </td>
                                                        <td className="p-4">
                                                            {getStatusBadge(tx.status)}
                                                        </td>
                                                        <td className="p-4 text-zinc-500">
                                                            {format(new Date(tx.createdAt), "MMM d, HH:mm")}
                                                        </td>
                                                    </tr>
                                                ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {currentResponse && currentResponse.totalPages > 1 && (
                                <div className="flex items-center justify-between py-4">
                                    <p className="text-sm text-zinc-500">
                                        Page {page} of {currentResponse.totalPages}
                                    </p>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-white/10 text-white"
                                            disabled={page === 1}
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                        >
                                            Previous
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-white/10 text-white"
                                            disabled={page >= currentResponse.totalPages}
                                            onClick={() => setPage(p => p + 1)}
                                        >
                                            Next
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </TabsContent>
                    ))}
                </Tabs>
            </CardContent>
        </Card>
    );
}
