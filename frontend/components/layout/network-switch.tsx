"use client";

import { useState } from "react";
import {
  getActiveNetwork,
  setActiveNetwork,
  type NetworkMode,
} from "@/lib/network";

const OPTIONS: { mode: NetworkMode; label: string }[] = [
  { mode: "testnet", label: "Testnet" },
  { mode: "mainnet", label: "Mainnet" },
];

/**
 * Testnet/Mainnet toggle. Switching persists the choice and reloads the app so
 * module-level network constants (wagmi chains, token addresses, wallets) are
 * rebuilt for the selected network.
 *
 * Rendered only after RootProvider mounts, so reading localStorage in the state
 * initializer is safe and avoids a setState-in-effect.
 */
export function NetworkSwitch({ className = "" }: { className?: string }) {
  const [network] = useState<NetworkMode>(() => getActiveNetwork());

  return (
    <div
      className={`inline-flex items-center rounded-full border border-white/10 bg-white/5 p-0.5 text-[11px] sm:text-xs shrink-0 ${className}`}
      role="group"
      aria-label="Network selection"
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
            title={
              mode === "mainnet"
                ? "Mainnet is not yet supported by the Autoramp backend (testnet-only)"
                : undefined
            }
            className={`rounded-full px-2 sm:px-3 py-1 font-medium transition-colors ${
              selected
                ? mode === "mainnet"
                  ? "bg-amber-400 text-black"
                  : "bg-[#00F9C7] text-black"
                : "text-white/60 hover:text-white"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
