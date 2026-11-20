"use client";

import { useCallback, useEffect, useState } from "react";
import { IS_TESTNET } from "@/lib/constants/networks";

/**
 * Stellar wallet connection (Freighter/Varial, xBull, Albedo, Lobstr, Hana,
 * Rabet, WalletConnect, ...) via @creit.tech/stellar-wallets-kit.
 *
 * Mirrors the Stacks wallet hook: a module-level shared state + listeners so
 * every useStellarWallet() instance (header, sell panel, ...) stays in sync,
 * and the kit is lazily imported + initialized only on first use.
 */

type WalletState = { address: string | null; isConnecting: boolean };

const STELLAR_ADDRESS_KEY = "stellar-wallet-address";

function readInitialStellarAddress(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STELLAR_ADDRESS_KEY);
  } catch {
    return null;
  }
}

let sharedState: WalletState = {
  address: readInitialStellarAddress(),
  isConnecting: false,
};
let kitInitialized = false;
const listeners = new Set<() => void>();

function setSharedState(next: Partial<WalletState>) {
  sharedState = { ...sharedState, ...next };
  listeners.forEach((l) => l());
}

async function getKit() {
  const { StellarWalletsKit, Networks } = await import(
    "@creit.tech/stellar-wallets-kit"
  );
  const { defaultModules } = await import(
    "@creit.tech/stellar-wallets-kit/modules/utils"
  );
  if (!kitInitialized) {
    // Freighter was renamed Varial. Show it as "Varial (formerly Freighter)" so users find it under
    // either name; it talks to the same extension through @stellar/freighter-api.
    const { VarialModule, VARIAL_ID } = await import(
      "@creit.tech/stellar-wallets-kit/modules/varial"
    );
    class FreighterWalletModule extends VarialModule {
      constructor() {
        super();
        this.productId = "freighter";
        this.productName = "Varial (formerly Freighter)";
        this.productUrl = "https://www.freighter.app/";
        this.productIcon = "https://stellar.creit.tech/wallet-icons/freighter.png";
      }
      // The kit decides "installed" from a single 1s round trip and otherwise shows "Install", which
      // opens the website even when the extension is there. Always offer the wallet and detect the
      // extension when the user actually clicks it, with a clear error if it is missing.
      async isAvailable() {
        return typeof window !== "undefined";
      }
      async getAddress(params?: { skipRequestAccess?: boolean }) {
        const w = window as unknown as { freighter?: unknown; varial?: unknown };
        let present = !!(w.freighter || w.varial);
        if (!present) {
          present = await Promise.race<boolean>([
            VarialModule.prototype.isAvailable.call(this),
            new Promise<boolean>((r) => setTimeout(() => r(false), 4000)),
          ]).catch(() => false);
        }
        if (!present) {
          throw {
            code: -1,
            message:
              "Varial (formerly Freighter) wasn't detected. Install it from https://www.varialwallet.com/, allow it on this site, then reload.",
          };
        }
        return super.getAddress(params ?? {});
      }
    }
    StellarWalletsKit.init({
      modules: [
        new FreighterWalletModule(),
        ...defaultModules({ filterBy: (m) => m.productId !== VARIAL_ID }),
      ],
      network: IS_TESTNET ? Networks.TESTNET : Networks.PUBLIC,
    });
    kitInitialized = true;
  }
  return StellarWalletsKit;
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
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const connectStellar = useCallback(async () => {
    if (sharedState.isConnecting) return;
    setSharedState({ isConnecting: true });
    try {
      const kit = await getKit();
      const { address } = await kit.authModal();
      if (address) {
        setSharedState({ address });
        try {
          localStorage.setItem(STELLAR_ADDRESS_KEY, address);
        } catch {}
      }
    } catch (err) {
      console.error("Stellar wallet connect failed", err);
      const message = (err as { message?: string })?.message;
      if (message && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("stellar-wallet-error", { detail: message }));
      }
    } finally {
      setSharedState({ isConnecting: false });
    }
  }, []);

  const disconnectStellar = useCallback(async () => {
    try {
      const kit = await getKit();
      await kit.disconnect();
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(STELLAR_ADDRESS_KEY);
    } catch {}
    setSharedState({ address: null });
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
      const kit = await getKit();
      const {
        buildUsdcPaymentXdr,
        submitSignedXdr,
        STELLAR_NETWORK_PASSPHRASE,
      } = await import("@/lib/stellar-funding");
      const xdr = await buildUsdcPaymentXdr(address, funding);
      const { signedTxXdr } = await kit.signTransaction(xdr, {
        networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
        address,
      });
      return submitSignedXdr(signedTxXdr);
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
      const kit = await getKit();
      const { STELLAR_NETWORK_PASSPHRASE } = await import(
        "@/lib/stellar-funding"
      );
      const { signedTxXdr } = await kit.signTransaction(xdr, {
        networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
        address,
      });
      return signedTxXdr;
    },
    [],
  );

  return {
    stellarAddress: state.address,
    isStellarConnected: !!state.address,
    isStellarConnecting: state.isConnecting,
    connectStellar,
    disconnectStellar,
    sendUsdc,
    signStellarTransaction,
  };
}
