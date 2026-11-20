import { cn } from "@/lib/utils";

const NAMES: Record<string, string> = {
  BITNOB: "Bitnob",
  SAFEHAVEN: "Safehaven",
  PULSE_MFB: "Pulse MFB",
  PULSE: "Pulse MFB",
  BLOCKRADAR: "Blockradar",
  FLINT: "Flint",
  CCTP: "CCTP",
  STELLAR: "Stellar",
};

export function providerName(provider: string | null | undefined): string {
  const key = String(provider ?? "").trim().toUpperCase();
  if (!key) return "Unknown";
  return NAMES[key] ?? key.charAt(0) + key.slice(1).toLowerCase();
}

/** A neutral chip: providers are identified by name, not colour, because colour is reserved for state. */
export function ProviderBadge({ provider, role, className }: { provider: string | null | undefined; role?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-(--c-radius) border border-(--c-line) bg-(--c-field) px-1.5 py-0.5 text-xs text-(--c-text)", className)}>
      {providerName(provider)}
      {role ? <span className="text-(--c-muted)">{role.toLowerCase()}</span> : null}
    </span>
  );
}
