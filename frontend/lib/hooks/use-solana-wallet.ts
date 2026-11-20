"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Solana wallet connection using the injected provider exposed by Phantom,
 * Solflare and other browser wallets (`window.phantom.solana` / `window.solana`).
 *
 * Mirrors the Stellar/Stacks hooks: module-level shared state + listeners so
 * every `useSolanaWallet()` instance (header, bridge panel, ...) stays in sync.
 */

export type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect?: () => Promise<void>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
  signTransaction?: (tx: unknown) => Promise<unknown>;
  signAllTransactions?: (txs: unknown[]) => Promise<unknown[]>;
  signMessage?: (message: Uint8Array) => Promise<{ signature: Uint8Array }>;
};

type WalletState = { address: string | null; isConnecting: boolean };

const SOLANA_ADDRESS_KEY = "solana-wallet-address";
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Loose Solana address check (base58, 32–44 chars). */
export function isValidSolanaAddress(address: string): boolean {
  return BASE58.test(address.trim());
}

function readInitialSolanaAddress(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(SOLANA_ADDRESS_KEY);
  } catch {
    return null;
  }
}

export function getSolanaProvider(): SolanaProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    phantom?: { solana?: SolanaProvider };
    solana?: SolanaProvider;
  };
  return w.phantom?.solana ?? w.solana ?? null;
}

const getProvider = getSolanaProvider;

let sharedState: WalletState = {
  address: readInitialSolanaAddress(),
  isConnecting: false,
};
const listeners = new Set<() => void>();

function setSharedState(next: Partial<WalletState>) {
  sharedState = { ...sharedState, ...next };
  listeners.forEach((l) => l());
}

export function useSolanaWallet() {
  const [state, setState] = useState<WalletState>(sharedState);

  useEffect(() => {
    const saved = readInitialSolanaAddress();
    if (saved && !sharedState.address) {
      setSharedState({ address: saved });
    }
    const listener = () => setState(sharedState);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const connectSolana = useCallback(async () => {
    if (sharedState.isConnecting) return;
    const provider = getProvider();
    if (!provider) {
      // No injected wallet available — surface a clear failure to the caller.
      throw new Error(
        "No Solana wallet found. Install Phantom or Solflare to continue.",
      );
    }
    setSharedState({ isConnecting: true });
    try {
      const { publicKey } = await provider.connect();
      const address = publicKey.toString();
      setSharedState({ address });
      try {
        localStorage.setItem(SOLANA_ADDRESS_KEY, address);
      } catch {}
    } finally {
      setSharedState({ isConnecting: false });
    }
  }, []);

  const disconnectSolana = useCallback(async () => {
    const provider = getProvider();
    try {
      await provider?.disconnect?.();
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(SOLANA_ADDRESS_KEY);
    } catch {}
    setSharedState({ address: null });
  }, []);

  return {
    solanaAddress: state.address,
    isSolanaConnected: !!state.address,
    isSolanaConnecting: state.isConnecting,
    connectSolana,
    disconnectSolana,
    isValidSolanaAddress,
  };
}
