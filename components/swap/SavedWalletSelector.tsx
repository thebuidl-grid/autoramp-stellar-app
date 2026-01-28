"use client";

import { useSavedWallets } from "@/lib/hooks/use-saved-wallets";
import { Wallet, ChevronDown } from "lucide-react";
import Link from "next/link";

interface SavedWalletSelectorProps {
    onSelect: (walletAddress: string) => void;
}

export function SavedWalletSelector({ onSelect }: SavedWalletSelectorProps) {
    const { data: wallets, isLoading } = useSavedWallets();

    if (isLoading || !wallets || wallets.length === 0) {
        return null;
    }

    const formatAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-sm text-white/70">Quick Select</label>
                <Link
                    href="/profile?tab=wallets"
                    className="text-xs text-primary hover:text-primary/80"
                >
                    Manage wallets
                </Link>
            </div>
            <div className="relative">
                <select
                    onChange={(e) => {
                        const selected = wallets.find((wallet) => wallet.id === e.target.value);
                        if (selected) {
                            onSelect(selected.walletAddress);
                        }
                    }}
                    className="w-full h-12 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white outline-none appearance-none pr-10 hover:bg-white/10 transition-colors font-mono"
                >
                    <option value="">Select a saved wallet...</option>
                    {wallets.map((wallet) => (
                        <option key={wallet.id} value={wallet.id} className="bg-zinc-900">
                            {wallet.name || "Wallet"} - {formatAddress(wallet.walletAddress)}
                        </option>
                    ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
            </div>
        </div>
    );
}
