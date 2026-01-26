"use client";

import { FileText, CheckCircle2, User } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Director {
    firstName?: string;
    lastName?: string;
    nationality?: string;
    bvn?: string;
    proofOfAddress?: string;
    idType?: string;
    idUrl?: string;
    role?: string;
    metadata?: {
        role?: string;
    };
}

interface DirectorsViewProps {
    data: any;
}

export default function DirectorsView({ data }: DirectorsViewProps) {
    const directors: Director[] = Array.isArray(data?.directors) ? data.directors : data?.director ? [data.director] : [];

    const DisplayField = ({ label, value }: { label: string, value?: string | number }) => (
        <div className="space-y-1">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">{label}</Label>
            <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm font-medium text-white">
                {value?.toString() || "N/A"}
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
                                <CheckCircle2 className="w-3 h-3" /> Uploaded
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <a href={value} target="_blank" rel="noopener noreferrer">View</a>
                    </Button>
                </div>
            ) : (
                <div className="bg-black/20 border border-white/5 border-dashed rounded-xl p-4 text-center text-sm text-muted-foreground">
                    Not provided
                </div>
            )}
        </div>
    );

    if (directors.length === 0) {
        return (
            <div className="text-center py-12 bg-white/5 border border-white/10 rounded-2xl border-dashed">
                <User className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                <p className="text-muted-foreground">No directors information found.</p>
            </div>
        );
    }

    return (
        <div className="space-y-12 animate-in fade-in duration-500">
            {directors.map((director: Director, index: number) => (
                <div key={index} className={index !== 0 ? "pt-12 border-t border-white/10" : ""}>
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center">
                            <User className="text-secondary w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white">{director?.firstName} {director?.lastName}</h3>
                            <p className="text-sm text-muted-foreground">{director?.metadata?.role || director?.role || "Director"}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <DisplayField label="First Name" value={director?.firstName} />
                        <DisplayField label="Last Name" value={director?.lastName} />
                        <DisplayField label="Nationality" value={director?.nationality} />
                        <DisplayField label="BVN" value={director?.bvn} />
                        <DisplayField label="Role/Designation" value={director?.metadata?.role || director?.role} />
                        <DisplayField label="ID Type" value={director?.idType} />

                        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                            <DocumentPreview label="ID Document" value={director?.idUrl} />
                            <DocumentPreview label="Proof of Address" value={director?.proofOfAddress} />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
