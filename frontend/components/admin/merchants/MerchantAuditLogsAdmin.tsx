"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Filter, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, AuditLog } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ACTION_FILTERS = [
  { value: "all", label: "All Actions" },
  { value: "transfer", label: "Transfers" },
  { value: "create_sub_account", label: "Create Sub-Account" },
  { value: "update_sub_account", label: "Update Sub-Account" },
  { value: "webhook", label: "Webhooks" },
];

interface MerchantAuditLogsAdminProps {
  merchantId: string;
}

export function MerchantAuditLogsAdmin({ merchantId }: MerchantAuditLogsAdminProps) {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["admin-audit-logs", merchantId, page, actionFilter],
    queryFn: async () => {
      const { data } = await adminApi.getAuditLogs({
        merchantId,
        action: actionFilter === "all" ? undefined : actionFilter,
        page,
        limit,
      });
      return data;
    },
    staleTime: 30 * 1000,
  });

  const logs = data?.data || [];
  const meta = data?.meta;

  const getSuccessBadge = (success: boolean, statusCode: number) => {
    if (success) {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 flex items-center gap-1 w-fit">
          <CheckCircle2 className="h-3 w-3" /> {statusCode}
        </Badge>
      );
    }
    return (
      <Badge className="bg-red-500/10 text-red-500 border-red-500/20 flex items-center gap-1 w-fit">
        <XCircle className="h-3 w-3" /> {statusCode}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-zinc-500 text-sm">All API requests and operations for this merchant.</p>
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
          <SelectTrigger className="w-48 bg-white/5 border-white/10 text-white">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-white/10">
            {ACTION_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-white/5 border-white/10 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-zinc-400 border-b border-white/10">
                <tr>
                  <th className="p-4 text-left font-medium">Action</th>
                  <th className="p-4 text-left font-medium">Method</th>
                  <th className="p-4 text-left font-medium">Endpoint</th>
                  <th className="p-4 text-left font-medium">Status</th>
                  <th className="p-4 text-left font-medium">Duration</th>
                  <th className="p-4 text-left font-medium">Date</th>
                  <th className="p-4 text-right font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-6 w-6 border-2 border-primary border-t-transparent animate-spin" />
                        <p className="text-zinc-500">Loading audit logs...</p>
                      </div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-zinc-500">
                      No audit logs found.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4">
                        <Badge variant="secondary" className="bg-white/5 text-zinc-300 border-white/10 text-[11px]">
                          {log.action}
                        </Badge>
                      </td>
                      <td className="p-4 font-mono text-[11px] text-zinc-400">{log.method}</td>
                      <td className="p-4 font-mono text-[11px] text-zinc-400 max-w-[250px] truncate">{log.endpoint}</td>
                      <td className="p-4">{getSuccessBadge(log.success, log.statusCode)}</td>
                      <td className="p-4 text-[11px] text-zinc-500">{log.duration}ms</td>
                      <td className="p-4 text-zinc-500 whitespace-nowrap text-[11px]">
                        {format(new Date(log.createdAt), "MMM d, HH:mm")}
                      </td>
                      <td className="p-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-zinc-500 hover:text-white h-7 text-[11px]"
                          onClick={() => setSelectedLog(log)}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {meta && meta.total > limit && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, meta.total)} of {meta.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-white/10 text-white text-[11px]"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-white/10 text-white text-[11px]"
              disabled={page * limit >= meta.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Audit Log Detail</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Action</p>
                  <p className="text-sm text-white">{selectedLog.action}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Provider</p>
                  <p className="text-sm text-white">{selectedLog.provider}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Method</p>
                  <p className="text-sm font-mono text-white">{selectedLog.method}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Status</p>
                  {getSuccessBadge(selectedLog.success, selectedLog.statusCode)}
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Endpoint</p>
                  <p className="text-sm font-mono text-zinc-300">{selectedLog.endpoint}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Duration</p>
                  <p className="text-sm text-white">{selectedLog.duration}ms</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Created</p>
                  <p className="text-sm text-white">{format(new Date(selectedLog.createdAt), "MMM d, yyyy HH:mm:ss")}</p>
                </div>
              </div>

              {selectedLog.errorMessage && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Error</p>
                  <p className="text-sm text-red-400">{selectedLog.errorMessage}</p>
                </div>
              )}

              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Request</p>
                <pre className="bg-black/40 border border-white/10 rounded-lg p-3 text-xs text-zinc-300 overflow-x-auto">
                  {JSON.stringify(selectedLog.request, null, 2)}
                </pre>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Response</p>
                <pre className="bg-black/40 border border-white/10 rounded-lg p-3 text-xs text-zinc-300 overflow-x-auto">
                  {JSON.stringify(selectedLog.response, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
