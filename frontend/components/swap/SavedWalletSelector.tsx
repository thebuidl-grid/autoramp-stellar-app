"use client";

import { useSavedWallets } from "@/lib/hooks/use-saved-wallets";
import { Wallet, ChevronDown } from "lucide-react";
import Link from "next/link";

interface SavedWalletSelectorProps {
    onSelect: (walletAddress: string) => void;
    onAddNew?: () => void;
}

export function SavedWalletSelector({ onSelect, onAddNew }: SavedWalletSelectorProps) {
    const { data: wallets, isLoading } = useSavedWallets();

    if (isLoading || !wallets || wallets.length === 0) {
        return (
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className="ramp-label">Saved wallets</span>
                </div>
                <button
                    type="button"
                    onClick={onAddNew}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-(--r-line) px-4 text-sm text-(--r-muted) transition-colors hover:border-(--r-muted)/50 hover:text-(--r-text)"
                >
                    <Wallet className="w-4 h-4" />
                    Add a wallet
                </button>
            </div>
        );
    }

    const formatAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="ramp-label">Saved wallets</span>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onAddNew}
                        className="text-xs font-medium text-(--r-text) underline-offset-2 hover:underline"
                    >
                        Add New
                    </button>
                    <Link
                        href="/profile?tab=wallets"
                        className="text-xs text-(--r-muted) underline-offset-2 hover:text-(--r-text) hover:underline"
                    >
                        Manage
                    </Link>
                </div>
            </div>
            <div className="relative">
                <select
                    onChange={(e) => {
                        const selected = wallets.find((wallet) => wallet.id === e.target.value);
                        if (selected) {
                            onSelect(selected.address);
                        }
                    }}
                    className="ramp-field h-12 w-full appearance-none px-4 pr-10 text-sm text-(--r-text) outline-none font-mono"
                >
                    <option value="">Select a saved wallet...</option>
                    {wallets.map((wallet) => (
                        <option key={wallet.id} value={wallet.id} className="bg-zinc-900">
                            {wallet.name || "Wallet"} - {formatAddress(wallet.address)} ({wallet.network})
                        </option>
                    ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--r-muted)" />
            </div>
        </div>
    );
}
