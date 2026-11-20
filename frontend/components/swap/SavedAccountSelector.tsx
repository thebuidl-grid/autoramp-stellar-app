"use client";

import { useSavedAccounts } from "@/lib/hooks/use-saved-accounts";
import { Building2, ChevronDown } from "lucide-react";
import Link from "next/link";

interface SavedAccountSelectorProps {
    onSelect: (account: { bankCode: string; accountNumber: string; bankName: string; accountName?: string }) => void;
}

export function SavedAccountSelector({ onSelect }: SavedAccountSelectorProps) {
    const { data: accounts, isLoading } = useSavedAccounts();

    if (isLoading || !accounts || accounts.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="ramp-label">Saved bank accounts</span>
                <Link
                    href="/profile?tab=accounts"
                    className="text-xs font-medium text-(--r-text) underline-offset-2 hover:underline"
                >
                    Manage accounts
                </Link>
            </div>
            <div className="relative">
                <select
                    onChange={(e) => {
                        const selected = accounts.find((acc) => acc.id === e.target.value);
                        if (selected) {
                            onSelect({
                                bankCode: selected.bankCode,
                                accountNumber: selected.accountNumber,
                                bankName: selected.bankName,
                                accountName: selected.accountName,
                            });
                        }
                    }}
                    className="ramp-field h-12 w-full appearance-none px-4 pr-10 text-sm text-(--r-text) outline-none"
                >
                    <option value="">Select a saved account...</option>
                    {accounts.map((account) => (
                        <option key={account.id} value={account.id} className="bg-zinc-900">
                            {account.bankName} - {account.accountNumber}
                        </option>
                    ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--r-muted)" />
            </div>
        </div>
    );
}
