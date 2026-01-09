"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
    History,
    Search,
    Filter,
    ArrowUpRight,
    ArrowDownLeft,
    RefreshCcw,
    CheckCircle2,
    Clock,
    XCircle,
    Activity,
    TrendingUp,
    AlertCircle
} from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { adminApi, Transaction, SwapTransaction } from "@/lib/api";
import { TransactionsOverview } from "@/components/admin/transactions/TransactionsOverview";

type PlatformTransaction = (Transaction | SwapTransaction) & { _type?: string; userEmail?: string };

export default function AdminTransactionsPage() {
    const [searchTerm, setSearchTerm] = useState("");
    const [page, setPage] = useState(1);
    const limit = 10;
    const [statusFilter, setStatusFilter] = useState<string>("all");

    const { data: transactionsResponse, isLoading } = useQuery({
        queryKey: ["admin-transactions", page, statusFilter],
        queryFn: async () => {
            const status = statusFilter === "all" ? undefined : statusFilter;
            const { data } = await adminApi.getTransactions(page, limit, status);
            return data;
        },
    });

    const { data: summary } = useQuery({
        queryKey: ["admin-transactions-summary"],
        queryFn: async () => {
            const { data } = await adminApi.getTransactionsSummary();
            return data;
        },
    });

    // Combine all transactions into a single list for the "All" tab
    const allTransactions: PlatformTransaction[] = transactionsResponse ? [
        ...transactionsResponse.onramp.map(tx => ({ ...tx, _type: 'onramp' })),
        ...transactionsResponse.offramp.map(tx => ({ ...tx, _type: 'offramp' })),
        ...transactionsResponse.swap.map(tx => ({ ...tx, _type: 'swap' }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : [];

    const getStatusBadge = (status: string) => {
        switch (status.toUpperCase()) {
            case "COMPLETED":
                return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 flex items-center gap-1 w-fit"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>;
            case "PENDING":
                return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 flex items-center gap-1 w-fit"><Clock className="h-3 w-3" /> Pending</Badge>;
            case "FAILED":
                return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 flex items-center gap-1 w-fit"><XCircle className="h-3 w-3" /> Failed</Badge>;
            default:
                return <Badge variant="outline" className="flex items-center gap-1 w-fit">{status}</Badge>;
        }
    };

    const getTypeBadge = (type: string) => {
        switch (type.toLowerCase()) {
            case "onramp":
                return <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100 flex items-center gap-1 w-fit"><ArrowDownLeft className="h-3 w-3" /> Onramp</Badge>;
            case "offramp":
                return <Badge variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-100 flex items-center gap-1 w-fit"><ArrowUpRight className="h-3 w-3" /> Offramp</Badge>;
            case "swap":
                return <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1 w-fit"><RefreshCcw className="h-3 w-3" /> Swap</Badge>;
            default:
                return <Badge variant="outline">{type}</Badge>;
        }
    };

    const filteredTransactions = allTransactions.filter(tx =>
        tx.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tx.userEmail && tx.userEmail.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Transactions Oversight</h1>
                <p className="text-muted-foreground">
                    Monitor and manage all platform-wide onramp, offramp, and swap transactions.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Platform Volume</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">₦{summary?.totalVolume.toLocaleString() || "0"}</div>
                        <p className="text-xs text-muted-foreground">Processed across all time</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Requests</CardTitle>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary?.totalCount || 0}</div>
                        <p className="text-xs text-muted-foreground">Total platform transactions</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary?.successRate || 0}%</div>
                        <p className="text-xs text-muted-foreground">Aggregated across all types</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Value</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">₦{summary?.averageValue?.toLocaleString() || "0"}</div>
                        <p className="text-xs text-muted-foreground">Per completed transaction</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-l-4 border-l-blue-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Onramp Volume</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">₦{summary?.onrampCompletedVolume?.toLocaleString() || "0"}</div>
                        <p className="text-xs text-muted-foreground mt-1">{summary?.onrampCompletedCount || 0} completed</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-purple-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Offramp Volume</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">₦{summary?.offrampCompletedVolume?.toLocaleString() || "0"}</div>
                        <p className="text-xs text-muted-foreground mt-1">{summary?.offrampCompletedCount || 0} completed</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-indigo-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Swap Volume</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">₦{summary?.swapCompletedVolume?.toLocaleString() || "0"}</div>
                        <p className="text-xs text-muted-foreground mt-1">{summary?.swapCompletedCount || 0} completed</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-red-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-red-500">Unsuccessful</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold text-red-600">₦{summary?.unsuccessfulVolume?.toLocaleString() || "0"}</div>
                        <p className="text-xs text-muted-foreground mt-1">{summary?.unsuccessfulCount || 0} not completed</p>
                    </CardContent>
                </Card>
            </div>

            <TransactionsOverview />

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Global Transactions Log</CardTitle>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="search"
                                    placeholder="Search ref or user..."
                                    className="w-[200px] lg:w-[300px] pl-8 h-9"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
                                <SelectTrigger className="w-[150px] h-9">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="COMPLETED">Completed</SelectItem>
                                    <SelectItem value="PENDING">Pending</SelectItem>
                                    <SelectItem value="PROCESSING">Processing</SelectItem>
                                    <SelectItem value="FAILED">Failed</SelectItem>
                                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="all" className="w-full">
                        <TabsList className="mb-4">
                            <TabsTrigger value="all">All</TabsTrigger>
                            <TabsTrigger value="onramp">Onramp</TabsTrigger>
                            <TabsTrigger value="offramp">Offramp</TabsTrigger>
                            <TabsTrigger value="swap">Swap</TabsTrigger>
                        </TabsList>

                        {["all", "onramp", "offramp", "swap"].map((tab) => (
                            <TabsContent key={tab} value={tab}>
                                <div className="rounded-md border overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/50 border-b">
                                            <tr>
                                                <th className="p-4 text-left font-medium">Reference</th>
                                                <th className="p-4 text-left font-medium">User</th>
                                                <th className="p-4 text-left font-medium">Type</th>
                                                <th className="p-4 text-left font-medium">Amount</th>
                                                <th className="p-4 text-left font-medium">Status</th>
                                                <th className="p-4 text-left font-medium">Date</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {isLoading ? (
                                                <tr>
                                                    <td colSpan={6} className="p-8 text-center text-muted-foreground animate-pulse">
                                                        Loading transactions...
                                                    </td>
                                                </tr>
                                            ) : filteredTransactions.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                                        No transactions found.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredTransactions
                                                    .filter(tx => tab === "all" || tx._type === tab)
                                                    .map((tx) => (
                                                        <tr key={tx.id} className="border-b hover:bg-muted/50 transition-colors">
                                                            <td className="p-4 font-mono text-xs">{tx.reference}</td>
                                                            <td className="p-4">{tx.userEmail || "System"}</td>
                                                            <td className="p-4">{getTypeBadge(tx._type || "unknown")}</td>
                                                            <td className="p-4 font-medium">
                                                                {tx._type === "swap"
                                                                    ? `${(tx as SwapTransaction).fromAmount} ${(tx as SwapTransaction).fromTokenType} → ${(tx as SwapTransaction).toAmount} ${(tx as SwapTransaction).toTokenType}`
                                                                    : `₦${Number(tx.amount).toLocaleString()}`}
                                                            </td>
                                                            <td className="p-4">{getStatusBadge(tx.status)}</td>
                                                            <td className="p-4 text-muted-foreground">
                                                                {format(new Date(tx.createdAt), "MMM d, HH:mm")}
                                                            </td>
                                                        </tr>
                                                    ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </TabsContent>
                        ))}
                    </Tabs>

                    {transactionsResponse && transactionsResponse.totalPages > 1 && (
                        <div className="flex items-center justify-end space-x-2 py-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                            >
                                Previous
                            </Button>
                            <div className="text-sm font-medium">
                                Page {page} of {transactionsResponse.totalPages}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.min(transactionsResponse.totalPages, p + 1))}
                                disabled={page === transactionsResponse.totalPages}
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
