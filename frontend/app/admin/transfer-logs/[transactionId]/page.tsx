"use client";

import { useParams } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowUpRight,
  ArrowDownLeft,
  ExternalLink,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import Link from "next/link";
import { useState } from "react";

function JsonViewer({ data, label }: { data: unknown; label: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border rounded-md">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-4 py-2 text-left text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {label}
      </button>
      {isOpen && (
        <pre className="px-4 py-3 text-xs font-mono overflow-x-auto border-t bg-muted/20 max-h-96 overflow-y-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function AdminTransferLogDetailPage() {
  const params = useParams();
  const transactionId = params.transactionId as string;

  const { data, isLoading } = useQuery({
    queryKey: ["admin-transfer-log", transactionId],
    queryFn: async () => {
      const { data } = await adminApi.getTransferLogByTransactionId(transactionId);
      return data;
    },
    enabled: !!transactionId,
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

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <Link href="/admin/transfer-logs">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight animate-pulse bg-muted rounded w-64 h-9" />
            <p className="text-muted-foreground animate-pulse bg-muted rounded w-48 h-4 mt-2" />
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <Link href="/admin/transfer-logs">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Transfer Log Not Found</h1>
            <p className="text-muted-foreground">
              No transfer logs found for transaction ID: {transactionId}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/transfer-logs">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transfer Log Detail</h1>
          <p className="text-muted-foreground font-mono text-sm">
            Transaction ID: {transactionId}
          </p>
        </div>
      </div>

      {data.user && (
        <Card>
          <CardHeader>
            <CardTitle>User Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">User ID</p>
                <p className="font-mono text-sm">{data.user.id}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="text-sm">{data.user.email}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="text-sm">{data.user.phoneNumber}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {data.transaction && (
        <Card>
          <CardHeader>
            <CardTitle>Transaction Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Reference</p>
                <p className="font-mono text-sm">{data.transaction.reference}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Type</p>
                <p>{getTypeBadge(data.transaction._type.toUpperCase())}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Amount</p>
                <p className="font-medium">₦{Number(data.transaction.amount).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p>{getStatusBadge(data.transaction.status)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="text-sm">{format(new Date(data.transaction.createdAt), "MMM d, yyyy HH:mm")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-xl font-semibold mb-4">Transfer Logs ({data.logs.length})</h2>
        <div className="space-y-4">
          {data.logs.map((log) => (
            <Card key={log.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">Log Entry</CardTitle>
                    {getTypeBadge(log.type)}
                    {getStatusBadge(log.status)}
                  </div>
                  <Link
                    href={`/admin/transfer-logs/${log.transactionId}`}
                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" /> {log.transactionId.slice(0, 8)}...
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <span className="text-muted-foreground">Log ID: </span>
                    <span className="font-mono text-xs">{log.id}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created: </span>
                    <span>{format(new Date(log.createdAt), "MMM d, yyyy HH:mm")}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Updated: </span>
                    <span>{format(new Date(log.updatedAt), "MMM d, yyyy HH:mm")}</span>
                  </div>
                </div>

                <JsonViewer data={log.safehavenPayload} label="SafeHaven Payload" />
                <JsonViewer data={log.stablestackPayload} label="Stablestack Payload" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
