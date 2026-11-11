"use client";

import { useState, useRef, useCallback } from "react";
import { format } from "date-fns";
import {
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCcw,
  CheckCircle2,
  Clock,
  XCircle,
  Activity,
  Handshake,
  Building2,
  Banknote,
  Zap,
  TrendingUp,
  Wallet,
  AlertTriangle,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { adminApi, AdminPlatformTransactionsResponse } from "@/lib/api";
import { TransactionsOverview } from "@/components/admin/transactions/TransactionsOverview";
import { useDebounce } from "@/lib/hooks/use-debounce";

type TabType = "all" | "onramp" | "offramp" | "swap" | "otc" | "bank_transfer" | "vas" | "merchant";
type SummaryPeriod = "today" | "7d" | "30d" | "90d" | "all";

export default function AdminTransactionsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [summaryPeriod, setSummaryPeriod] = useState<SummaryPeriod>("all");
  const txTableRef = useRef<HTMLDivElement>(null);
  const limit = 10;

  const debouncedSearch = useDebounce(searchTerm, 400);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-transactions", page, statusFilter, activeTab, debouncedSearch],
    queryFn: async () => {
      const { data } = await adminApi.getTransactions(
        page,
        limit,
        statusFilter === "all" ? undefined : statusFilter,
        activeTab === "all" ? undefined : activeTab,
        debouncedSearch || undefined,
      );
      return data;
    },
  });

  const { data: summary } = useQuery({
    queryKey: ["admin-transactions-summary", summaryPeriod],
    queryFn: async () => {
      const { data } = await adminApi.getTransactionsSummary(summaryPeriod);
      return data;
    },
  });

  const handleTabChange = (val: string) => {
    setActiveTab(val as TabType);
    setPage(1);
  };

  const handleTileClick = useCallback((tab: TabType) => {
    setActiveTab(tab);
    setPage(1);
    setTimeout(() => {
      txTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case "COMPLETED":
        return (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 flex items-center gap-1 w-fit">
            <CheckCircle2 className="h-3 w-3" /> Completed
          </Badge>
        );
      case "PENDING":
        return (
          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 flex items-center gap-1 w-fit">
            <Clock className="h-3 w-3" /> Pending
          </Badge>
        );
      case "FAILED":
        return (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100 flex items-center gap-1 w-fit">
            <XCircle className="h-3 w-3" /> Failed
          </Badge>
        );
      case "REJECTED":
      case "REVERSED":
        return (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100 flex items-center gap-1 w-fit">
            <XCircle className="h-3 w-3" /> {status.toUpperCase() === "REVERSED" ? "Reversed" : "Rejected"}
          </Badge>
        );
      case "EXPIRED":
        return (
          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 flex items-center gap-1 w-fit">
            <Clock className="h-3 w-3" /> Expired
          </Badge>
        );
      case "PARTIAL":
        return (
          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 flex items-center gap-1 w-fit">
            <AlertTriangle className="h-3 w-3" /> Partial
          </Badge>
        );
      case "REFUNDED":
        return (
          <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100 flex items-center gap-1 w-fit">
            <RefreshCcw className="h-3 w-3" /> Refunded
          </Badge>
        );
      default:
        return <Badge variant="outline" className="flex items-center gap-1 w-fit">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "onramp":
        return (
          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 flex items-center gap-1 w-fit">
            <ArrowDownLeft className="h-3 w-3" /> Onramp
          </Badge>
        );
      case "offramp":
        return (
          <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 flex items-center gap-1 w-fit">
            <ArrowUpRight className="h-3 w-3" /> Offramp
          </Badge>
        );
      case "swap":
        return (
          <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1 w-fit">
            <RefreshCcw className="h-3 w-3" /> Swap
          </Badge>
        );
      case "otc":
        return (
          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 flex items-center gap-1 w-fit">
            <Handshake className="h-3 w-3" /> OTC
          </Badge>
        );
      case "merchant_onramp":
        return (
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1 w-fit">
            <Building2 className="h-3 w-3" /> Merchant Onramp
          </Badge>
        );
      case "merchant_offramp":
        return (
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1 w-fit">
            <Building2 className="h-3 w-3" /> Merchant Offramp
          </Badge>
        );
      case "merchant_swap":
        return (
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1 w-fit">
            <Building2 className="h-3 w-3" /> Merchant Swap
          </Badge>
        );
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions Oversight</h1>
          <p className="text-muted-foreground">
            Monitor and manage all platform-wide onramp, offramp, and swap transactions.
          </p>
        </div>
        <Select value={summaryPeriod} onValueChange={(v) => setSummaryPeriod(v as SummaryPeriod)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All time" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="90d">Last 90 Days</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Volume</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₦{(summary?.netVolume || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Onramp minus Offramp</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(summary?.totalCount || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Success rate: {summary?.successRate || 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Fees Collected</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₦{(summary?.fees?.total || 0).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₦{(summary?.totalVolume || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Across all types</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-l-4 border-l-blue-500 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleTileClick("onramp")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Onramp</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">₦{(summary?.onramp?.totalAmount || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.onramp?.count || 0} txns · ₦{(summary?.onramp?.totalFees || 0).toLocaleString()} fees
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleTileClick("offramp")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Offramp</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">₦{(summary?.offramp?.totalAmount || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.offramp?.count || 0} txns · ₦{(summary?.offramp?.totalFees || 0).toLocaleString()} fees
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-indigo-500 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleTileClick("swap")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Swap</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">₦{(summary?.swap?.totalFromAmount || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.swap?.count || 0} txns · ₦{(summary?.swap?.totalFees || 0).toLocaleString()} fees
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleTileClick("bank_transfer")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Bank Transfer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">₦{(summary?.bankTransfer?.totalAmount || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.bankTransfer?.count || 0} txns · ₦{(summary?.bankTransfer?.totalFees || 0).toLocaleString()} fees
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleTileClick("otc")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">OTC</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">₦{(summary?.otc?.totalAmount || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.otc?.count || 0} txns · ₦{(summary?.otc?.totalFees || 0).toLocaleString()} fees
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-cyan-500 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleTileClick("vas")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">VAS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">₦{(summary?.vas?.totalAmount || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.vas?.count || 0} txns · ₦{(summary?.vas?.totalFees || 0).toLocaleString()} fees
            </p>
          </CardContent>
        </Card>
      </div>

      {summary?.fees && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Fee Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Provider Fee</p>
                <p className="text-lg font-bold">₦{(summary.fees.provider_fee || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">VAT</p>
                <p className="text-lg font-bold">₦{(summary.fees.vat || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Stamp Duty</p>
                <p className="text-lg font-bold">₦{(summary.fees.stamp_duty || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Fees</p>
                <p className="text-lg font-bold text-green-600">₦{(summary.fees.total || 0).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <TransactionsOverview />

      <div ref={txTableRef} className="scroll-mt-4">
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
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
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
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="onramp">Onramp</TabsTrigger>
              <TabsTrigger value="offramp">Offramp</TabsTrigger>
              <TabsTrigger value="swap">Swap</TabsTrigger>
              <TabsTrigger value="otc">OTC</TabsTrigger>
              <TabsTrigger value="bank_transfer">Bank Transfer</TabsTrigger>
              <TabsTrigger value="vas">VAS</TabsTrigger>
              <TabsTrigger value="merchant">Merchant</TabsTrigger>
            </TabsList>
          </Tabs>

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
                ) : !data?.data?.length ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No transactions found.
                    </td>
                  </tr>
                ) : (
                  data.data.map((tx) => (
                    <tr key={tx.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="p-4 font-mono text-xs">{tx.reference}</td>
                      <td className="p-4">{tx.user ?? tx.merchant ?? "System"}</td>
                      <td className="p-4">{getTypeBadge(tx.type)}</td>
                      <td className="p-4 font-medium">₦{tx.amount.toLocaleString()}</td>
                      <td className="p-4">{getStatusBadge(tx.status)}</td>
                      <td className="p-4 text-muted-foreground">{format(new Date(tx.createdAt), "MMM d, HH:mm")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data?.pagination && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-end space-x-2 py-4">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <div className="text-sm font-medium">Page {page} of {data.pagination.totalPages} ({data.pagination.total} total)</div>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))} disabled={page === data.pagination.totalPages}>
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
