"use client";

import {
  AlertTriangle,
  CheckCircle,
  Clock,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { explorerTxUrl } from "@/lib/explorers";
import { IS_TESTNET } from "@/lib/constants/networks";
import {
  type OfframpView,
  type StatusTone,
  reasonLabel,
  statusMeta,
} from "@/lib/offramp-status";

const TONE_TEXT: Record<StatusTone, string> = {
  success: "text-green-400",
  progress: "text-amber-300",
  warning: "text-amber-400",
  error: "text-red-400",
};
const TONE_BOX: Record<StatusTone, string> = {
  success: "border-green-500/30 bg-green-500/10",
  progress: "border-amber-400/20 bg-amber-400/5",
  warning: "border-amber-400/40 bg-amber-400/10",
  error: "border-red-500/30 bg-red-500/10",
};

function ToneIcon({ status, tone }: { status: string; tone: StatusTone }) {
  const cls = `${TONE_TEXT[tone]} shrink-0`;
  if (tone === "success") return <CheckCircle className={cls} size={18} />;
  if (status === "REVERSED") return <RotateCcw className={cls} size={18} />;
  if (tone === "error") return <XCircle className={cls} size={18} />;
  if (tone === "warning") return <AlertTriangle className={cls} size={18} />;
  return <Clock className={cls} size={18} />;
}

const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

const fmtMoney = (amount: string | null | undefined, currency: string) =>
  amount == null || amount === ""
    ? "—"
    : `${currency === "NGN" ? "₦" : ""}${Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 })}${currency === "NGN" ? "" : ` ${currency}`}`;

const trimUsdc = (v: string) => v.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

function Field({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div data-testid={testId}>
      <div className="text-white/60 text-xs">{label}</div>
      <div className="text-white text-sm mt-0.5 break-words">{children}</div>
    </div>
  );
}

/** Reason-specific facts (shortfall, timeout window, provider response) recorded with the failure. */
function FailureDetail({ view }: { view: OfframpView }) {
  const d = (view.failureDetail ?? {}) as Record<string, any>;
  const rows: Array<[string, string]> = [];
  if (view.failureReason === "insufficient_liquidity" && d.required) {
    rows.push(["Required", `${trimUsdc(d.required)} USDC`], ["Available", `${trimUsdc(d.available)} USDC`], ["Shortfall", `${trimUsdc(d.shortfall)} USDC`]);
  }
  if (view.failureReason === "timeout") {
    if (d.stateWhenExpired) rows.push(["State when it expired", String(d.stateWhenExpired).replace(/_/g, " ").toLowerCase()]);
    if (d.windowMs) rows.push(["Processing window", `${Math.round(Number(d.windowMs) / 60000)} min`]);
    if (d.since) rows.push(["Pending since", fmtDate(d.since)]);
    if (d.message) rows.push(["Detail", String(d.message)]);
  }
  if (view.failureReason === "rejected") {
    const r = (d.providerResponse ?? {}) as Record<string, any>;
    if (r.code) rows.push(["Provider code", String(r.code)]);
    if (r.message) rows.push(["Provider message", String(r.message)]);
  }
  if (!rows.length) return null;
  return (
    <dl className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs" data-testid="failure-detail">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-white/50">{k}</dt>
          <dd className="text-white">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OfframpDetailView({ view, compact = false }: { view: OfframpView; compact?: boolean }) {
  const meta = statusMeta(view.status);
  const showSettlement = view.settlement.kind !== "NONE" || view.status === "PARTIALLY_SETTLED";
  const hasOutstanding = Number(view.settlement.outstanding) > 0;
  const stellarUrl = view.stellarTxHash
    ? explorerTxUrl(IS_TESTNET ? "Stellar_Testnet" : "Stellar", view.stellarTxHash)
    : null;

  return (
    <div className="space-y-4 text-sm" data-testid="offramp-detail" data-status={view.status}>
      {/* Status */}
      <div className={`rounded-lg border p-3 ${TONE_BOX[meta.tone]}`} data-testid="offramp-status">
        <div className="flex items-center gap-2">
          <ToneIcon status={view.status} tone={meta.tone} />
          <span className={`font-semibold ${TONE_TEXT[meta.tone]}`} data-testid="status-label">
            {view.statusLabel || meta.label}
          </span>
          {!view.successful && meta.tone === "error" && (
            <span className="ml-1 text-[10px] uppercase tracking-wide text-red-300/80">not paid out</span>
          )}
        </div>
        <p className="text-white/70 text-xs mt-1.5" data-testid="status-message">
          {view.statusMessage || meta.message}
        </p>
        {view.failureReason && (
          <div className="mt-2 pt-2 border-t border-white/10" data-testid="failure-reason">
            <span className="text-white/60 text-xs">Reason: </span>
            <span className="text-white text-xs font-medium">{reasonLabel(view.failureReason)}</span>
            <FailureDetail view={view} />
          </div>
        )}
      </div>

      {/* Amounts */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
        <Field label="Reference" testId="field-reference">
          <span className="font-mono text-xs">{view.reference}</span>
        </Field>
        <Field label="Source asset" testId="field-asset">{view.sourceAsset}</Field>
        <Field label="Deposit amount" testId="field-deposit">{trimUsdc(view.depositAmount)} {view.sourceAsset}</Field>
        <Field label="Expected payout" testId="field-expected-payout">
          {fmtMoney(view.expectedPayout.amount, view.expectedPayout.currency)}
        </Field>
        <Field label="Actual payout" testId="field-actual-payout">
          {fmtMoney(view.actualPayout.amount, view.actualPayout.currency)}
        </Field>
        <Field label="Conversion" testId="field-conversion">
          {view.conversion ? `1 ${view.conversion.from} ≈ ${view.conversion.rate.toLocaleString("en-US")} ${view.conversion.to}` : "—"}
        </Field>
      </div>

      {/* Stellar deposit */}
      <Field label="Stellar transaction hash" testId="field-stellar-hash">
        {view.stellarTxHash ? (
          stellarUrl ? (
            <a href={stellarUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 font-mono text-xs break-all underline hover:text-blue-300">
              {view.stellarTxHash}
            </a>
          ) : (
            <span className="font-mono text-xs break-all">{view.stellarTxHash}</span>
          )
        ) : (
          <span className="text-white/50">No deposit detected</span>
        )}
      </Field>

      {/* Settlement: expected vs received vs outstanding */}
      {showSettlement && (
        <div className={`rounded-lg border p-3 ${hasOutstanding ? "border-amber-400/40 bg-amber-400/10" : "border-white/10 bg-black/30"}`} data-testid="settlement">
          <div className="text-white/80 text-xs font-semibold mb-2">Settlement</div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Expected" testId="settlement-expected">{trimUsdc(view.settlement.expected)} USDC</Field>
            <Field label="Received" testId="settlement-received">{trimUsdc(view.settlement.received)} USDC</Field>
            <Field label="Outstanding" testId="settlement-outstanding">
              <span className={hasOutstanding ? "text-amber-300 font-semibold" : ""}>{trimUsdc(view.settlement.outstanding)} USDC</span>
            </Field>
          </div>
        </div>
      )}

      {/* Reversal */}
      {view.reversal && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3" data-testid="reversal">
          <div className="text-white/80 text-xs font-semibold mb-2">Reversal (linked to this transaction)</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Amount reversed">{trimUsdc(view.reversal.amount)} {view.sourceAsset}</Field>
            <Field label="Reason">{view.reversal.reason ?? "—"}</Field>
            <Field label="Was">{statusMeta(view.reversal.originalStatus).label}</Field>
            <Field label="Reversed at">{fmtDate(view.reversal.at)}</Field>
          </div>
        </div>
      )}

      {/* Timestamps */}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Created" testId="ts-created">{fmtDate(view.timestamps.createdAt)}</Field>
        <Field label="Last updated" testId="ts-updated">{fmtDate(view.timestamps.updatedAt)}</Field>
        <Field label="Completed" testId="ts-completed">{fmtDate(view.timestamps.completedAt)}</Field>
      </div>

      {/* Status history */}
      {view.statusHistory.length > 0 && (
        <div data-testid="status-history">
          <div className="text-white/80 text-xs font-semibold mb-2">Status history</div>
          <ol className="relative border-l border-white/15 ml-1.5 space-y-2.5">
            {view.statusHistory.map((h, i) => {
              const m = statusMeta(h.to);
              return (
                <li key={`${h.to}-${i}`} className="ml-4" data-testid="history-entry">
                  <span className={`absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full border border-black ${m.tone === "success" ? "bg-green-400" : m.tone === "error" ? "bg-red-400" : m.tone === "warning" ? "bg-amber-400" : "bg-white/50"}`} />
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className={`text-xs font-medium ${TONE_TEXT[m.tone]}`}>{m.label}</span>
                    {h.inferred && <span className="text-[10px] text-white/40">inferred</span>}
                    <span className="text-[11px] text-white/50">{fmtDate(h.at)}</span>
                  </div>
                  {(h.reason || h.actor) && !compact && (
                    <div className="text-[11px] text-white/50">
                      {h.reason}
                      {h.actor ? ` · ${h.actor}` : ""}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Reconciliation + audit (full view only) */}
      {!compact && view.reconciliation && (
        <div data-testid="reconciliation">
          <div className="text-white/80 text-xs font-semibold mb-2">Reconciliation record</div>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-xs">
            {(
              [
                ["Internal transaction ID", view.reconciliation.internalTransactionId],
                ["External reference", view.reconciliation.externalReference ?? "—"],
                ["Asset", view.reconciliation.asset],
                ["Expected settlement", `${trimUsdc(view.reconciliation.expectedSettlement)}`],
                ["Actual settlement", `${trimUsdc(view.reconciliation.actualSettlement)}`],
                ["Outstanding", `${trimUsdc(view.reconciliation.outstandingAmount)}`],
                ["Status", view.reconciliation.status],
                ["Result", view.reconciliation.reconciliationResult],
                ["Settled at", fmtDate(view.reconciliation.settledAt)],
              ] as Array<[string, string]>
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-white/50">{k}</dt>
                <dd className="text-white font-mono break-all">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {!compact && view.auditLog.length > 0 && (
        <div data-testid="audit-log">
          <div className="text-white/80 text-xs font-semibold mb-2">Audit log</div>
          <ul className="space-y-1 text-[11px] text-white/60">
            {view.auditLog.map((a, i) => (
              <li key={i}>
                <span className="text-white/80">{a.action.replace(/_/g, " ")}</span> — {a.description} <span className="text-white/40">({fmtDate(a.at)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
