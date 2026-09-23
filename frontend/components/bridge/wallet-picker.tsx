"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStellarWallet } from "@/lib/hooks/use-stellar-wallet";
import { useEvmWallet } from "@/lib/hooks/use-evm-wallet";
import { useBridgeChains } from "@/lib/hooks/use-bridge";

export const CHAIN_LABELS: Record<string, string> = {
  stellar: "Stellar",
  base: "Base",
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
  optimism: "Optimism",
  polygon: "Polygon",
  avalanche: "Avalanche",
};

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export interface WalletPickerProps {
  onResolved: (chain: string, address: string, walletType: "evm" | "stellar") => void;
  /** Called when the user disconnects this slot — parent should clear whatever chain/address state it stored from onResolved. */
  onDisconnect?: () => void;
  /** Wallet TYPE already claimed by a sibling picker (e.g. the source side). Only one Stellar connection and one EVM connection can exist at a time — through a browser wallet extension — so this hides the whole type here, not just one chain within it. */
  excludeType?: "evm" | "stellar" | null;
  /** Optional manual-entry UI rendered below the picker when nothing's connected — e.g. Send's destination still supports paying a third party. */
  fallback?: ReactNode;
}

/**
 * Single "Connect Wallet" entry point for the bridge UI. Stellar and EVM
 * connection state live in global stores (one Stellar wallet, one EVM
 * wallet, app-wide) — but each WalletPicker instance is a distinct UI
 * slot (e.g. "sending from" vs "destination"). Re-deriving "which wallet
 * is THIS slot showing" from those global stores on every render doesn't
 * work: once both a Stellar and an EVM wallet are connected, there's no
 * way to tell which slot owns which without picking an arbitrary priority
 * order (stellar-first, say) — and that arbitrary order can disagree with
 * what the user actually clicked in THIS slot's dropdown, flipping the
 * display back and forth every render and infinite-looping.
 *
 * Fix: remember which type the user explicitly picked for THIS slot
 * (`chosenType`), and stick to it — never re-derive it from live
 * connection state. It only changes on an explicit click here: picking a
 * dropdown option, or hitting disconnect.
 */
export function WalletPicker({ onResolved, onDisconnect, excludeType, fallback }: WalletPickerProps) {
  const stellar = useStellarWallet();
  const evm = useEvmWallet();
  const { data: chains = [], isLoading: isLoadingChains, isError: chainsFailedToLoad, refetch: refetchChains } = useBridgeChains();
  const [chosenType, setChosenType] = useState<"evm" | "stellar" | null>(null);

  useEffect(() => {
    if (chosenType === "stellar" && stellar.address) onResolved("stellar", stellar.address, "stellar");
    if (chosenType === "evm" && evm.address && evm.chainName) onResolved(evm.chainName, evm.address, "evm");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenType, stellar.address, evm.address, evm.chainName]);

  const disconnect = () => {
    if (chosenType === "stellar") stellar.disconnect();
    if (chosenType === "evm") evm.disconnect();
    setChosenType(null);
    onDisconnect?.();
  };

  if (chosenType === "stellar" && stellar.address) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={disconnect} title="Click to disconnect">
        Stellar: {truncateAddress(stellar.address)}
      </Button>
    );
  }

  if (chosenType === "evm" && evm.address) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={disconnect} title="Click to disconnect">
        {evm.chainName ? `${CHAIN_LABELS[evm.chainName] ?? evm.chainName}: ` : ""}
        {truncateAddress(evm.address)}
      </Button>
    );
  }

  const isConnecting = stellar.isConnecting || evm.isConnecting;
  const evmChains = chains.filter((c) => c.chainType === "EVM");
  // Only trust "no EVM chains" once the registry has genuinely, successfully
  // loaded — useBridgeChains() defaults to [] both while its query is still
  // in flight AND after it's failed outright (backend down), and those are
  // both distinct from "the registry is genuinely just Stellar." Silently
  // falling back to Stellar-only in either case hides a real problem behind
  // what looks like a normal, complete dropdown.
  const chainsLoaded = !isLoadingChains && !chainsFailedToLoad;
  const stellarChainKnown = chainsLoaded && (chains.length === 0 || chains.some((c) => c.chainType === "STELLAR"));

  return (
    <div className="space-y-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={chainsFailedToLoad ? "outline" : "default"}
            isLoading={isConnecting || isLoadingChains}
          >
            {chainsFailedToLoad ? "Couldn't load chains" : "Connect Wallet"}
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {chainsFailedToLoad && (
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                refetchChains();
              }}
            >
              Couldn&apos;t reach the server — click to retry
            </DropdownMenuItem>
          )}
          {excludeType !== "stellar" && stellarChainKnown && (
            <DropdownMenuItem
              onClick={() => {
                setChosenType("stellar");
                stellar.connect();
              }}
            >
              Stellar
            </DropdownMenuItem>
          )}
          {excludeType !== "evm" &&
            evmChains.map((chain) => (
              <DropdownMenuItem
                key={chain.name}
                onClick={() => {
                  setChosenType("evm");
                  evm.connectToChain(chain.name);
                }}
                disabled={!evm.hasInjectedWallet}
              >
                {CHAIN_LABELS[chain.name] ?? chain.name}
                {!evm.hasInjectedWallet ? " (no wallet found)" : ""}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {chosenType === "evm" && evm.error && <p className="text-xs text-red-400">{evm.error}</p>}
      {fallback}
    </div>
  );
}
