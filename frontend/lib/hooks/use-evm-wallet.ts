"use client";

import { useCallback, useState } from "react";
import { useEvmWalletStore } from "@/lib/store";
import { requestEvmAccount, sendRawTransaction, switchToChain, CHAIN_ID_TO_NAME, getInjectedProvider } from "@/lib/evm-tx";

/**
 * EVM wallet connection hook — a lightweight injected-provider (MetaMask
 * etc.) reader, not a full wagmi setup. Reads address + chain, and can
 * submit an arbitrary unsigned transaction (approve/burn calldata from the
 * bridge API) the wallet itself prompts the user to approve. No custody, no
 * signing key ever touches this app.
 */
export function useEvmWallet() {
  const address = useEvmWalletStore((state) => state.address);
  const chainName = useEvmWalletStore((state) => state.chainName);
  const setWallet = useEvmWalletStore((state) => state.setWallet);
  const clearWallet = useEvmWalletStore((state) => state.clearWallet);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const { address: connectedAddress, chainId } = await requestEvmAccount();
      const name = CHAIN_ID_TO_NAME[chainId] ?? null;
      setWallet(connectedAddress, name);
      if (!name) {
        setError(`Unsupported network — switch your wallet to Base or Ethereum Sepolia`);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect wallet");
    } finally {
      setIsConnecting(false);
    }
  }, [setWallet]);

  /** Connects (if needed) AND actively switches the wallet to the requested chain — "pick a chain" for real, not just reading whatever network it's already on. */
  const connectToChain = useCallback(
    async (chainName: string) => {
      setIsConnecting(true);
      setError(null);
      try {
        await requestEvmAccount(); // ensures the wallet is unlocked/permitted before we ask it to switch networks
        await switchToChain(chainName);
        const { address: connectedAddress, chainId } = await requestEvmAccount();
        const name = CHAIN_ID_TO_NAME[chainId] ?? null;
        setWallet(connectedAddress, name);
        if (name !== chainName) {
          setError(`Wallet is still on a different network — please approve the switch to continue`);
        }
      } catch (err: any) {
        setError(err?.message || "Failed to connect wallet");
      } finally {
        setIsConnecting(false);
      }
    },
    [setWallet],
  );

  const disconnect = useCallback(() => {
    clearWallet();
    setError(null);
  }, [clearWallet]);

  const sendTransaction = useCallback(
    async (tx: { to: string; data: string; value?: string }) => {
      if (!address) throw new Error("Wallet not connected");
      return sendRawTransaction({ from: address, ...tx });
    },
    [address],
  );

  return {
    address,
    chainName,
    isConnected: !!address,
    isConnecting,
    error,
    hasInjectedWallet: !!getInjectedProvider(),
    connect,
    connectToChain,
    disconnect,
    sendTransaction,
  };
}
