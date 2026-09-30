"use client";

import { useCallback, useState } from "react";
import type { ISupportedWallet } from "@creit.tech/stellar-wallets-kit";
import { getStellarWalletsKit, refreshStellarWalletsKit, STELLAR_NETWORK_PASSPHRASE } from "@/lib/stellar-wallet-config";
import { useStellarWalletStore } from "@/lib/store";

/**
 * Stellar wallet connection hook — replaces wagmi's useAccount +
 * RainbowKit's ConnectButton for Base. Backed by a zustand store so the
 * connected address is shared across components without a context provider.
 */
export function useStellarWallet() {
  const address = useStellarWalletStore((state) => state.address);
  const setWallet = useStellarWalletStore((state) => state.setWallet);
  const clearWallet = useStellarWalletStore((state) => state.clearWallet);
  const [isConnecting, setIsConnecting] = useState(false);

  const connect = useCallback(() => {
    // Fresh instance on every explicit connect attempt, not the cached
    // singleton — its wallet-availability scan is a one-shot, 500ms-timeout
    // race at construction time, so reusing a stale instance can leave a
    // genuinely-installed wallet permanently shown as "Not available" for
    // the rest of the session. See refreshStellarWalletsKit's doc comment.
    const kit = refreshStellarWalletsKit();
    setIsConnecting(true);
    return kit
      .openModal({
        onWalletSelected: async (option: ISupportedWallet) => {
          try {
            kit.setWallet(option.id);
            const { address: connectedAddress } = await kit.getAddress();
            setWallet(connectedAddress, option.id);
          } finally {
            setIsConnecting(false);
          }
        },
        onClosed: () => setIsConnecting(false),
      })
      .catch(() => setIsConnecting(false));
  }, [setWallet]);

  const disconnect = useCallback(async () => {
    const kit = getStellarWalletsKit();
    await kit.disconnect().catch(() => {});
    clearWallet();
  }, [clearWallet]);

  const signTransaction = useCallback(
    async (xdr: string): Promise<string> => {
      if (!address) throw new Error("Wallet not connected");
      const walletId = useStellarWalletStore.getState().walletId;
      const kit = getStellarWalletsKit();
      if (walletId) kit.setWallet(walletId);
      const { signedTxXdr } = await kit.signTransaction(xdr, {
        address,
        networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
      });
      return signedTxXdr;
    },
    [address]
  );

  return {
    address,
    isConnected: !!address,
    isConnecting,
    connect,
    disconnect,
    signTransaction,
  };
}
