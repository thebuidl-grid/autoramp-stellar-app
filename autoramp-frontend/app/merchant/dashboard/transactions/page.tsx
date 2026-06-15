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
  Loader2
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMerchantStatus } from "@/lib/hooks";
import { Transaction, SwapTransaction } from "@/lib/api";
import { merchantApi } from "@/lib/merchant";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type PlatformTransaction =
  | (Transaction & { _type: "onramp"; userEmail?: string })
  | (Transaction & { _type: "offramp"; userEmail?: string })
  | (SwapTransaction & { _type: "swap"; userEmail?: string });

export default function MerchantTransactionsPage() {
  const { data: status } = useMerchantStatus();
  const merchantId = status?.merchantId || null;
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const limit = 10;
  const [activeTab, setActiveTab] = useState("all");
  const { toast } = useToast();

  const { data: onrampData, isLoading: isLoadingOnramp } = useQuery({
    queryKey: ["merchant-transactions-onramp", merchantId, page],
    queryFn: async () => {
      if (!merchantId) return null;
      const { data } = await merchantApi.getTransactionsOnramp(merchantId, page, limit);
      return data;
    },
    enabled: !!merchantId && (activeTab === "all" || activeTab === "onramp"),
    staleTime: 60 * 1000, // 1 minute
  });

  const { data: offrampData, isLoading: isLoadingOfframp } = useQuery({
    queryKey: ["merchant-transactions-offramp", merchantId, page],
    queryFn: async () => {
      if (!merchantId) return null;
      const { data } = await merchantApi.getTransactionsOfframp(merchantId, page, limit);
      return data;
    },
    enabled: !!merchantId && (activeTab === "all" || activeTab === "offramp"),
    staleTime: 60 * 1000, // 1 minute
  });

  const { data: swapData, isLoading: isLoadingSwap } = useQuery({
    queryKey: ["merchant-transactions-swap", merchantId, page],
    queryFn: async () => {
      if (!merchantId) return null;
      const { data } = await merchantApi.getTransactionsSwap(merchantId, page, limit);
      return data;
    },
    enabled: !!merchantId && (activeTab === "all" || activeTab === "swap"),
    staleTime: 60 * 1000, // 1 minute
  });

  const { data: summary, isLoading: isLoadingSummary } = useQuery({
    queryKey: ["merchant-transactions-summary", merchantId],
    queryFn: async () => {
      if (!merchantId) return null;
      const { data } = await merchantApi.getTransactionsSummary(merchantId);
      return data;
    },
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const isLoading = (!!status && !merchantId) || isLoadingOnramp || isLoadingOfframp || isLoadingSwap;

  // Combine transactions based on available data
  const allTransactions: PlatformTransaction[] = [];

  if (onrampData?.data) {
    allTransactions.push(...onrampData.data.map((tx: any) => ({ ...tx, _type: "onramp" as const })));
  }
  if (offrampData?.data) {
    allTransactions.push(...offrampData.data.map((tx: any) => ({ ...tx, _type: "offramp" as const })));
  }
  if (swapData?.data) {
    allTransactions.push(...swapData.data.map((tx: any) => ({ ...tx, _type: "swap" as const })));
  }

  const sortedTransactions = allTransactions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case "COMPLETED":
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
          <Badge
            variant="secondary"
            className="bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20 flex items-center gap-1 w-fit"
          >
            <ArrowDownLeft className="h-3 w-3" /> Onramp
          </Badge>
        );
      case "offramp":
        return (
          <Badge
            variant="secondary"
            className="bg-purple-500/10 text-purple-500 border-purple-500/20 hover:bg-purple-500/20 flex items-center gap-1 w-fit"
          >
            <ArrowUpRight className="h-3 w-3" /> Offramp
          </Badge>
        );
      case "swap":
        return (
          <Badge
            variant="secondary"
            className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 hover:bg-indigo-500/20 flex items-center gap-1 w-fit"
          >
            <RefreshCcw className="h-3 w-3" /> Swap
          </Badge>
        );
      default:
        return <Badge variant="outline" className="border-white/10 text-white text-[10px]">{type}</Badge>;
    }
  };

  const filteredTransactions = sortedTransactions.filter(
    (tx) => tx.reference.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentResponse = activeTab === "onramp" ? onrampData : activeTab === "offramp" ? offrampData : activeTab === "swap" ? swapData : null;

  if (!merchantId && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 bg-white/5 border border-white/10 rounded-xl">
        <AlertCircle className="h-12 w-12 text-zinc-500" />
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-white">Merchant Record Not Found</h1>
          <p className="text-zinc-500 max-w-sm">
            We couldn't retrieve your merchant details. please make sure your onboarding is complete.
          </p>
        </div>
      </div>
    );
  }

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
            <div className="text-2xl font-bold text-white">
              ₦{summary?.totalVolume?.toLocaleString() || "0"}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">Total combined volume</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total Count</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{summary?.totalCount || 0}</div>
            <p className="text-[10px] text-zinc-500 mt-1">All transaction types</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Success Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{summary?.successRate || 0}%</div>
            <p className="text-[10px] text-zinc-500 mt-1">Completed vs Total</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Unsuccessful</CardTitle>
            <AlertCircle className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-500">{summary?.unsuccessfulCount || 0}</div>
            <p className="text-[10px] text-zinc-500 mt-1">Failed or cancelled</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/5 border-white/10 backdrop-blur-md overflow-hidden">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="text-white">Activity Logs</CardTitle>
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
          <Tabs defaultValue="all" className="w-full" onValueChange={setActiveTab}>
            <TabsList className="bg-black/20 border-white/10 mb-6 p-1">
              <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-black transition-all">All</TabsTrigger>
              <TabsTrigger value="onramp" className="data-[state=active]:bg-primary data-[state=active]:text-black transition-all">Onramp</TabsTrigger>
              <TabsTrigger value="offramp" className="data-[state=active]:bg-primary data-[state=active]:text-black transition-all">Offramp</TabsTrigger>
              <TabsTrigger value="swap" className="data-[state=active]:bg-primary data-[state=active]:text-black transition-all">Swap</TabsTrigger>
            </TabsList>

            {["all", "onramp", "offramp", "swap"].map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-0">
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
                        ) : filteredTransactions.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-12 text-center text-zinc-500 italic">
                              No transaction history found.
                            </td>
                          </tr>
                        ) : (
                          filteredTransactions
                            .filter(tx => tab === "all" || tx._type === tab)
                            .map((tx) => (
                              <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                                <td className="p-4 font-mono text-[11px] text-zinc-400">
                                  {tx.reference}
                                </td>
                                <td className="p-4">
                                  {getTypeBadge(tx._type || "unknown")}
                                </td>
                                <td className="p-4 text-[11px] text-zinc-400">
                                  {tx._type === "swap" ? (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-zinc-200">{tx.fromNetwork} → {tx.toNetwork}</span>
                                      <span className="truncate max-w-[150px] opacity-60">{tx.destinationAddress}</span>
                                    </div>
                                  ) : tx._type === "offramp" ? (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-zinc-200">{tx.bankName || tx.bankCode}</span>
                                      <span className="opacity-60">{tx.accountNumber}</span>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-zinc-200">{tx.network}</span>
                                      <span className="truncate max-w-[150px] opacity-60">{tx.destinationAddress}</span>
                                    </div>
                                  )}
                                </td>
                                <td className="p-4">
                                  {tx._type === "swap" ? (
                                    <div className="flex flex-col">
                                      <span className="text-sm font-semibold text-white">{tx.fromAmount} {tx.fromTokenType}</span>
                                      <span className="text-[10px] text-emerald-400/80">≈ {tx.toAmount} {tx.toTokenType}</span>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col">
                                      <span className="text-sm font-semibold text-white">₦{Number(tx.amount).toLocaleString()}</span>
                                      {tx.tokenAmount && (
                                        <span className="text-[10px] text-zinc-500">{tx.tokenAmount} {tx.tokenType || "CNGN"}</span>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="p-4">
                                  {getStatusBadge(tx.status)}
                                </td>
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

                {currentResponse && currentResponse.totalPages > 1 && (
                  <div className="flex items-center justify-between py-4">
                    <p className="text-xs text-zinc-500">
                      Page <span className="text-white font-medium">{page}</span> of <span className="text-white font-medium">{currentResponse.totalPages}</span>
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/10 text-white h-8 text-[11px] hover:bg-white/5"
                        disabled={page === 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/10 text-white h-8 text-[11px] hover:bg-white/5"
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
    </div>
  );
}
