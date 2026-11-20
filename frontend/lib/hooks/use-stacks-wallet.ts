"use client";

import { useCallback, useEffect, useState } from "react";
import { IS_TESTNET } from "@/lib/constants/networks";

/** v8 address cache written by connect()/getAddresses (hex-encoded JSON). */
const ADDRESS_CACHE_KEY = "@stacks/connect";
/** Legacy UserSession store written by the old authenticate() flow. */
const LEGACY_SESSION_KEY = "blockstack-session";

/** Network for the configured NEXT_PUBLIC_NETWORK value. */
const STACKS_NETWORK: "mainnet" | "testnet" = IS_TESTNET ? "testnet" : "mainnet";
/** Stacks address prefix for that network (SP... mainnet, ST... testnet). */
const ADDRESS_PREFIX = IS_TESTNET ? "ST" : "SP";

function parseStored(raw: string): unknown {
  try {
    if (/^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0) {
      const bytes = new Uint8Array(
        raw.match(/.{2}/g)!.map((h) => parseInt(h, 16)),
      );
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

type AddressEntryLike = { address?: string; symbol?: string };
type CacheData = { addresses?: { stx?: AddressEntryLike[] } };
type LegacySession = {
  userData?: { profile?: { stxAddress?: { testnet?: string; mainnet?: string } } };
};

function pickStxAddress(entries?: AddressEntryLike[]): string | null {
  if (!Array.isArray(entries)) return null;
  const hit = entries.find((e) => e?.address?.startsWith(ADDRESS_PREFIX));
  return hit?.address ?? null;
}

/**
 * Read the persisted Stacks address. Covers both storage formats:
 *  - @stacks/connect  { addresses: { stx: [...] } }  (current connect())
 *  - blockstack-session { userData: { profile: { stxAddress } } } (legacy auth)
 */
function readStacksAddress(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const cached = localStorage.getItem(ADDRESS_CACHE_KEY);
    if (cached) {
      const addr = pickStxAddress((parseStored(cached) as CacheData)?.addresses?.stx);
      if (addr) return addr;
    }
    const legacy = localStorage.getItem(LEGACY_SESSION_KEY);
    if (legacy) {
      const stxAddr = (parseStored(legacy) as LegacySession)?.userData?.profile?.stxAddress;
      // Only accept the address for the configured network so we never
      // sign transactions against the wrong Stacks deployment.
      return (IS_TESTNET ? stxAddr?.testnet : stxAddr?.mainnet) ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

// Shared across every useStacksWallet() instance (header, swap panel, ...)
// so connecting in one place updates all of them.
type WalletState = { address: string | null; isConnecting: boolean };

let sharedState: WalletState = { address: null, isConnecting: false };
const listeners = new Set<() => void>();

function setSharedState(next: Partial<WalletState>) {
  sharedState = { ...sharedState, ...next };
  listeners.forEach((l) => l());
}

export function useStacksWallet() {
  const [state, setState] = useState<WalletState>(sharedState);

  useEffect(() => {
    const listener = () => setState(sharedState);
    listeners.add(listener);
    // Sync from storage on mount (covers page reload with an active session)
    const address = readStacksAddress();
    if (address !== sharedState.address) {
      setSharedState({ address });
    } else {
      setState(sharedState);
    }
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const connectStacks = useCallback(async () => {
    if (sharedState.isConnecting) return;
    setSharedState({ isConnecting: true });
    try {
      const mod = await import("@stacks/connect");
      // Opens the wallet-select modal (Leather / Xverse / ...) and returns
      // the account addresses — no legacy onFinish callbacks involved.
      const result = await mod.connect({ network: STACKS_NETWORK });
      const address =
        pickStxAddress(result?.addresses) ?? readStacksAddress();
      setSharedState({ address });
    } catch (err) {
      // User cancelling the modal lands here (code -31001)
      console.error("Stacks connect failed", err);
      setSharedState({ address: readStacksAddress() });
    } finally {
      setSharedState({ isConnecting: false });
    }
  }, []);

  const disconnectStacks = useCallback(async () => {
    try {
      const mod = await import("@stacks/connect");
      await mod.disconnect();
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(ADDRESS_CACHE_KEY);
      localStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {
      // ignore
    }
    setSharedState({ address: null });
  }, []);

  return {
    stacksAddress: state.address,
    isStacksConnected: !!state.address,
    isConnecting: state.isConnecting,
    connectStacks,
    disconnectStacks,
  };
}
