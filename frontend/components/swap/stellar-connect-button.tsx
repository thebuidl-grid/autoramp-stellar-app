"use client";

import { Button } from "@/components/ui/button";
import { useStellarWallet } from "@/lib/hooks/use-stellar-wallet";

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Stellar equivalent of RainbowKit's <ConnectButton /> for Base.
 */
export function StellarConnectButton() {
  const { address, isConnected, isConnecting, connect, disconnect } = useStellarWallet();

  if (isConnected && address) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => disconnect()}
        title="Click to disconnect"
      >
        {truncateAddress(address)}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      isLoading={isConnecting}
      onClick={() => connect()}
    >
      Connect Wallet
    </Button>
  );
}
