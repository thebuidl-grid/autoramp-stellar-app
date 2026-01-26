"use client";

import { FileText, CheckCircle2 } from "lucide-react";
import { Label } from "@/components/ui/label";

interface BusinessDetailsViewProps {
    data: any;
}

export default function BusinessDetailsView({ data }: BusinessDetailsViewProps) {
    const info = data?.businessDetails || data; // Handle both nested and flat structures

    const DisplayField = ({ label, value }: { label: string, value?: string }) => (
        <div className="space-y-1">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">{label}</Label>
            <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm font-medium">
                {value || "N/A"}
            </div>
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <DisplayField label="Business Name" value={info?.name} />
                <DisplayField label="Nature of Business" value={info?.natureOfBusiness} />
                <div className="md:col-span-2">
                    <DisplayField label="Business Description" value={info?.description} />
                </div>
                <DisplayField label="Website URL" value={info?.websiteUrl} />
                <DisplayField label="Address Line 1" value={info?.addressLine1} />
                <DisplayField label="Address Line 2" value={info?.addressLine2} />
                <DisplayField label="City" value={info?.city} />
                <DisplayField label="State" value={info?.state} />
                <DisplayField label="Postal Code" value={info?.postalCode} />
                <DisplayField label="Country" value={info?.country} />
            </div>
        </div>
    );
}
