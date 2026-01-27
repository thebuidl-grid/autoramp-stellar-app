"use client";

import { useState } from "react";
import {
    Building2,
    User,
    FileText,
    Landmark,
    CheckCircle2,
    Clock,
    XCircle,
    Download,
    ExternalLink,
    AlertCircle,
    Loader2,
    Users
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { adminApi, MerchantUser, Director, Shareholder } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DocumentViewer } from "./DocumentViewer";
import { DocumentPreviewDialog } from "./DocumentPreviewDialog";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MerchantKYBDetailsProps {
    merchant: MerchantUser;
    onStatusUpdate?: () => void;
}

export function MerchantKYBDetails({ merchant, onStatusUpdate }: MerchantKYBDetailsProps) {
    const [isUpdating, setIsUpdating] = useState(false);
    const [previewDoc, setPreviewDoc] = useState<{ url: string; label: string } | null>(null);
    const [selectedDirectorId, setSelectedDirectorId] = useState<string | null>(null);
    const [selectedShareholderId, setSelectedShareholderId] = useState<string | null>(null);
    const { toast } = useToast();

    // Use the first documentation if available (consolidated in parent)
    const docs = merchant.documentations?.[0];

    // If no onboarding data at all
    if (!merchant.name && !docs) {
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
            await adminApi.updateMerchant(merchant.id, { status });
            toast({
                title: "Status Updated",
                description: `Merchant status has been ${status.toLowerCase()} successfully.`,
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

    const DetailItem = ({ label, value, fullWidth = false }: { label: string, value: string | undefined | null, fullWidth?: boolean }) => (
        <div className={cn("space-y-1", fullWidth ? "col-span-1 md:col-span-2" : "col-span-1")}>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</p>
            <p className="text-sm text-zinc-200 font-medium break-words">{value || "N/A"}</p>
        </div>
    );

    const PersonList = ({ list, type, onSelect, selectedId }: {
        list: (Director | Shareholder)[],
        type: 'director' | 'shareholder',
        onSelect: (id: string) => void,
        selectedId: string | null
    }) => (
        <div className="space-y-3">
            {list.map((person) => (
                <button
                    key={person.id}
                    onClick={() => onSelect(person.id)}
                    className={cn(
                        "w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left",
                        selectedId === person.id
                            ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(var(--primary),0.1)]"
                            : "bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10"
                    )}
                >
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "p-2 rounded-lg",
                            selectedId === person.id ? "bg-primary text-black" : "bg-zinc-800 text-zinc-400"
                        )}>
                            <User className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="font-bold text-white">{person.firstName} {person.lastName}</p>
                            <p className="text-xs text-zinc-500">
                                {type === 'director' ? (person as Director).metadata?.role || 'Director' : 'Shareholder'}
                            </p>
                        </div>
                    </div>
                    <div className={cn(
                        "h-6 w-6 rounded-full flex items-center justify-center transition-transform",
                        selectedId === person.id ? "bg-primary text-black rotate-90" : "bg-zinc-800 text-zinc-400"
                    )}>
                        <ExternalLink className="h-3 w-3" />
                    </div>
                </button>
            ))}
        </div>
    );

    const PersonDetail = ({ person, type }: { person: Director | Shareholder, type: 'director' | 'shareholder' }) => (
        <Card className="bg-white/5 border-white/10 backdrop-blur-md overflow-hidden animate-in fade-in slide-in-from-right-4">
            <CardHeader className="bg-white/5 border-b border-white/5">
                <CardTitle className="text-lg text-white font-bold flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    {person.firstName} {person.lastName}
                </CardTitle>
                <CardDescription className="text-zinc-500">
                    Detailed information and uploaded documents for this {type}.
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Personal Info */}
                    <div className="space-y-6">
                        <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest border-l-2 border-primary pl-3">Personal Information</h4>
                        <div className="grid grid-cols-1 gap-4">
                            <DetailItem label="Full Name" value={`${person.firstName} ${person.lastName}`} />
                            <DetailItem label="Nationality" value={person.nationality} />
                            <DetailItem label="BVN" value={person.bvn} />
                            <DetailItem label="ID Type" value={person.idType} />
                        </div>
                    </div>

                    {/* Documents */}
                    <div className="space-y-6">
                        <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest border-l-2 border-primary pl-3">Identification Documents</h4>
                        <div className="space-y-4">
                            <DocumentViewer
                                url={person.idUrl}
                                label={`${person.idType || 'ID'} Card`}
                                onFullScreen={() => person.idUrl && setPreviewDoc({ url: person.idUrl, label: `${person.firstName} ${person.lastName} - ID` })}
                            />
                            <DocumentViewer
                                url={person.proofOfAddress}
                                label="Proof of Address"
                                onFullScreen={() => person.proofOfAddress && setPreviewDoc({ url: person.proofOfAddress, label: `${person.firstName} ${person.lastName} - Address Proof` })}
                            />
                            {!person.idUrl && !person.proofOfAddress && (
                                <p className="text-sm text-zinc-500 italic">No documents uploaded for this {type}.</p>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    return (
        <>
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Status Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-br from-white/10 to-transparent border border-white/10 shadow-2xl">
                    <div className="flex items-center gap-5">
                        <div className={cn(
                            "p-4 rounded-xl shadow-lg",
                            merchant.status === "APPROVED" ? "bg-green-500/20 text-green-500 shadow-green-500/10" :
                                merchant.status === "PENDING" ? "bg-amber-500/20 text-amber-500 shadow-amber-500/10" : "bg-red-500/20 text-red-500 shadow-red-500/10"
                        )}>
                            {merchant.status === "APPROVED" ? <CheckCircle2 className="h-8 w-8" /> :
                                merchant.status === "PENDING" ? <Clock className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
                        </div>
                        <div>
                            <h2 className="text-3xl font-black text-white tracking-tight">{merchant.name}</h2>
                            <p className="text-zinc-500 flex items-center gap-2 text-sm mt-1">
                                Application Status: <span className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border",
                                    merchant.status === "APPROVED" ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                        merchant.status === "PENDING" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
                                )}>{merchant.status}</span>
                            </p>
                        </div>
                    </div>

                    {merchant.status === "PENDING" && (
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                className="h-11 border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                                onClick={() => handleUpdateStatus("REJECTED")}
                                disabled={isUpdating}
                            >
                                <XCircle className="w-4 h-4 mr-2" /> Reject
                            </Button>
                            <Button
                                className="h-11 bg-green-600 text-white hover:bg-green-500 hover:scale-[1.02] active:scale-[0.98] transition-all px-8 font-bold"
                                onClick={() => handleUpdateStatus("APPROVED")}
                                disabled={isUpdating}
                            >
                                {isUpdating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                                Approve Merchant Access
                            </Button>
                        </div>
                    )}
                </div>

                <div className="max-w-4xl">
                    <Card className="bg-white/5 border-white/10 overflow-hidden shadow-2xl">
                        <div className="h-1.5 w-full bg-blue-500/40" />
                        <CardHeader className="p-6 bg-white/5 border-b border-white/5">
                            <CardTitle className="text-xl text-white font-bold flex items-center gap-2">
                                <User className="h-6 w-6 text-blue-400" /> Authorized Contact Person
                            </CardTitle>
                            <CardDescription className="text-zinc-500">
                                Primary point of contact for this business account.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                            <DetailItem label="Full Name" value={merchant.contactPerson?.name} />
                            <DetailItem label="Phone Number" value={merchant.contactPerson?.phone} />
                            <DetailItem label="BVN" value={merchant.contactPerson?.bvn} />
                            <DetailItem label="TIN/Tax ID" value={merchant.contactPerson?.taxIdentificationNumber || merchant.contactPerson?.tin} />
                        </CardContent>
                    </Card>
                </div>

                <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="bg-white/5 border border-white/10 p-1 rounded-xl mb-8">
                        <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-6 py-2">
                            <Building2 className="h-4 w-4 mr-2" /> Company Overview
                        </TabsTrigger>
                        <TabsTrigger value="directors" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-6 py-2">
                            <Landmark className="h-4 w-4 mr-2" /> Directors ({merchant.directors?.length || 0})
                        </TabsTrigger>
                        <TabsTrigger value="shareholders" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-6 py-2">
                            <Users className="h-4 w-4 mr-2" /> Shareholders ({merchant.shareholders?.length || 0})
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-8 animate-in fade-in slide-in-from-left-4">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Company Info */}
                            <div className="lg:col-span-1 space-y-8">
                                <Card className="bg-white/5 border-white/10 overflow-hidden">
                                    <div className="h-1.5 w-full bg-primary/40" />
                                    <CardHeader className="pt-6">
                                        <CardTitle className="text-lg text-white font-bold flex items-center gap-2">
                                            <Building2 className="h-5 w-5 text-primary" /> Profile
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <DetailItem label="Legal Name" value={merchant.name} />
                                        <DetailItem label="Trading Name" value={docs?.tradingName} />
                                        <DetailItem label="Website" value={merchant.websiteUrl} />
                                        <DetailItem label="Business Description" value={merchant.description} fullWidth />
                                        <DetailItem label="Nature of Business" value={merchant.natureOfBusiness} fullWidth />
                                    </CardContent>
                                </Card>
                            </div>


                            {/* Business Documents */}
                            <div className="lg:col-span-2 space-y-8">
                                <Card className="bg-white/5 border-white/10 overflow-hidden shadow-2xl">
                                    <CardHeader className="bg-white/5 border-b border-white/5 p-6">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <CardTitle className="text-xl text-white font-black tracking-tight">Corporate Documentation</CardTitle>
                                                <CardDescription className="text-zinc-500">Legal and registration documents for verification.</CardDescription>
                                            </div>
                                            <div className="p-2 bg-primary/10 rounded-lg">
                                                <FileText className="h-6 w-6 text-primary" />
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <DocumentViewer
                                                url={docs?.cacCertificate}
                                                label="CAC Certificate"
                                                onFullScreen={() => docs?.cacCertificate && setPreviewDoc({ url: docs.cacCertificate, label: "CAC Certificate" })}
                                            />
                                            <DocumentViewer
                                                url={docs?.cacEStatus}
                                                label="CAC E-Status Report"
                                                onFullScreen={() => docs?.cacEStatus && setPreviewDoc({ url: docs.cacEStatus, label: "CAC E-Status Report" })}
                                            />
                                            <DocumentViewer
                                                url={docs?.memart}
                                                label="MEMART"
                                                onFullScreen={() => docs?.memart && setPreviewDoc({ url: docs.memart, label: "MEMART" })}
                                            />
                                            <DocumentViewer
                                                url={docs?.memorandum}
                                                label="Memorandum of Association"
                                                onFullScreen={() => docs?.memorandum && setPreviewDoc({ url: docs.memorandum, label: "Memorandum of Association" })}
                                            />
                                            <DocumentViewer
                                                url={docs?.proofOfAddress}
                                                label="Business Address Proof"
                                                onFullScreen={() => docs?.proofOfAddress && setPreviewDoc({ url: docs.proofOfAddress, label: "Business Proof of Address" })}
                                            />
                                            <DocumentViewer
                                                url={docs?.proofOfFunds}
                                                label="Proof of Funds"
                                                onFullScreen={() => docs?.proofOfFunds && setPreviewDoc({ url: docs.proofOfFunds, label: "Proof of Funds" })}
                                            />
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="directors" className="space-y-8 animate-in fade-in slide-in-from-left-4">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                            <div className="md:col-span-4 lg:col-span-3">
                                <h3 className="text-sm font-black text-zinc-500 uppercase tracking-[0.2em] mb-4">Board Members</h3>
                                <PersonList
                                    list={merchant.directors || []}
                                    type="director"
                                    onSelect={(id) => setSelectedDirectorId(id)}
                                    selectedId={selectedDirectorId}
                                />
                            </div>
                            <div className="md:col-span-8 lg:col-span-9">
                                {selectedDirectorId ? (
                                    <PersonDetail
                                        person={merchant.directors!.find(d => d.id === selectedDirectorId)!}
                                        type="director"
                                    />
                                ) : (
                                    <div className="h-full min-h-[400px] flex flex-col items-center justify-center p-12 border border-dashed border-white/10 rounded-2xl bg-white/5">
                                        <Landmark className="h-12 w-12 text-zinc-600 mb-4" />
                                        <h4 className="text-xl font-bold text-white mb-2">Select a Director</h4>
                                        <p className="text-zinc-500 text-center max-w-sm">Click on a director from the list to view their verification documents and personal data.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="shareholders" className="space-y-8 animate-in fade-in slide-in-from-left-4">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                            <div className="md:col-span-4 lg:col-span-3">
                                <h3 className="text-sm font-black text-zinc-500 uppercase tracking-[0.2em] mb-4">Ownership</h3>
                                <PersonList
                                    list={merchant.shareholders || []}
                                    type="shareholder"
                                    onSelect={(id) => setSelectedShareholderId(id)}
                                    selectedId={selectedShareholderId}
                                />
                            </div>
                            <div className="md:col-span-8 lg:col-span-9">
                                {selectedShareholderId ? (
                                    <PersonDetail
                                        person={merchant.shareholders!.find(s => s.id === selectedShareholderId)!}
                                        type="shareholder"
                                    />
                                ) : (
                                    <div className="h-full min-h-[400px] flex flex-col items-center justify-center p-12 border border-dashed border-white/10 rounded-2xl bg-white/5">
                                        <Users className="h-12 w-12 text-zinc-600 mb-4" />
                                        <h4 className="text-xl font-bold text-white mb-2">Select a Shareholder</h4>
                                        <p className="text-zinc-500 text-center max-w-sm">Click on a shareholder from the list to view their information and documents.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Full Screen Document Preview Dialog */}
            <DocumentPreviewDialog
                url={previewDoc?.url || null}
                label={previewDoc?.label || ""}
                open={!!previewDoc}
                onOpenChange={(open) => !open && setPreviewDoc(null)}
            />
        </>
    );
}


