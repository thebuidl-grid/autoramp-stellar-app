"use client";

import { Building2, CreditCard } from "lucide-react";
import { Label } from "@/components/ui/label";

interface BankAccountViewProps {
    data: any;
}

export default function BankAccountView({ data }: BankAccountViewProps) {
    const info = data?.bankAccount || data;

    const DisplayField = ({ label, value }: { label: string, value?: string }) => (
        <div className="space-y-1">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">{label}</Label>
            <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm font-medium text-white flex items-center gap-3">
                {label === "Bank Name" && <Building2 className="w-4 h-4 text-primary" />}
                {label === "Account Number" && <CreditCard className="w-4 h-4 text-secondary" />}
                {value || "N/A"}
            </div>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="bg-gradient-to-br from-primary/10 to-secondary/10 border border-white/10 rounded-2xl p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="md:col-span-2">
                        <DisplayField label="Account Name" value={info?.accountName} />
                    </div>
                    <DisplayField label="Bank Name" value={info?.bankName} />
                    <DisplayField label="Bank Code" value={info?.bankCode} />
                    <DisplayField label="Account Number" value={info?.accountNumber} />
                    <DisplayField label="Branch" value={info?.metadata?.branch} />
                </div>
            </div>

            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm text-blue-400">
                <p>This is your primary settlement account. All crypto-to-fiat transactions will be credited here.</p>
            </div>
        </div>
    );
}
