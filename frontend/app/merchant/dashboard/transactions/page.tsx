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
  TrendingUp,
  Activity,
  AlertCircle,
  Landmark,
  Loader2
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMerchantStatus } from "@/lib/hooks";
import { merchantApi } from "@/lib/merchant";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type TabValue = "all" | "onramp" | "offramp" | "swap" | "transfers";

export default function MerchantTransactionsPage() {
  const { data: status } = useMerchantStatus();
  const merchantId = status?.merchantId || null;
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const limit = 10;
  const [activeTab, setActiveTab] = useState<TabValue>("all");

  const { data: summary } = useQuery({
    queryKey: ["merchant-transactions-summary", merchantId],
    queryFn: async () => {
      if (!merchantId) return null;
      const { data } = await merchantApi.getTransactionsSummary(merchantId);
      return data;
    },
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000,
  });

  const typeFilter = activeTab === "transfers" ? "bank_transfer" : activeTab === "all" ? undefined : activeTab;

  const { data: txData, isLoading } = useQuery({
    queryKey: ["merchant-transactions-unified", merchantId, page, typeFilter],
    queryFn: async () => {
      if (!merchantId) return null;
      const { data } = await merchantApi.getTransactionsUnified(merchantId, { type: typeFilter, page, limit });
      return data;
    },
    enabled: !!merchantId,
    staleTime: 60 * 1000,
  });

  const items = txData?.data || [];
  const meta = txData?.meta;

  const filtered = items.filter(
    (tx) => tx.reference?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalVolume = (summary?.onramp?.totalAmount || 0) + (summary?.offramp?.totalAmount || 0) + (summary?.swap?.totalFromAmount || 0) + (summary?.bankTransfer?.totalAmount || 0);
  const totalCount = (summary?.onramp?.count || 0) + (summary?.offramp?.count || 0) + (summary?.swap?.count || 0) + (summary?.bankTransfer?.count || 0);

  if (!merchantId && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 bg-white/5 border border-white/10 rounded-xl">
        <AlertCircle className="h-12 w-12 text-zinc-500" />
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-white">Merchant Record Not Found</h1>
          <p className="text-zinc-500 max-w-sm">
            We couldn't retrieve your merchant details. Please make sure your onboarding is complete.
          </p>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case "COMPLETED":
      case "SUCCESSFUL":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20 flex items-center gap-1 w-fit">
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
          <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20 flex items-center gap-1 w-fit">
            <XCircle className="h-3 w-3" /> Failed
          </Badge>
        );
      case "REJECTED":
      case "REVERSED":
        return (
          <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20 flex items-center gap-1 w-fit">
            <XCircle className="h-3 w-3" /> {status?.toUpperCase() === "REVERSED" ? "Reversed" : "Rejected"}
          </Badge>
        );
      case "EXPIRED":
        return (
          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20 flex items-center gap-1 w-fit">
            <Clock className="h-3 w-3" /> Expired
          </Badge>
        );
      case "PARTIAL":
        return (
          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20 flex items-center gap-1 w-fit">
            <AlertCircle className="h-3 w-3" /> Partial
          </Badge>
        );
      case "REFUNDED":
        return (
          <Badge className="bg-gray-500/10 text-gray-400 border-gray-500/20 hover:bg-gray-500/20 flex items-center gap-1 w-fit">
            <RefreshCcw className="h-3 w-3" /> Refunded
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
        return <Badge variant="outline" className="border-white/10 text-white text-[10px]">{type}</Badge>;
    }
  };

  const getDetails = (tx: typeof items[0]) => {
    const d = tx.details || {};
    switch (tx.type) {
      case "swap":
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-zinc-200">{d.fromTokenType} → {d.toTokenType}</span>
            <span className="text-[10px] opacity-60">Rate: {d.exchangeRate}</span>
          </div>
        );
      case "offramp":
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-zinc-200">{d.bankCode}</span>
            <span className="opacity-60">{d.accountNumber}</span>
          </div>
        );
      case "bank_transfer":
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-zinc-200">{d.beneficiaryBankCode}</span>
            <span className="truncate max-w-[150px] opacity-60">{d.narration}</span>
          </div>
        );
      default:
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-zinc-200">{d.network}</span>
            <span className="truncate max-w-[150px] opacity-60">{d.destinationAddress}</span>
          </div>
        );
    }
  };

  const getAmount = (tx: typeof items[0]) => {
    if (tx.type === "swap") {
      return (
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-white">₦{tx.amount?.toLocaleString()}</span>
          <span className="text-[10px] text-emerald-400/80">→ {tx.details?.toAmount} {tx.details?.toTokenType}</span>
        </div>
      );
    }
    return (
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-white">₦{tx.amount?.toLocaleString()}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Transactions</h1>
          <p className="text-zinc-400">
            View and manage your transaction history and performance metrics.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white/5 border-white/10 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total Volume</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">₦{totalVolume.toLocaleString()}</div>
            <p className="text-[10px] text-zinc-500 mt-1">Total combined volume</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total Count</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{totalCount}</div>
            <p className="text-[10px] text-zinc-500 mt-1">All transaction types</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Bank Transfers</CardTitle>
            <Landmark className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">₦{summary?.bankTransfer?.totalAmount?.toLocaleString() || "0"}</div>
            <p className="text-[10px] text-zinc-500 mt-1">{summary?.bankTransfer?.count || 0} completed</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Swap Volume</CardTitle>
            <RefreshCcw className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">₦{summary?.swap?.totalFromAmount?.toLocaleString() || "0"}</div>
            <p className="text-[10px] text-zinc-500 mt-1">{summary?.swap?.count || 0} completed</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white/5 border-white/10 backdrop-blur-md border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Onramp Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-white">₦{summary?.onramp?.totalAmount?.toLocaleString() || "0"}</div>
            <p className="text-xs text-zinc-500 mt-1">{summary?.onramp?.count || 0} completed</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10 backdrop-blur-md border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Offramp Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-white">₦{summary?.offramp?.totalAmount?.toLocaleString() || "0"}</div>
            <p className="text-xs text-zinc-500 mt-1">{summary?.offramp?.count || 0} completed</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10 backdrop-blur-md border-l-4 border-l-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Bank Transfer Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-white">₦{summary?.bankTransfer?.totalAmount?.toLocaleString() || "0"}</div>
            <p className="text-xs text-zinc-500 mt-1">{summary?.bankTransfer?.count || 0} completed</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/5 border-white/10 backdrop-blur-md overflow-hidden">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="text-white">Transaction Logs</CardTitle>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Search by reference..."
                className="pl-9 bg-black/20 border-white/10 text-white focus:ring-primary h-9 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="w-full" onValueChange={(v) => { setActiveTab(v as TabValue); setPage(1); }}>
            <TabsList className="bg-black/20 border-white/10 mb-6 p-1">
              <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-black transition-all">All</TabsTrigger>
              <TabsTrigger value="onramp" className="data-[state=active]:bg-primary data-[state=active]:text-black transition-all">Onramp</TabsTrigger>
              <TabsTrigger value="offramp" className="data-[state=active]:bg-primary data-[state=active]:text-black transition-all">Offramp</TabsTrigger>
              <TabsTrigger value="swap" className="data-[state=active]:bg-primary data-[state=active]:text-black transition-all">Swap</TabsTrigger>
              <TabsTrigger value="transfers" className="data-[state=active]:bg-primary data-[state=active]:text-black transition-all">Transfers</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-0">
              <div className="rounded-xl border border-white/10 overflow-hidden bg-black/20 backdrop-blur-sm">
                <div className="overflow-x-auto">
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
                            <div className="flex flex-col items-center gap-3">
                              <Loader2 className="h-8 w-8 text-primary animate-spin" />
                              <p className="text-zinc-500 animate-pulse">Fetching records...</p>
                            </div>
                          </td>
                        </tr>
                      ) : filtered.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-12 text-center text-zinc-500 italic">
                            No transaction history found.
                          </td>
                        </tr>
                      ) : (
                        filtered.map((tx) => (
                          <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                            <td className="p-4 font-mono text-[11px] text-zinc-400">{tx.reference}</td>
                            <td className="p-4">{getTypeBadge(tx.type)}</td>
                            <td className="p-4 text-[11px] text-zinc-400">{getDetails(tx)}</td>
                            <td className="p-4">{getAmount(tx)}</td>
                            <td className="p-4">{getStatusBadge(tx.status)}</td>
                            <td className="p-4 text-zinc-500 whitespace-nowrap text-[11px]">
                              {format(new Date(tx.createdAt), "MMM d, HH:mm")}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {meta && meta.totalPages > 1 && (
                <div className="flex items-center justify-between py-4">
                  <p className="text-xs text-zinc-500">
                    Page <span className="text-white font-medium">{page}</span> of <span className="text-white font-medium">{meta.totalPages}</span>
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/10 text-white h-8 text-[11px] hover:bg-white/5"
                      disabled={page === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/10 text-white h-8 text-[11px] hover:bg-white/5"
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
