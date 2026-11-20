"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, Circle } from "lucide-react";
import { EmptyState, ErrorState, Money, StatusBadge } from "@/components/ui-shared";
import { merchantApi } from "@/lib/merchant";
import type { UnifiedTransaction } from "@/lib/api";
import { ActivityPanel } from "@/components/merchant/home/ActivityPanel";
import { useMerchantApiKeys, useMerchantBankAccount, useMerchantStatus, useOtcStatus } from "@/lib/hooks";
import { activityCurrency, activityDetail, activityLabel } from "@/components/merchant/home/activity";
import { remainingSteps, setupSteps } from "@/components/merchant/home/setup";

export default function MerchantDashboardPage() {
  const { data: status, isLoading: statusLoading } = useMerchantStatus();
  const merchantId = status?.merchantId ?? null;
  const { data: account, isLoading: accountLoading, isError: accountError } = useMerchantBankAccount();
  const { data: keys } = useMerchantApiKeys();
  const { isOTCEnabled } = useOtcStatus();
  const [selected, setSelected] = useState<UnifiedTransaction | null>(null);

  const activity = useQuery({
    queryKey: ["merchant-home-activity", merchantId],
    queryFn: async () => (await merchantApi.getTransactionsUnified(merchantId as string, { page: 1, limit: 6 })).data,
    enabled: !!merchantId,
    staleTime: 60 * 1000,
  });

  const steps = setupSteps({
    onboarding: status?.onboardingStaus,
    hasMerchantRecord: status?.hasMerchantRecord,
    hasBankAccount: !!account,
    apiKeyCount: Array.isArray(keys) ? keys.length : undefined,
  });
  const left = remainingSteps(steps);
  const rows = activity.data?.data ?? [];
  const pending = account ? Math.max(0, account.bookBalance - account.accountBalance) : 0;

  return (
    <div className="space-y-10">
      <section aria-labelledby="balance-heading">
        <h1 id="balance-heading" className="text-(--c-muted) font-medium">
          Your balance
        </h1>
        {accountLoading || statusLoading ? (
          <div className="mt-3 h-14 w-72 animate-pulse rounded-(--c-radius) bg-(--c-field)" aria-hidden />
        ) : accountError ? (
          <ErrorState title="Couldn't load your balance" message="Try again in a moment." />
        ) : account ? (
          <>
            <p className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">
              <Money value={account.accountBalance} currency="NGN" maxFraction={2} minFraction={2} />
            </p>
            <p className="mt-2 text-(--c-muted)">
              Available to spend
              {pending > 0 ? (
                <>
                  {" · "}
                  <Money value={pending} currency="NGN" maxFraction={2} minFraction={2} /> still clearing
                </>
              ) : null}
            </p>
            <p className="mt-1 text-sm text-(--c-muted)">
              {account.accountName} · {account.accountNumber}
            </p>
          </>
        ) : (
          <div className="mt-3">
            <EmptyState
              title="No business account yet"
              hint="Open one to hold your balance and move money."
              action={
                <Link href="/merchant/dashboard/bank" className="font-medium text-(--c-signal-text) underline underline-offset-4">
                  Open your account
                </Link>
              }
            />
          </div>
        )}
      </section>

      {left.length > 0 && !statusLoading ? (
        <section aria-labelledby="setup-heading" className="rounded-(--c-radius) border border-(--c-line) bg-(--c-panel) p-5">
          <h2 id="setup-heading" className="font-semibold">
            Finish setting up
          </h2>
          <ul className="mt-3 divide-y divide-(--c-line)">
            {steps.map((s) => (
              <li key={s.key}>
                <Link href={s.href} className="flex items-start gap-3 py-3 focus-visible:outline-2 focus-visible:outline-(--c-signal-text)">
                  {s.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-(--c-ok)" aria-label="Done" /> : <Circle className="mt-0.5 h-5 w-5 text-(--c-muted)" aria-label="To do" />}
                  <span>
                    <span className={s.done ? "text-(--c-muted) line-through" : "font-medium"}>{s.title}</span>
                    {s.done ? null : <span className="block text-(--c-muted)">{s.hint}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="activity-heading">
        <div className="flex items-baseline justify-between">
          <h2 id="activity-heading" className="font-semibold">
            Recent activity
          </h2>
          <Link href="/merchant/dashboard/transactions" className="text-(--c-signal-text) underline underline-offset-4">
            See all payments
          </Link>
        </div>
        {activity.isError ? (
          <div className="mt-3">
            <ErrorState title="Couldn't load your activity" onRetry={() => activity.refetch()} />
          </div>
        ) : rows.length === 0 && !activity.isLoading ? (
          <div className="mt-3">
            <EmptyState title="Nothing here yet" hint="Payments, payouts and transfers show up here as they happen." />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-(--c-line) rounded-(--c-radius) border border-(--c-line) bg-(--c-panel)">
            {rows.map((tx) => {
              const detail = activityDetail(tx);
              return (
                <li key={tx.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(tx)}
                    aria-label={`${activityLabel(tx.type)}, ${tx.reference}. Show details`}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-(--c-field) focus-visible:outline-2 focus-visible:outline-(--c-signal-text)"
                  >
                  <div className="min-w-0">
                    <p className="font-medium">{activityLabel(tx.type)}</p>
                    <p className="truncate text-sm text-(--c-muted)">
                      {format(new Date(tx.createdAt), "MMM d, HH:mm")}
                      {detail ? ` · ${detail}` : ""}
                    </p>
                    {tx.reference ? <p className="truncate font-mono text-xs text-(--c-muted)">{tx.reference}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-medium tabular-nums">
                      <Money value={tx.amount} currency={activityCurrency(tx)} maxFraction={tx.type === "bank_transfer" || tx.type === "onramp" ? 2 : 6} minFraction={2} />
                    </span>
                    <StatusBadge status={tx.status} />
                  </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ActivityPanel tx={selected} onClose={() => setSelected(null)} />

      {isOTCEnabled ? (
        <p className="text-(--c-muted)">
          Trading larger amounts?{" "}
          <Link href="/otc/dashboard" className="font-medium text-(--c-signal-text) underline underline-offset-4">
            Open the OTC portal
          </Link>
        </p>
      ) : null}
    </div>
  );
}
