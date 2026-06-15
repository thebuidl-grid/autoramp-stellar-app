"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
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
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { useDebounce } from "@/lib/hooks/use-debounce";
import Link from "next/link";

export default function AdminTransferLogsPage() {
  const [page, setPage] = useState(1);
  const [transactionId, setTransactionId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const limit = 10;

  const debouncedTransactionId = useDebounce(transactionId, 400);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-transfer-logs", page, statusFilter, debouncedTransactionId, startDate, endDate],
    queryFn: async () => {
      const { data } = await adminApi.getTransferLogs(
        page,
        limit,
        debouncedTransactionId || undefined,
        statusFilter === "all" ? undefined : statusFilter,
        startDate || undefined,
        endDate || undefined,
      );
      return data;
    },
  });

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
      default:
        return <Badge variant="outline" className="flex items-center gap-1 w-fit">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "ONRAMP":
        return (
          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 flex items-center gap-1 w-fit">
            <ArrowDownLeft className="h-3 w-3" /> Onramp
          </Badge>
        );
      case "OFFRAMP":
        return (
          <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 flex items-center gap-1 w-fit">
            <ArrowUpRight className="h-3 w-3" /> Offramp
          </Badge>
        );
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Transfer Logs</h1>
        <p className="text-muted-foreground">
          View SafeHaven and Stablestack transfer logs across all transactions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Transfer Logs</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search transaction ID..."
                  className="w-[200px] lg:w-[250px] pl-8 h-9"
                  value={transactionId}
                  onChange={(e) => { setTransactionId(e.target.value); setPage(1); }}
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
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                className="w-[150px] h-9"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                placeholder="Start date"
              />
              <Input
                type="date"
                className="w-[150px] h-9"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                placeholder="End date"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="p-4 text-left font-medium">Transaction ID</th>
                  <th className="p-4 text-left font-medium">Type</th>
                  <th className="p-4 text-left font-medium">Status</th>
                  <th className="p-4 text-left font-medium">Created</th>
                  <th className="p-4 text-left font-medium">Updated</th>
                  <th className="p-4 text-left font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground animate-pulse">
                      Loading transfer logs...
                    </td>
                  </tr>
                ) : !data?.logs?.length ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No transfer logs found.
                    </td>
                  </tr>
                ) : (
                  data.logs.map((log) => (
                    <tr key={log.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="p-4 font-mono text-xs">{log.transactionId}</td>
                      <td className="p-4">{getTypeBadge(log.type)}</td>
                      <td className="p-4">{getStatusBadge(log.status)}</td>
                      <td className="p-4 text-muted-foreground">{format(new Date(log.createdAt), "MMM d, yyyy HH:mm")}</td>
                      <td className="p-4 text-muted-foreground">{format(new Date(log.updatedAt), "MMM d, yyyy HH:mm")}</td>
                      <td className="p-4">
                        <Link
                          href={`/admin/transfer-logs/${log.transactionId}`}
                          className="inline-flex items-center gap-1 text-primary hover:underline text-xs font-medium"
                        >
                          <FileText className="h-3 w-3" /> Details
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-end space-x-2 py-4">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <div className="text-sm font-medium">Page {page} of {data.pagination.totalPages}</div>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))} disabled={page === data.pagination.totalPages}>
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
