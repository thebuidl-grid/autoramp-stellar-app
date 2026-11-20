import { cn } from "@/lib/utils";

/** The network one transaction ran on, from the customer's toggle at the time. Amber for testnet; says "Network not recorded" for older rows. */
export function NetworkBadge({ network, className }: { network: "mainnet" | "testnet" | null | undefined; className?: string }) {
  const label = network === "testnet" ? "Testnet" : network === "mainnet" ? "Mainnet" : "Network not recorded";
  return (
    <span
      data-network={network ?? "unknown"}
      className={cn(
        "rounded-full border px-2 py-0.5 text-xs font-medium",
        network === "testnet" ? "border-(--c-warn) text-(--c-warn)" : network === "mainnet" ? "border-(--c-line) text-(--c-text)" : "border-(--c-line) text-(--c-muted)",
        className,
      )}
    >
      {label}
    </span>
  );
}
