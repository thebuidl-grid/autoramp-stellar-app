"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Search, CheckCircle2, XCircle, Clock, Filter, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { merchantBankApi, AuditLog } from "@/lib/merchant";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

export function MerchantAuditLogs() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["merchant-audit-logs", page, actionFilter],
    queryFn: async () => {
      const { data } = await merchantBankApi.getAuditLogs({
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
        <Badge className="bg-emerald-500/10 text-(--c-ok) border-emerald-500/20 flex items-center gap-1 w-fit">
          <CheckCircle2 className="h-3 w-3" /> {statusCode}
        </Badge>
      );
    }
    return (
      <Badge className="bg-red-500/10 text-(--c-danger) border-red-500/20 flex items-center gap-1 w-fit">
        <XCircle className="h-3 w-3" /> {statusCode}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-(--c-text)">Audit Logs</h2>
          <p className="text-(--c-muted) text-sm">Track all API requests and operations.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
            <SelectTrigger className="w-48 bg-(--c-field) border-(--c-line) text-(--c-text)">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-(--c-panel) border-(--c-line)">
              {ACTION_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="bg-(--c-field) border-(--c-line) overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-(--c-field) text-(--c-muted) border-b border-(--c-line)">
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
                        <p className="text-(--c-muted)">Loading audit logs...</p>
                      </div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-(--c-muted)">
                      No audit logs found.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-(--c-field) transition-colors">
                      <td className="p-4">
                        <Badge variant="secondary" className="bg-(--c-field) text-(--c-text) border-(--c-line) text-[11px]">
                          {log.action}
                        </Badge>
                      </td>
                      <td className="p-4 font-mono text-[11px] text-(--c-muted)">{log.method}</td>
                      <td className="p-4 font-mono text-[11px] text-(--c-muted) max-w-[250px] truncate">{log.endpoint}</td>
                      <td className="p-4">{getSuccessBadge(log.success, log.statusCode)}</td>
                      <td className="p-4 text-[11px] text-(--c-muted)">{log.duration}ms</td>
                      <td className="p-4 text-(--c-muted) whitespace-nowrap text-[11px]">
                        {format(new Date(log.createdAt), "MMM d, HH:mm")}
                      </td>
                      <td className="p-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-(--c-muted) hover:text-(--c-text) h-7 text-[11px]"
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
          <p className="text-xs text-(--c-muted)">
            Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, meta.total)} of {meta.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-(--c-line) text-(--c-text) text-[11px]"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-(--c-line) text-(--c-text) text-[11px]"
              disabled={page * limit >= meta.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="bg-(--c-panel) border-(--c-line) text-(--c-text) max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-(--c-text)">Audit Log Detail</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-(--c-muted) mb-1">Action</p>
                  <p className="text-sm text-(--c-text)">{selectedLog.action}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-(--c-muted) mb-1">Provider</p>
                  <p className="text-sm text-(--c-text)">{selectedLog.provider}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-(--c-muted) mb-1">Method</p>
                  <p className="text-sm font-mono text-(--c-text)">{selectedLog.method}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-(--c-muted) mb-1">Status</p>
                  {getSuccessBadge(selectedLog.success, selectedLog.statusCode)}
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-wider text-(--c-muted) mb-1">Endpoint</p>
                  <p className="text-sm font-mono text-(--c-text)">{selectedLog.endpoint}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-(--c-muted) mb-1">Duration</p>
                  <p className="text-sm text-(--c-text)">{selectedLog.duration}ms</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-(--c-muted) mb-1">Created</p>
                  <p className="text-sm text-(--c-text)">{format(new Date(selectedLog.createdAt), "MMM d, yyyy HH:mm:ss")}</p>
                </div>
              </div>

              {selectedLog.errorMessage && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-(--c-muted) mb-1">Error</p>
                  <p className="text-sm text-(--c-danger)">{selectedLog.errorMessage}</p>
                </div>
              )}

              <div>
                <p className="text-[10px] uppercase tracking-wider text-(--c-muted) mb-2">Request</p>
                <pre className="bg-(--c-field) border border-(--c-line) rounded-lg p-3 text-xs text-(--c-text) overflow-x-auto">
                  {JSON.stringify(selectedLog.request, null, 2)}
                </pre>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-(--c-muted) mb-2">Response</p>
                <pre className="bg-(--c-field) border border-(--c-line) rounded-lg p-3 text-xs text-(--c-text) overflow-x-auto">
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
