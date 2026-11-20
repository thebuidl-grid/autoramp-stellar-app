"use client";

import { useMemo } from "react";
import { PageHeader } from "@/components/ui-shared";
import { MoneyStrip } from "@/components/admin/overview/MoneyStrip";
import { NeedsAttention } from "@/components/admin/overview/NeedsAttention";
import { buildAttentionItems } from "@/components/admin/overview/attention";
import { useAdminDailyVolume, useAdminSummary, usePendingMerchantsCount } from "@/lib/hooks/use-admin-overview";
import { useBitnobBalances } from "@/lib/hooks/use-admin-bitnob";
import { useAttentionCounts } from "@/lib/hooks/use-admin-tracker";

export default function AdminOverviewPage() {
  const summary = useAdminSummary("30d");
  const trend = useAdminDailyVolume();
  const merchants = usePendingMerchantsCount();
  const balances = useBitnobBalances();
  const counts = useAttentionCounts();

  const items = useMemo(
    () => buildAttentionItems({ pendingMerchants: merchants.data, failedTransactions: counts.data?.failed, stuckTransactions: counts.data?.stuck, unmatchedWebhooks: counts.data?.unmatchedWebhooks }),
    [merchants.data, counts.data],
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Overview" description="What needs you now, and how money is moving." />
      <NeedsAttention
        items={items}
        isLoading={merchants.isLoading || counts.isLoading}
        error={(merchants.error ?? counts.error) as { message?: string } | null}
        onRetry={() => {
          merchants.refetch();
          counts.refetch();
        }}
      />
      <MoneyStrip
        summary={summary.data}
        summaryError={summary.isError}
        trend={trend.data}
        balances={balances.data?.accounts}
        balancesError={balances.error?.message}
        isLoading={summary.isLoading}
      />
    </div>
  );
}
