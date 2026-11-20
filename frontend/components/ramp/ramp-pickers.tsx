"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import { RampSheet } from "@/components/ramp/ramp-sheet";
import { RAMP_COUNTRY_LIST, type RampCountryCode } from "@/lib/ramp-countries";
import { FIAT_LOGOS, NETWORK_LOGOS, TOKEN_LOGOS } from "@/lib/ramp-logos";

const CURRENCY_NAMES: Record<string, string> = {
  NGN: "Naira",
  GHS: "Cedi",
  KES: "Shilling",
};

export type RampNetworkId = "base" | "bsc" | "stellar";
export const RAMP_NETWORKS: { id: RampNetworkId; label: string; badge: string }[] = [
  { id: "base", label: "Base", badge: "BASE" },
  { id: "bsc", label: "BNB Smart Chain", badge: "BSC" },
  { id: "stellar", label: "Stellar", badge: "XLM" },
];

function Logo({ src, alt, size = 36 }: { src?: string; alt: string; size?: number }) {
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-(--r-raised)"
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image src={src} alt="" fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <span className="text-[10px] font-bold">{alt}</span>
      )}
    </span>
  );
}

function Row({
  title,
  detail,
  logo,
  overlay,
  fallback,
  selected,
  onClick,
}: {
  title: string;
  detail?: string;
  logo?: string;
  /** Small logo on the corner of the main one, e.g. the network a token is on. */
  overlay?: string;
  fallback: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
        selected
          ? "border-(--r-signal)/50 bg-(--r-raised)"
          : "border-(--r-line) bg-(--r-field) hover:border-(--r-muted)/40"
      }`}
    >
      <span className="relative shrink-0">
        <Logo src={logo} alt={fallback} />
        {overlay && (
          <span className="absolute -bottom-1 -right-1 rounded-full border-2 border-(--r-field) bg-(--r-field)">
            <Logo src={overlay} alt="" size={16} />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {detail && <span className="block text-xs text-(--r-muted)">{detail}</span>}
      </span>
      {selected && <Check size={16} className="shrink-0 text-(--r-signal)" aria-hidden />}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2" aria-label={label}>
      <h3 className="ramp-label">{label}</h3>
      {children}
    </section>
  );
}

/**
 * One side panel for the whole pair. Opened from either currency pill. The side you pay with comes first, then
 * what you receive, so a change to either end is a single trip.
 */
export function CurrencySheet({
  open,
  onOpenChange,
  tab,
  country,
  onCountrySelect,
  tokens,
  token,
  onTokenSelect,
  network,
  onNetworkSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: "buy" | "sell";
  country: RampCountryCode;
  onCountrySelect: (code: RampCountryCode) => void;
  tokens: string[];
  token: string;
  onTokenSelect: (token: string) => void;
  network: RampNetworkId;
  onNetworkSelect: (network: RampNetworkId) => void;
}) {
  const fiat = (
    <div className="space-y-2">
      {RAMP_COUNTRY_LIST.map((c) => (
        <Row
          key={c.code}
          title={`${CURRENCY_NAMES[c.currency] ?? c.currency} (${c.currency})`}
          detail={c.name}
          logo={FIAT_LOGOS[c.currency]}
          fallback={c.currency}
          selected={c.code === country}
          onClick={() => onCountrySelect(c.code)}
        />
      ))}
    </div>
  );

  const crypto = (
    <div className="space-y-3">
      {tokens.length > 1 && (
        <div className="ramp-seg" role="group" aria-label="Token">
          {tokens.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={token === t}
              onClick={() => onTokenSelect(t)}
              className="ramp-seg-item"
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {RAMP_NETWORKS.map((n) => (
          <Row
            key={n.id}
            title={`${token} on ${n.label}`}
            logo={TOKEN_LOGOS[token]}
            overlay={NETWORK_LOGOS[n.id]}
            fallback={n.badge}
            selected={network === n.id}
            onClick={() => onNetworkSelect(n.id)}
          />
        ))}
      </div>
    </div>
  );

  return (
    <RampSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Choose currencies"
      footer={
        <button type="button" className="ramp-cta" onClick={() => onOpenChange(false)}>
          Done
        </button>
      }
    >
      {tab === "buy" ? (
        <>
          <Group label="You pay">{fiat}</Group>
          <Group label="You receive">{crypto}</Group>
        </>
      ) : (
        <>
          <Group label="You send">{crypto}</Group>
          <Group label="You receive">{fiat}</Group>
        </>
      )}
    </RampSheet>
  );
}
