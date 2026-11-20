"use client";

import { Lock } from "lucide-react";

export type RampTab = "buy" | "sell" | "swap" | "bridge" | "otc";

const BLURBS: Record<RampTab, string> = {
  buy: "Pay from your bank in naira, cedi or shilling and get USDC in your wallet.",
  sell: "Turn your USDC into money in your bank account or M-Pesa.",
  swap: "Swap between USDC, USDT and cNGN at live rates.",
  bridge: "Move USDC between Base, BSC, Stellar and Solana.",
  otc: "Trade larger amounts directly with our desk at a quoted rate.",
};

/**
 * Shown in place of the form when nobody is logged in. Banks, rates, accounts and wallets all need an account, so
 * rather than a form that half works, say so once and offer the way in.
 */
export function LoginGate({ tab, onLogin }: { tab: RampTab; onLogin: () => void }) {
  return (
    <div className="ramp-field space-y-5 px-6 py-8 text-center" data-testid="login-gate">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-(--r-raised)">
        <Lock className="h-6 w-6 text-(--r-signal)" aria-hidden />
      </span>
      <div>
        <h2 className="text-xl font-bold tracking-tight text-balance">Log in to get started</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-pretty text-(--r-muted)">{BLURBS[tab]}</p>
      </div>
      <button type="button" className="ramp-cta" onClick={onLogin}>
        Log in or create account
      </button>
      <p className="text-xs text-(--r-muted)">Free to join. It takes about a minute.</p>
    </div>
  );
}
