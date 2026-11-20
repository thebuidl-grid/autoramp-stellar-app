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
    Landmark,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { merchantApi } from "@/lib/merchant";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface MerchantTransactionsProps {
    merchantId: string;
}

type TabValue = "all" | "onramp" | "offramp" | "swap" | "transfers";

export function MerchantTransactions({ merchantId }: MerchantTransactionsProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [page, setPage] = useState(1);
    const limit = 10;
    const [activeTab, setActiveTab] = useState<TabValue>("all");

    const { data: summary } = useQuery({
        queryKey: ["merchant-transactions-summary", merchantId],
        queryFn: async () => {
            const { data } = await merchantApi.getTransactionsSummary(merchantId);
            return data;
        },
    });

    const typeFilter = activeTab === "transfers" ? "bank_transfer" : activeTab === "all" ? undefined : activeTab;

    const { data: txData, isLoading } = useQuery({
        queryKey: ["merchant-transactions-unified", merchantId, page, typeFilter],
        queryFn: async () => {
            const { data } = await merchantApi.getTransactionsUnified(merchantId, { type: typeFilter, page, limit });
            return data;
        },
    });

    const items = txData?.data || [];
    const meta = txData?.meta;

    const filtered = items.filter(
        (tx) => tx.reference?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getStatusBadge = (status: string) => {
        switch (status?.toUpperCase()) {
            case "COMPLETED":
            case "SUCCESSFUL":
                return (
                    <Badge className="bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20 flex items-center gap-1 w-fit">
                        <CheckCircle2 className="h-3 w-3" /> Completed
                    </Badge>
                );
            case "PENDING":
                return (
                    <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20 flex items-center gap-1 w-fit">
                        <Clock className="h-3 w-3" /> Pending
                    </Badge>
                );
            case "FAILED":
                return (
                    <Badge className="bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20 flex items-center gap-1 w-fit">
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
        switch (type) {
            case "onramp":
                return (
                    <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20 flex items-center gap-1 w-fit">
                        <ArrowDownLeft className="h-3 w-3" /> Onramp
                    </Badge>
                );
            case "offramp":
                return (
                    <Badge variant="secondary" className="bg-purple-500/10 text-purple-500 border-purple-500/20 hover:bg-purple-500/20 flex items-center gap-1 w-fit">
                        <ArrowUpRight className="h-3 w-3" /> Offramp
                    </Badge>
                );
            case "swap":
                return (
                    <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 hover:bg-indigo-500/20 flex items-center gap-1 w-fit">
                        <RefreshCcw className="h-3 w-3" /> Swap
                    </Badge>
                );
            case "bank_transfer":
                return (
                    <Badge variant="secondary" className="bg-orange-500/10 text-orange-500 border-orange-500/20 hover:bg-orange-500/20 flex items-center gap-1 w-fit">
                        <Landmark className="h-3 w-3" /> Transfer
                    </Badge>
                );
            default:
                return <Badge variant="outline" className="border-white/10 text-white">{type}</Badge>;
        }
    };

    const getDetails = (tx: typeof items[0]) => {
        const d = tx.details || {};
        switch (tx.type) {
            case "swap":
                return (
                    <div className="flex flex-col gap-0.5">
                        <span>{d.fromTokenType} → {d.toTokenType}</span>
                        <span className="text-[10px] opacity-70">Rate: {d.exchangeRate}</span>
                    </div>
                );
            case "offramp":
                return (
                    <div className="flex flex-col gap-0.5">
                        <span>{d.bankCode}</span>
                        <span>{d.accountNumber}</span>
                    </div>
                );
            case "bank_transfer":
                return (
                    <div className="flex flex-col gap-0.5">
                        <span>{d.beneficiaryBankCode}</span>
                        <span className="truncate max-w-[150px]">{d.narration}</span>
                    </div>
                );
            default:
                return (
                    <div className="flex flex-col gap-0.5">
                        <span>{d.network}</span>
                        <span className="truncate max-w-[150px] opacity-70">{d.destinationAddress}</span>
                    </div>
                );
        }
    };

    const getAmount = (tx: typeof items[0]) => {
        if (tx.type === "swap") {
            return (
                <div className="flex flex-col">
                    <span className="text-white">₦{tx.amount?.toLocaleString()}</span>
                    <span className="text-[10px] text-zinc-500">→ {tx.details?.toAmount} {tx.details?.toTokenType}</span>
                </div>
            );
        }
        return (
            <div className="flex flex-col">
                <span className="text-white">₦{tx.amount?.toLocaleString()}</span>
            </div>
        );
    };
    return (
        <div className="space-y-6">

            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-white/5 border-white/10 border-l-4 border-l-blue-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Onramp</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold text-white">₦{(summary?.onramp?.volume || 0).toLocaleString()}</div>
                        <p className="text-xs text-zinc-500 mt-1">
                            {summary?.onramp?.count || 0} txns
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10 border-l-4 border-l-purple-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Offramp</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold text-white">₦{(summary?.offramp?.volume || 0).toLocaleString()}</div>
                        <p className="text-xs text-zinc-500 mt-1">
                            {summary?.offramp?.count || 0} txns
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10 border-l-4 border-l-indigo-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Swap</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold text-white">₦{(summary?.swap?.volume || 0).toLocaleString()}</div>
                        <p className="text-xs text-zinc-500 mt-1">
                            {summary?.swap?.count || 0} txns
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10 border-l-4 border-l-orange-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Bank Transfer</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold text-white">₦{(summary?.bankTransfer?.volume || 0).toLocaleString()}</div>
                        <p className="text-xs text-zinc-500 mt-1">
                            {summary?.bankTransfer?.count || 0} txns
                        </p>
                    </CardContent>
                </Card>
            </div>

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
                    <Tabs defaultValue="all" className="w-full" onValueChange={(v) => { setActiveTab(v as TabValue); setPage(1); }}>
                        <TabsList className="bg-white/5 border-white/10 mb-6">
                            <TabsTrigger value="all">All</TabsTrigger>
                            <TabsTrigger value="onramp">Onramp</TabsTrigger>
                            <TabsTrigger value="offramp">Offramp</TabsTrigger>
                            <TabsTrigger value="swap">Swap</TabsTrigger>
                            <TabsTrigger value="transfers">Transfers</TabsTrigger>
                        </TabsList>

                        <TabsContent value={activeTab} className="mt-0">
                            <div className="rounded-xl border border-white/10 overflow-hidden bg-black/20">
                                <table className="w-full text-sm">
                                    <thead className="bg-white/5 border-b border-white/10 text-zinc-400">
                                        <tr>
                                            <th className="p-4 text-left font-medium">Reference</th>
                                            <th className="p-4 text-left font-medium">Type</th>
                                            <th className="p-4 text-left font-medium">Details</th>
                                            <th className="p-4 text-left font-medium">Amount</th>
                                            <th className="p-4 text-left font-medium">Status</th>
                                            <th className="p-4 text-left font-medium">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan={6} className="p-12 text-center">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                                        <p className="text-zinc-500">Loading transactions...</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : filtered.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="p-12 text-center text-zinc-500">
                                                    No transactions found for this merchant.
                                                </td>
                                            </tr>
                                        ) : (
                                            filtered.map((tx) => (
                                                <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                                    <td className="p-4 font-mono text-xs text-zinc-300">{tx.reference}</td>
                                                    <td className="p-4">{getTypeBadge(tx.type)}</td>
                                                    <td className="p-4 text-xs text-zinc-400">{getDetails(tx)}</td>
                                                    <td className="p-4 font-medium text-white">{getAmount(tx)}</td>
                                                    <td className="p-4">{getStatusBadge(tx.status)}</td>
                                                    <td className="p-4 text-zinc-500 whitespace-nowrap">
                                                        {format(new Date(tx.createdAt), "MMM d, HH:mm")}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {meta && meta.totalPages > 1 && (
                                <div className="flex items-center justify-between py-4">
                                    <p className="text-sm text-zinc-500">
                                        Page {page} of {meta.totalPages}
                                    </p>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-white/10 text-white"
                                            disabled={page === 1}
                                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        >
                                            Previous
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-white/10 text-white"
                                            disabled={page >= meta.totalPages}
                                            onClick={() => setPage((p) => p + 1)}
                                        >
                                            Next
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
