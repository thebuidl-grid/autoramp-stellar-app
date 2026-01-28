"use client";

import { FileText, CheckCircle2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface DocumentationViewProps {
    data: any;
}

export default function DocumentationView({ data }: DocumentationViewProps) {
    const info = data?.documentation || data;

    const DisplayField = ({ label, value }: { label: string, value?: string }) => (
        <div className="space-y-1">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">{label}</Label>
            <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm font-medium">
                {value || "N/A"}
            </div>
        </div>
    );

    const DocumentPreview = ({ label, value }: { label: string, value?: string }) => (
        <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">{label}</Label>
            {value ? (
                <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                            <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-medium">{label}</p>
                            <p className="text-xs text-green-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Attached
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <a href={value} target="_blank" rel="noopener noreferrer">View</a>
                    </Button>
                </div>
            ) : (
                <div className="bg-black/20 border border-white/5 border-dashed rounded-xl p-4 text-center text-sm text-muted-foreground">
                    No document attached
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <DisplayField label="Trading Name" value={info?.tradingName} />
                <DisplayField label="Tax Identification Number (TIN)" value={info?.taxIdentificationNumber} />
                <DisplayField label="Source of Capital" value={info?.capitalSource} />
                <DisplayField label="Proof of Funds" value={info?.proofOfFunds} />

                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <DocumentPreview label="CAC Certificate" value={info?.cacCertificate} />
                    <DocumentPreview label="CAC E-Status" value={info?.cacEStatus} />
                    <DocumentPreview label="MEMART" value={info?.memart} />
                    <DocumentPreview label="Memorandum" value={info?.memorandum} />
                    <DocumentPreview label="Proof of Business Address" value={info?.proofOfAddress} />
                </div>
            </div>
        </div>
    );
}
