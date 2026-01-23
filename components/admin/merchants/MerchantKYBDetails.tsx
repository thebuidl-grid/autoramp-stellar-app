"use client";

import { useState } from "react";
import {
    Building2,
    User,
    FileText,
    Landmark,
    CheckCircle2,
    XCircle,
    Download,
    ExternalLink,
    AlertCircle,
    Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { adminApi, MerchantUser } from "@/lib/api";
import { cn } from "@/lib/utils";

interface MerchantKYBDetailsProps {
    merchant: MerchantUser;
    onStatusUpdate?: () => void;
}

export function MerchantKYBDetails({ merchant, onStatusUpdate }: MerchantKYBDetailsProps) {
    const [isUpdating, setIsUpdating] = useState(false);
    const { toast } = useToast();
    const kyb = merchant.kyb;

    if (!kyb) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                <AlertCircle className="h-12 w-12 text-zinc-500" />
                <div className="space-y-1">
                    <h3 className="text-xl font-bold text-white">No KYB Data</h3>
                    <p className="text-zinc-500">This merchant hasn't submitted their KYB application yet.</p>
                </div>
            </div>
        );
    }

    const handleUpdateStatus = async (status: "APPROVED" | "REJECTED") => {
        setIsUpdating(true);
        try {
            await adminApi.updateMerchantKYBStatus(merchant.id, status);
            toast({
                title: "Status Updated",
                description: `Merchant KYB has been ${status.toLowerCase()} successfully.`,
                variant: "success",
            });
            onStatusUpdate?.();
        } catch (error: any) {
            toast({
                title: "Update Failed",
                description: error.response?.data?.message || "Failed to update merchant status.",
                variant: "destructive",
            });
        } finally {
            setIsUpdating(false);
        }
    };

    const SectionHeader = ({ title, icon: Icon }: { title: string, icon: any }) => (
        <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-2">
            <Icon className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-white tracking-tight">{title}</h3>
        </div>
    );

    const DetailItem = ({ label, value, fullWidth = false }: { label: string, value: string | undefined | null, fullWidth?: boolean }) => (
        <div className={cn("space-y-1", fullWidth ? "col-span-1 md:col-span-2" : "col-span-1")}>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</p>
            <p className="text-sm text-zinc-200 font-medium break-words">{value || "N/A"}</p>
        </div>
    );

    const DocumentItem = ({ label, url }: { label: string, url: string | undefined | null }) => (
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-md">
                    <FileText className="h-4 w-4 text-primary" />
                </div>
                <div>
                    <p className="text-sm font-medium text-zinc-200">{label}</p>
                    <p className="text-[10px] text-zinc-500">Portable Document Format (.pdf)</p>
                </div>
            </div>
            {url ? (
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" asChild className="h-8 text-zinc-400 hover:text-white">
                        <a href={url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-2" /> View
                        </a>
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 text-zinc-400 hover:text-white">
                        <Download className="h-4 w-4" />
                    </Button>
                </div>
            ) : (
                <span className="text-xs text-zinc-600 italic">Not Uploaded</span>
            )}
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Status Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className={cn(
                        "p-3 rounded-full",
                        kyb.status === "APPROVED" ? "bg-green-500/10 text-green-500" :
                            kyb.status === "PENDING" ? "bg-amber-500/10 text-amber-500" : "bg-red-500/10 text-red-500"
                    )}>
                        {kyb.status === "APPROVED" ? <CheckCircle2 className="h-8 w-8" /> :
                            kyb.status === "PENDING" ? <Clock className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">{kyb.businessName}</h2>
                        <p className="text-zinc-500 flex items-center gap-2 text-sm">
                            KYB Status: <span className={cn(
                                "font-bold",
                                kyb.status === "APPROVED" ? "text-green-500" :
                                    kyb.status === "PENDING" ? "text-amber-500" : "text-red-500"
                            )}>{kyb.status}</span>
                        </p>
                    </div>
                </div>

                {kyb.status === "PENDING" && (
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            className="bg-red-500/5 border-red-500/20 text-red-500 hover:bg-red-500/10 hover:border-red-500/50"
                            onClick={() => handleUpdateStatus("REJECTED")}
                            disabled={isUpdating}
                        >
                            <XCircle className="w-4 h-4 mr-2" /> Reject Application
                        </Button>
                        <Button
                            className="bg-green-500 text-white hover:bg-green-600 min-w-[140px]"
                            onClick={() => handleUpdateStatus("APPROVED")}
                            disabled={isUpdating}
                        >
                            {isUpdating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                            Approve Access
                        </Button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column: Business & Contact */}
                <div className="space-y-8">
                    <Card className="bg-white/5 border-white/10 backdrop-blur-md overflow-hidden">
                        <CardHeader className="bg-white/5 border-b border-white/5">
                            <CardTitle className="text-lg text-white font-bold">Business Profile</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <DetailItem label="Legal Business Name" value={kyb.businessName} />
                            <DetailItem label="Trading Name" value={kyb.tradingName} />
                            <DetailItem label="Business Email" value={kyb.email} />
                            <DetailItem label="Website / Product URL" value={kyb.websiteUrl} />
                            <DetailItem label="Nature of Business" value={kyb.natureOfBusiness} fullWidth />
                        </CardContent>
                    </Card>

                    <Card className="bg-white/5 border-white/10 backdrop-blur-md overflow-hidden">
                        <CardHeader className="bg-white/5 border-b border-white/5">
                            <CardTitle className="text-lg text-white font-bold">Contact & Identification</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <DetailItem label="Contact Person" value={kyb.contactPerson} />
                            <DetailItem label="Contact Phone" value={kyb.contactPhone} />
                            <DetailItem label="BVN" value={kyb.bvn} />
                            <DetailItem label="TIN" value={kyb.tin} />
                        </CardContent>
                    </Card>

                    <Card className="bg-white/5 border-white/10 backdrop-blur-md overflow-hidden">
                        <CardHeader className="bg-white/5 border-b border-white/5">
                            <CardTitle className="text-lg text-white font-bold">Directors & Funds</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <DetailItem label="Number of Directors" value={kyb.numberOfDirectors} />
                            <DetailItem label="Source of Capital" value={kyb.capitalSource} />
                            <DetailItem label="Company Directors" value={kyb.companyDirectors} fullWidth />
                            <DetailItem label="ID Document Type" value={kyb.idType} fullWidth />
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Documents */}
                <div className="space-y-8">
                    <Card className="bg-white/5 border-white/10 backdrop-blur-md overflow-hidden">
                        <CardHeader className="bg-white/5 border-b border-white/5">
                            <CardTitle className="text-lg text-white font-bold">Legal Documents</CardTitle>
                            <CardDescription className="text-zinc-500">Corporate registration and address verification documents.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <DocumentItem label="CAC Certificate" url={kyb.cacCertificate} />
                            <DocumentItem label="CAC E-Status Report" url={kyb.cacEStatus} />
                            <DocumentItem label="MEMART" url={kyb.memart} />
                            <DocumentItem label="Memorandum of Association" url={kyb.memorandum} />
                            <DocumentItem label="Business Proof of Address" url={kyb.proofOfAddress} />
                        </CardContent>
                    </Card>

                    <Card className="bg-white/5 border-white/10 backdrop-blur-md overflow-hidden">
                        <CardHeader className="bg-white/5 border-b border-white/5 text-white">
                            <CardTitle className="text-lg font-bold">Supporting Documents</CardTitle>
                            <CardDescription className="text-zinc-500">Director verification and proof of funds.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <DocumentItem label="Proof of Funds" url={kyb.proofOfFunds} />
                            <DocumentItem label="Director Proof of Address" url={kyb.directorProofOfAddress} />
                            <DocumentItem label="Identity Document (Selected Type)" url={kyb.idDocument} />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
