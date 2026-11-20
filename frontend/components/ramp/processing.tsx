"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle, Copy, Loader2 } from "lucide-react";
import { copyToClipboard } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

/** Icon, title and one plain sentence for a screen in the processing flow. */
export function StatusHeader({
  state,
  title,
  subtitle,
}: {
  state: "waiting" | "done" | "failed";
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-2 text-center">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-(--r-raised)">
        {state === "done" ? (
          <CheckCircle className="h-7 w-7 text-(--r-signal)" aria-hidden />
        ) : state === "failed" ? (
          <AlertTriangle className="h-7 w-7 text-(--r-caution)" aria-hidden />
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-(--r-signal)" aria-hidden />
        )}
      </span>
      <h2 className="text-2xl font-bold tracking-tight text-balance">{title}</h2>
      {subtitle && (
        <p className="mx-auto mt-2 max-w-sm text-sm text-pretty text-(--r-muted)">{subtitle}</p>
      )}
    </div>
  );
}

/** Copies `value` and flips to a check for two seconds. */
export function CopyButton({ value, label, toastText }: { value: string; label: string; toastText: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={async () => {
        if (await copyToClipboard(value)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          toast({ title: "Copied", description: toastText, variant: "success" });
        }
      }}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-(--r-muted) transition-colors hover:bg-(--r-raised) hover:text-(--r-text)"
    >
      {copied ? <CheckCircle size={16} className="text-(--r-signal)" /> : <Copy size={16} />}
    </button>
  );
}

/** One label and value, optionally with a copy button. */
export function DetailRow({
  label,
  value,
  mono = false,
  copy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: { label: string; toastText: string };
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className="text-sm text-(--r-muted)">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 text-right">
        <span className={`truncate text-sm font-semibold text-(--r-text) ${mono ? "font-mono" : ""}`}>{value}</span>
        {copy && <CopyButton value={value} label={copy.label} toastText={copy.toastText} />}
      </dd>
    </div>
  );
}

/** A card of rows separated by hairlines. */
export function DetailCard({ children }: { children: React.ReactNode }) {
  return <dl className="ramp-field divide-y divide-(--r-line) p-4">{children}</dl>;
}

/** The big amount the user has to act on. */
export function AmountCard({ label, amount, unit }: { label: string; amount: string; unit?: string }) {
  return (
    <div className="ramp-field p-4">
      <p className="ramp-label">{label}</p>
      <p className="ramp-amount mt-1 break-all text-3xl text-(--r-text)">
        {amount}
        {unit && <span className="ml-2 text-lg font-medium text-(--r-muted)">{unit}</span>}
      </p>
    </div>
  );
}

/** Order reference, with a quiet live-updates indicator. */
export function ReferenceCard({ reference, live }: { reference: string; live?: boolean }) {
  return (
    <div className="ramp-field flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="ramp-label">Reference</p>
        <p className="mt-1 truncate font-mono text-sm text-(--r-text)">{reference}</p>
        {live && (
          <p className="mt-2 flex items-center gap-2 text-xs text-(--r-muted)">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--r-signal)" />
            Live updates on
          </p>
        )}
      </div>
      <CopyButton value={reference} label="Copy reference" toastText="Reference copied" />
    </div>
  );
}
