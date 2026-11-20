"use client";

import { useState } from "react";
import {
  getActiveNetwork,
  setActiveNetwork,
  type NetworkMode,
} from "@/lib/network";

const OPTIONS: { mode: NetworkMode; label: string }[] = [
  { mode: "mainnet", label: "Mainnet" },
  { mode: "testnet", label: "Testnet" },
];

/**
 * Mainnet/Testnet toggle. Switching persists the choice and reloads the app so
 * module-level network constants (wagmi chains, token addresses, wallets) are
 * rebuilt for the selected network.
 *
 * Mainnet is the normal state and stays quiet; testnet is the exception, so it
 * is the one that looks different.
 *
 * Rendered only after RootProvider mounts, so reading localStorage in the state
 * initializer is safe and avoids a setState-in-effect.
 */
export function NetworkSwitch({ className = "" }: { className?: string }) {
  const [network] = useState<NetworkMode>(() => getActiveNetwork());

  return (
    <div
      className={`inline-flex shrink-0 items-center rounded-full border border-white/10 bg-white/5 p-0.5 text-[11px] sm:text-xs ${className}`}
      role="group"
      aria-label="Network"
    >
      {OPTIONS.map(({ mode, label }) => {
        const selected = network === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => {
              if (mode !== network) setActiveNetwork(mode);
            }}
            aria-pressed={selected}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors ${
              selected
                ? mode === "testnet"
                  ? "bg-[#f4b740] text-black"
                  : "bg-white/10 text-white"
                : "text-white/55 hover:text-white"
            }`}
          >
            {selected && mode === "mainnet" && (
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#00f9c7]" />
            )}
            {label}
          </button>
        );
      })}
    </div>
  );
}
