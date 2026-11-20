"use client";

import { useCallback, useEffect, useState } from "react";
import { connectFreighter, currentFreighterAddress, isFreighterAvailable, signWithFreighter } from "@/lib/stellar-freighter";
import { isPending } from "@/lib/stellar-wc-restore";
import {
  connectWalletConnect,
  disconnectWalletConnect,
  findStellarSession,
  onSessionDeleted,
  signWithWalletConnect,
  walletConnectProjectId,
} from "@/lib/stellar-walletconnect";

/**
 * Stellar wallet connection: the Freighter browser extension when it is installed, otherwise WalletConnect (Reown):
 * a QR code on desktop, wallet deep links on a phone.
 *
 * Module-level shared state + listeners keep every useStellarWallet() instance (header, sell panel, ...) in sync.
 * The WalletConnect client is lazy-loaded and only started when a wallet is being connected, or when there is a
 * previous connection to restore.
 */

type WalletState = {
  address: string | null;
  isConnecting: boolean;
  /** The WalletConnect pairing link while a connect is in progress (shown as a QR code / open-in-app links). */
  connectUri: string | null;
};

const STELLAR_ADDRESS_KEY = "stellar-wallet-address";
/** How the saved address connected: the browser extension, or WalletConnect. Decides how to sign and restore. */
const STELLAR_KIND_KEY = "stellar-wallet-kind";
type WalletKind = "freighter" | "walletconnect";

function readKind(): WalletKind {
  try {
    return localStorage.getItem(STELLAR_KIND_KEY) === "freighter" ? "freighter" : "walletconnect";
  } catch {
    return "walletconnect";
  }
}
function writeKind(kind: WalletKind) {
  try {
    localStorage.setItem(STELLAR_KIND_KEY, kind);
  } catch {}
}
/** When a connect attempt started. Survives a page reload, so a returning page knows it is mid-connection. */
const STELLAR_PENDING_KEY = "stellar-wallet-connect-pending";

function readInitialStellarAddress(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STELLAR_ADDRESS_KEY);
  } catch {
    return null;
  }
}

function readPending(): number | null {
  try {
    const v = Number(localStorage.getItem(STELLAR_PENDING_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
function writePending() {
  try {
    localStorage.setItem(STELLAR_PENDING_KEY, String(Date.now()));
  } catch {}
}
function clearPending() {
  try {
    localStorage.removeItem(STELLAR_PENDING_KEY);
  } catch {}
}

let sharedState: WalletState = {
  address: readInitialStellarAddress(),
  isConnecting: false,
  connectUri: null,
};
let connectAbort: AbortController | null = null;
const listeners = new Set<() => void>();

function setSharedState(next: Partial<WalletState>) {
  sharedState = { ...sharedState, ...next };
  listeners.forEach((l) => l());
}

/** Record a connected address (from the modal or a recovered session). */
function adoptAddress(address: string, kind: WalletKind = "walletconnect") {
  writeKind(kind);
  // Also settle "connecting": the modal's promise may never resolve after a mobile round trip.
  setSharedState({ address, isConnecting: false, connectUri: null });
  try {
    localStorage.setItem(STELLAR_ADDRESS_KEY, address);
  } catch {}
  clearPending();
}

function clearAddress() {
  try {
    localStorage.removeItem(STELLAR_ADDRESS_KEY);
    localStorage.removeItem(STELLAR_KIND_KEY);
  } catch {}
  clearPending();
  setSharedState({ address: null, isConnecting: false, connectUri: null });
}

let syncing = false;

/**
 * Match our saved state to WalletConnect's persisted sessions. Recovers a connection the wallet approved while the
 * browser was away (mobile round trip), and clears an address whose session no longer exists. Does nothing, and
 * loads nothing, unless there is a saved address or a connect attempt in progress.
 */
async function syncFromSessions(): Promise<void> {
  if (readKind() === "freighter" && sharedState.address) {
    // Extension connections have no WalletConnect session; drop the address if access was revoked or the account changed.
    const current = await currentFreighterAddress();
    if (current && current !== sharedState.address) adoptAddress(current, "freighter");
    return;
  }
  if (syncing || typeof window === "undefined" || !walletConnectProjectId()) return;
  const pending = isPending(readPending(), Date.now());
  if (!sharedState.address && !pending) return;
  syncing = true;
  try {
    const found = await findStellarSession();
    if (found) {
      if (found.address !== sharedState.address) adoptAddress(found.address);
      else clearPending();
    } else if (sharedState.address && !pending) {
      clearAddress(); // saved address, but the wallet session is gone
    }
  } catch (err) {
    console.warn("Could not check the Stellar wallet session", err);
  } finally {
    syncing = false;
  }
}

export function useStellarWallet() {
  const [state, setState] = useState<WalletState>(sharedState);

  useEffect(() => {
    const saved = readInitialStellarAddress();
    if (saved && !sharedState.address) {
      setSharedState({ address: saved });
    }
    const listener = () => setState(sharedState);
    listeners.add(listener);
    // Coming back from a wallet app (tab visible again / restored from the back-forward cache).
    const onReturn = () => {
      if (document.visibilityState === "visible") void syncFromSessions();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("pageshow", onReturn);
    const stopDeleted = onSessionDeleted(() => {
      void syncFromSessions();
    });
    onReturn();
    return () => {
      listeners.delete(listener);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("pageshow", onReturn);
      stopDeleted();
    };
  }, []);

  const connectStellar = useCallback(async () => {
    if (sharedState.isConnecting) return;
    setSharedState({ isConnecting: true, connectUri: null });
    // A browser extension is the fastest path: no QR code needed.
    if (await isFreighterAvailable()) {
      try {
        const { address } = await connectFreighter();
        adoptAddress(address, "freighter");
      } catch (err) {
        console.error("Freighter connect failed", err);
        const message = (err as { message?: string })?.message;
        if (message && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("stellar-wallet-error", { detail: message }));
        }
        setSharedState({ isConnecting: false, connectUri: null });
      }
      return;
    }
    writePending();
    const controller = new AbortController();
    connectAbort = controller;
    try {
      const { address } = await connectWalletConnect({
        onUri: (uri) => setSharedState({ connectUri: uri }),
        signal: controller.signal,
      });
      adoptAddress(address);
    } catch (err) {
      console.error("Stellar wallet connect failed", err);
      const message = (err as { message?: string })?.message;
      if (message && !/window was closed/i.test(message) && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("stellar-wallet-error", { detail: message }));
      }
    } finally {
      if (connectAbort === controller) connectAbort = null;
      clearPending();
      setSharedState({ isConnecting: false, connectUri: null });
    }
  }, []);

  /** Close the connect panel without connecting. */
  const cancelStellarConnect = useCallback(() => {
    connectAbort?.abort();
    setSharedState({ connectUri: null });
  }, []);

  const disconnectStellar = useCallback(async () => {
    if (readKind() !== "freighter") await disconnectWalletConnect();
    clearAddress();
  }, []);

  /**
   * Build, sign, and submit a USDC payment from the connected Stellar wallet
   * to a funding address (off-ramp). Returns the Stellar transaction hash.
   */
  const sendUsdc = useCallback(
    async (funding: {
      destination: string;
      amount: string;
      memo?: string | null;
      assetCode?: string | null;
      assetIssuer?: string | null;
    }): Promise<string> => {
      if (
        typeof window !== "undefined" &&
        ((window as any).__mockStellarTxHash ||
          localStorage.getItem("mock-stellar-tx-hash"))
      ) {
        return (
          (window as any).__mockStellarTxHash ||
          localStorage.getItem("mock-stellar-tx-hash")!
        );
      }
      const address = sharedState.address;
      if (!address) throw new Error("No Stellar wallet connected");
      const { buildUsdcPaymentXdr, submitSignedXdr } = await import("@/lib/stellar-funding");
      const xdr = await buildUsdcPaymentXdr(address, funding);
      const signedXdr =
        readKind() === "freighter" ? await signWithFreighter(address, xdr) : await signWithWalletConnect(address, xdr);
      return submitSignedXdr(signedXdr);
    },
    [],
  );

  /**
   * Sign an arbitrary Stellar transaction XDR (e.g. a Soroban CCTP burn) with
   * the connected wallet. Returns the signed XDR; the caller submits it.
   */
  const signStellarTransaction = useCallback(
    async (xdr: string): Promise<string> => {
      const address = sharedState.address;
      if (!address) throw new Error("No Stellar wallet connected");
      return readKind() === "freighter" ? signWithFreighter(address, xdr) : signWithWalletConnect(address, xdr);
    },
    [],
  );

  return {
    stellarAddress: state.address,
    isStellarConnected: !!state.address,
    isStellarConnecting: state.isConnecting,
    stellarConnectUri: state.connectUri,
    cancelStellarConnect,
    connectStellar,
    disconnectStellar,
    sendUsdc,
    signStellarTransaction,
  };
}
