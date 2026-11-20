"use client";

import { useState, useCallback } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Globe,
  ArrowUpRight,
} from "lucide-react";
import { useMerchantWebhookLogs, useRetryWebhookLog } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const EVENT_FILTERS = [
  { value: "all", label: "All Events" },
  { value: "onramp.completed", label: "Onramp Completed" },
  { value: "onramp.failed", label: "Onramp Failed" },
  { value: "offramp.completed", label: "Offramp Completed" },
  { value: "offramp.failed", label: "Offramp Failed" },
  { value: "swap.completed", label: "Swap Completed" },
  { value: "swap.failed", label: "Swap Failed" },
  { value: "vas.completed", label: "VAS Completed" },
  { value: "vas.failed", label: "VAS Failed" },
  { value: "transfer.completed", label: "Transfer Completed" },
  { value: "transfer.failed", label: "Transfer Failed" },
  { value: "account.created", label: "Account Created" },
];

export default function WebhookDeliveryLogs() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [eventFilter, setEventFilter] = useState("all");
  const [successFilter, setSuccessFilter] = useState<string>("all");
  const [retryTarget, setRetryTarget] = useState<{
    id: string;
    event: string;
  } | null>(null);
  const limit = 20;

  const { data, isLoading, refetch, isFetching } = useMerchantWebhookLogs({
    page,
    limit,
    event: eventFilter === "all" ? undefined : eventFilter,
    success:
      successFilter === "all" ? undefined : successFilter === "true",
  });

  const retryMutation = useRetryWebhookLog();

  const logs = data?.data || [];
  const pagination = data?.pagination;

  const handleRetry = useCallback(async () => {
    if (!retryTarget) return;
    try {
      const result = await retryMutation.mutateAsync(retryTarget.id);
      if (result.data.success) {
        toast({
          title: "Retry Successful",
          description: `Webhook re-delivered with status ${result.data.statusCode}.`,
          variant: "success",
        });
      } else {
        toast({
          title: "Retry Failed",
          description: `Webhook still failing with status ${result.data.statusCode}.`,
          variant: "destructive",
        });
      }
      refetch();
    } catch {
      toast({
        title: "Retry Failed",
        description: "Could not retry webhook delivery.",
        variant: "destructive",
      });
    } finally {
      setRetryTarget(null);
    }
  }, [retryTarget, retryMutation, toast, refetch]);

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
        <XCircle className="h-3 w-3" /> {statusCode || "N/A"}
      </Badge>
    );
  };

  const getEventBadge = (event: string) => {
    const isFailed = event.endsWith(".failed");
    const isCompleted = event.endsWith(".completed");
    if (isFailed) {
      return (
        <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[11px]">
          {event}
        </Badge>
      );
    }
    if (isCompleted) {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[11px]">
          {event}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-white/5 text-zinc-300 border-white/10 text-[11px]">
        {event}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Delivery Logs</h3>
          <p className="text-sm text-zinc-400">
            View webhook delivery history and retry failed deliveries.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-white/10 text-white self-start"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Select
          value={eventFilter}
          onValueChange={(v) => {
            setEventFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-52 bg-white/5 border-white/10 text-white">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-white/10 max-h-[300px]">
            {EVENT_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={successFilter}
          onValueChange={(v) => {
            setSuccessFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44 bg-white/5 border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-white/10">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="true">Successful</SelectItem>
            <SelectItem value="false">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="bg-white/5 border-white/10 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-zinc-400 border-b border-white/10">
                <tr>
                  <th className="p-4 text-left font-medium">Event</th>
                  <th className="p-4 text-left font-medium">Endpoint</th>
                  <th className="p-4 text-left font-medium">Status</th>
                  <th className="p-4 text-left font-medium">Error</th>
                  <th className="p-4 text-left font-medium">Date</th>
                  <th className="p-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-6 w-6 border-2 border-primary border-t-transparent animate-spin" />
                        <p className="text-zinc-500">Loading delivery logs...</p>
                      </div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-zinc-500">
                        <Globe className="h-8 w-8 opacity-40" />
                        <p>No webhook delivery logs found.</p>
                        <p className="text-xs text-zinc-600">
                          Logs appear here after webhooks are sent.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-white/5 transition-colors"
                    >
                      <td className="p-4">{getEventBadge(log.event)}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 max-w-[280px]">
                          <ArrowUpRight className="h-3 w-3 text-zinc-500 shrink-0" />
                          <span className="font-mono text-[11px] text-zinc-400 truncate">
                            {log.url}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        {getSuccessBadge(log.success, log.statusCode ?? 0)}
                      </td>
                      <td className="p-4 max-w-[200px]">
                        {log.errorMessage ? (
                          <span
                            className="text-[11px] text-red-400 truncate block"
                            title={log.errorMessage}
                          >
                            {log.errorMessage}
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="p-4 text-zinc-500 whitespace-nowrap text-[11px]">
                        {format(
                          new Date(log.createdAt),
                          "MMM d, HH:mm"
                        )}
                      </td>
                      <td className="p-4 text-right">
                        {!log.success && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-primary hover:text-primary/80 hover:bg-primary/10 h-7 text-[11px]"
                            onClick={() =>
                              setRetryTarget({
                                id: log.id,
                                event: log.event,
                              })
                            }
                            disabled={retryMutation.isPending}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Retry
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            Page <span className="text-white">{pagination.page}</span> of{" "}
            <span className="text-white">{pagination.totalPages}</span>
            <span className="ml-2">
              ({pagination.total} total)
            </span>
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
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Retry Confirmation Dialog */}
      <Dialog
        open={!!retryTarget}
        onOpenChange={(open) => !open && setRetryTarget(null)}
      >
        <DialogContent className="bg-black/90 border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Retry Webhook Delivery
            </DialogTitle>
            <DialogDescription>
              Re-send the failed webhook for event{" "}
              <code className="text-primary text-xs">{retryTarget?.event}</code>{" "}
              to your endpoint?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRetryTarget(null)}
              disabled={retryMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleRetry}
              disabled={retryMutation.isPending}
            >
              {retryMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Retry Delivery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
