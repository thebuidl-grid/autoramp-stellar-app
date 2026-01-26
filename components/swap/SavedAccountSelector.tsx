"use client";

import { useSavedAccounts } from "@/lib/hooks/use-saved-accounts";
import { Building2, ChevronDown } from "lucide-react";
import Link from "next/link";

interface SavedAccountSelectorProps {
    onSelect: (account: { bankCode: string; accountNumber: string; bankName: string }) => void;
}

export function SavedAccountSelector({ onSelect }: SavedAccountSelectorProps) {
    const { data: accounts, isLoading } = useSavedAccounts();

    if (isLoading || !accounts || accounts.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-sm text-white/70">Quick Select</label>
                <Link
                    href="/profile?tab=accounts"
                    className="text-xs text-primary hover:text-primary/80"
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
                            });
                        }
                    }}
                    className="w-full h-12 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white outline-none appearance-none pr-10 hover:bg-white/10 transition-colors"
                >
                    <option value="">Select a saved account...</option>
                    {accounts.map((account) => (
                        <option key={account.id} value={account.id} className="bg-zinc-900">
                            {account.bankName} - {account.accountNumber}
                        </option>
                    ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
            </div>
        </div>
    );
}
