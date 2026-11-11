"use client";

import { MerchantAuditLogs } from "@/components/merchant/audit/MerchantAuditLogs";

export default function AuditLogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Audit Logs</h1>
        <p className="text-zinc-400">
          Track all API requests and banking operations for your account.
        </p>
      </div>
      <MerchantAuditLogs />
    </div>
  );
}
