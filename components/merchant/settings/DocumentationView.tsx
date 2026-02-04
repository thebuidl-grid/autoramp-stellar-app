"use client";

import { FileText, CheckCircle2, Edit2, Save, X, Loader2, Upload } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { merchantApi } from "@/lib/merchant";
import { uploadFile } from "@/lib/cloudinary";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useMerchantStatus, useMerchantDocumentation } from "@/lib/hooks";

interface DocumentationViewProps { }

const DisplayField = ({ label, value }: { label: string, value?: string }) => (
    <div className="space-y-1">
        <Label className="text-muted-foreground text-xs uppercase tracking-wider">{label}</Label>
        <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm font-medium">
            {value || "N/A"}
        </div>
    </div>
);

const DocumentPreview = ({
    label,
    value,
    name,
    isEditable,
    uploadingFields,
    handleFileUpload
}: {
    label: string,
    value?: string,
    name: string,
    isEditable: boolean,
    uploadingFields: Record<string, boolean>,
    handleFileUpload: (file: File, fieldName: string) => Promise<void>
}) => (
    <div className="space-y-2">
        <Label className="text-muted-foreground text-xs uppercase tracking-wider">{label}</Label>
        {isEditable ? (
            <div className="relative group/file">
                <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], name)}
                    className="hidden"
                    id={`file-${name}`}
                />
                <label
                    htmlFor={`file-${name}`}
                    className={cn(
                        "flex flex-col items-center justify-center w-full h-24 border border-dashed rounded-xl cursor-pointer bg-zinc-900/10 transition-all",
                        uploadingFields[name] ? "border-primary/50 bg-primary/5" :
                            value ? "border-green-500/50 bg-green-500/5 text-green-400" : "border-zinc-700 group-hover/file:border-primary/30"
                    )}
                >
                    {uploadingFields[name] ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : value ? (
                        <CheckCircle2 className="w-5 h-5" />
                    ) : (
                        <Upload className="w-5 h-5" />
                    )}
                    <span className="mt-2 text-[10px] font-medium uppercase tracking-tight">
                        {uploadingFields[name] ? "Uploading..." : value ? "Update Document" : `Upload ${label}`}
                    </span>
                </label>
            </div>
        ) : value ? (
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

export default function DocumentationView() {
    const { data: status } = useMerchantStatus();
    const merchantId = status?.merchantId;

    // Granular fetch for documentation
    const { data: documentationData, isLoading, refetch } = useMerchantDocumentation(merchantId || undefined);

    // Support nested or array variants from legacy payloads
    const info = (Array.isArray(documentationData) ? documentationData[0] : documentationData) || {};

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({});
    const [formData, setFormData] = useState({
        tradingName: "",
        taxIdentificationNumber: "",
        capitalSource: "",
        proofOfFunds: "",
        cacCertificate: "",
        cacEStatus: "",
        memart: "",
        memorandum: "",
        proofOfAddress: "",
    });
    const { toast } = useToast();

    // Sync state when data from the hook changes
    useEffect(() => {
        if (documentationData) {
            setFormData({
                tradingName: info?.tradingName || "",
                taxIdentificationNumber: info?.taxIdentificationNumber || info?.tin || "",
                capitalSource: info?.capitalSource || "",
                proofOfFunds: info?.proofOfFunds || "",
                cacCertificate: info?.cacCertificate || "",
                cacEStatus: info?.cacEStatus || "",
                memart: info?.memart || "",
                memorandum: info?.memorandum || "",
                proofOfAddress: info?.proofOfAddress || "",
            });
        }
    }, [documentationData]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileUpload = async (file: File, fieldName: string) => {
        // 10MB limit check
        if (file.size > 10 * 1024 * 1024) {
            toast({
                title: "File too large",
                description: "The selected file exceeds the 10MB limit. Please upload a smaller file.",
                variant: "destructive"
            });
            return;
        }

        setUploadingFields(prev => ({ ...prev, [fieldName]: true }));
        try {
            const url = await uploadFile(file);
            setFormData(prev => ({ ...prev, [fieldName]: url }));
            toast({
                title: "Upload Successful",
                description: "Document has been uploaded.",
                variant: "success",
            });
        } catch (error) {
            console.error(`Upload error for ${fieldName}:`, error);
            toast({
                title: "Upload Failed",
                description: "Failed to upload document. Please try again.",
                variant: "destructive",
            });
        } finally {
            setUploadingFields(prev => ({ ...prev, [fieldName]: false }));
        }
    };

    const handleSave = async () => {
        if (!merchantId) {
            toast({
                title: "Error",
                description: "Merchant ID not found. Please refresh the page.",
                variant: "destructive",
            });
            return;
        }

        // Validate all fields are filled
        const emptyFields = Object.entries(formData)
            .filter(([key, value]) => !value || value.toString().trim() === "")
            .map(([key]) => key);

        if (emptyFields.length > 0) {
            toast({
                title: "Required Fields Missing",
                description: "Please fill in all documentation fields and upload all required documents.",
                variant: "destructive",
            });
            return;
        }

        setIsSaving(true);
        try {
            await merchantApi.updateDocumentation(merchantId, {
                ...formData,
                merchantId: merchantId
            });
            toast({
                title: "Success",
                description: "Merchant documentation updated successfully.",
                variant: "success",
            });
            // Update UI instantly
            setIsEditing(false);
            // Refresh granular data
            refetch();
        } catch (error) {
            console.error("Failed to update documentation:", error);
            toast({
                title: "Error",
                description: "Failed to update documentation. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading && !documentationData) {
        return (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-muted-foreground animate-pulse">Loading documents...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Business Documentation</h3>
                {!isEditing ? (
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} className="hover:bg-primary/10 text-primary">
                        <Edit2 className="w-4 h-4 mr-2" /> Edit Info
                    </Button>
                ) : (
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} disabled={isSaving}>
                            <X className="w-4 h-4 mr-2" /> Cancel
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={isSaving || Object.values(uploadingFields).some(Boolean)}>
                            {isSaving ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Save className="w-4 h-4 mr-2" />
                            )}
                            Save Changes
                        </Button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="grid grid-cols-1 gap-6">
                    {!isEditing ? (
                        <>
                            <DisplayField label="Trading Name" value={formData.tradingName} />
                            <DisplayField label="Tax Identification Number (TIN)" value={formData.taxIdentificationNumber} />
                            <DisplayField label="Source of Capital" value={formData.capitalSource} />
                            <DisplayField label="Proof of Funds" value={formData.proofOfFunds} />
                        </>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wider">Trading Name <span className="text-red-500">*</span></Label>
                                <Input name="tradingName" value={formData.tradingName} onChange={handleInputChange} className="bg-black/40 border-white/10" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wider">Tax Identification Number (TIN) <span className="text-red-500">*</span></Label>
                                <Input name="taxIdentificationNumber" value={formData.taxIdentificationNumber} onChange={handleInputChange} className="bg-black/40 border-white/10" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wider">Source of Capital <span className="text-red-500">*</span></Label>
                                <Input name="capitalSource" value={formData.capitalSource} onChange={handleInputChange} className="bg-black/40 border-white/10" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wider">Proof of Funds <span className="text-red-500">*</span></Label>
                                <Input name="proofOfFunds" value={formData.proofOfFunds} onChange={handleInputChange} className="bg-black/40 border-white/10" />
                            </div>
                        </>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-6">
                    <DocumentPreview label="CAC Certificate *" value={formData.cacCertificate} name="cacCertificate" isEditable={isEditing} uploadingFields={uploadingFields} handleFileUpload={handleFileUpload} />
                    <DocumentPreview label="CAC E-Status *" value={formData.cacEStatus} name="cacEStatus" isEditable={isEditing} uploadingFields={uploadingFields} handleFileUpload={handleFileUpload} />
                    <DocumentPreview label="MEMART *" value={formData.memart} name="memart" isEditable={isEditing} uploadingFields={uploadingFields} handleFileUpload={handleFileUpload} />
                    <DocumentPreview label="Memorandum *" value={formData.memorandum} name="memorandum" isEditable={isEditing} uploadingFields={uploadingFields} handleFileUpload={handleFileUpload} />
                    <DocumentPreview label="Proof of Business Address *" value={formData.proofOfAddress} name="proofOfAddress" isEditable={isEditing} uploadingFields={uploadingFields} handleFileUpload={handleFileUpload} />
                </div>
            </div>
        </div>
    );
}
