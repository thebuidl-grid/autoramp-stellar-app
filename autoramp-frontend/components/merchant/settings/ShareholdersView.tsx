"use client";

import { FileText, CheckCircle2, Users, Edit2, Trash2, Plus, X, Loader2, Upload } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { merchantApi } from "@/lib/merchant";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/cloudinary";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useMerchantStatus, useMerchantShareholders } from "@/lib/hooks";

interface Shareholder {
    id?: string;
    firstName?: string;
    lastName?: string;
    nationality?: string;
    bvn?: string;
    proofOfAddress?: string;
    idType?: string;
    idUrl?: string;
    ownershipPercentage?: string | number;
    metadata?: {
        ownership_percentage?: string | number;
    };
}

interface ShareholdersViewProps { }

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
                    <Link href={value} target="_blank" rel="noopener noreferrer">View</Link>
                </Button>
            </div>
        ) : (
            <div className="bg-black/20 border border-white/5 border-dashed rounded-xl p-4 text-center text-sm text-muted-foreground">
                Not provided
            </div>
        )}
    </div>
);

interface EditFormProps {
    isAdding: boolean;
    formState: Shareholder;
    isSaving: boolean;
    uploadingFields: Record<string, boolean>;
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    handleFileUpload: (file: File, fieldName: string) => Promise<void>;
    handleSave: () => Promise<void>;
    cancelAction: () => void;
}

const EditForm = ({
    isAdding,
    formState,
    isSaving,
    uploadingFields,
    handleInputChange,
    handleFileUpload,
    handleSave,
    cancelAction
}: EditFormProps) => (
    <div className="space-y-6 bg-white/5 p-6 rounded-2xl border border-white/10 animate-in slide-in-from-top duration-300">
        <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-bold">{isAdding ? "Add New Shareholder" : "Edit Shareholder"}</h4>
            <Button variant="ghost" size="sm" onClick={cancelAction}><X className="w-4 h-4" /></Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <Label>First Name <span className="text-red-500">*</span></Label>
                <Input name="firstName" value={formState.firstName || ""} onChange={handleInputChange} className="bg-black/40 border-white/10" />
            </div>
            <div className="space-y-2">
                <Label>Last Name <span className="text-red-500">*</span></Label>
                <Input name="lastName" value={formState.lastName || ""} onChange={handleInputChange} className="bg-black/40 border-white/10" />
            </div>
            <div className="space-y-2">
                <Label>Nationality <span className="text-red-500">*</span></Label>
                <Input name="nationality" value={formState.nationality || ""} onChange={handleInputChange} className="bg-black/40 border-white/10" />
            </div>
            <div className="space-y-2">
                <Label>BVN <span className="text-red-500">*</span></Label>
                <Input name="bvn" value={formState.bvn || ""} onChange={handleInputChange} maxLength={11} className="bg-black/40 border-white/10" />
            </div>
            <div className="space-y-2">
                <Label>Ownership Percentage (%) <span className="text-red-500">*</span></Label>
                <Input name="ownershipPercentage" type="number" value={formState.ownershipPercentage || ""} onChange={handleInputChange} className="bg-black/40 border-white/10" />
            </div>
            <div className="space-y-2">
                <Label>ID Type <span className="text-red-500">*</span></Label>
                <select
                    name="idType"
                    value={formState.idType || ""}
                    onChange={handleInputChange}
                    className="w-full h-10 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                >
                    <option value="">Select ID type</option>
                    <option value="Passport">International Passport</option>
                    <option value="National ID">National ID Card</option>
                    <option value="Driver License">Driver License</option>
                    <option value="Voters Card">Voters Card</option>
                </select>
            </div>

            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label>ID Document <span className="text-red-500">*</span></Label>
                    <div className="relative group/file">
                        <input
                            type="file"
                            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], "idUrl")}
                            className="hidden"
                            id="edit-sh-id-doc"
                        />
                        <label
                            htmlFor="edit-sh-id-doc"
                            className={cn(
                                "flex flex-col items-center justify-center w-full h-24 border border-dashed rounded-lg cursor-pointer bg-zinc-900/10 transition-all",
                                uploadingFields["idUrl"] ? "border-primary/50 bg-primary/5" :
                                    formState.idUrl ? "border-green-500/50 bg-green-500/5" : "border-zinc-700 group-hover/file:border-primary/30"
                            )}
                        >
                            {uploadingFields["idUrl"] ? <Loader2 className="animate-spin" /> : formState.idUrl ? <CheckCircle2 className="text-green-500" /> : <Upload />}
                            <span className="mt-2 text-[10px]">{uploadingFields["idUrl"] ? "Uploading..." : "Upload ID Document"}</span>
                        </label>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>Proof of Address <span className="text-red-500">*</span></Label>
                    <div className="relative group/file">
                        <input
                            type="file"
                            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], "proofOfAddress")}
                            className="hidden"
                            id="edit-sh-poa-doc"
                        />
                        <label
                            htmlFor="edit-sh-poa-doc"
                            className={cn(
                                "flex flex-col items-center justify-center w-full h-24 border border-dashed rounded-lg cursor-pointer bg-zinc-900/10 transition-all",
                                uploadingFields["proofOfAddress"] ? "border-primary/50 bg-primary/5" :
                                    formState.proofOfAddress ? "border-green-500/50 bg-green-500/5" : "border-zinc-700 group-hover/file:border-primary/30"
                            )}
                        >
                            {uploadingFields["proofOfAddress"] ? <Loader2 className="animate-spin" /> : formState.proofOfAddress ? <CheckCircle2 className="text-green-500" /> : <Upload />}
                            <span className="mt-2 text-[10px]">{uploadingFields["proofOfAddress"] ? "Uploading..." : "Upload Utility Bill"}</span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        <div className="flex justify-end gap-3 mt-8">
            <Button variant="ghost" onClick={cancelAction}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving || Object.values(uploadingFields).some(Boolean)}>
                {isSaving ? "Saving..." : "Save Changes"}
            </Button>
        </div>
    </div>
);

export default function ShareholdersView() {
    const { data: status } = useMerchantStatus();
    const merchantId = status?.merchantId;

    // Granular fetch for shareholders
    const { data: shareholdersData, isLoading, refetch } = useMerchantShareholders(merchantId || undefined);

    const [shareholders, setShareholders] = useState<Shareholder[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({});
    const { toast } = useToast();

    // Sync state when data from hook changes
    useEffect(() => {
        if (Array.isArray(shareholdersData)) {
            setShareholders(shareholdersData);
        }
    }, [shareholdersData]);

    // Form state for editing/adding
    const [formState, setFormState] = useState<Shareholder>({});

    const startEditing = (shareholder: Shareholder) => {
        setEditingId(shareholder.id || null);
        setFormState({
            ...shareholder,
            ownershipPercentage: shareholder.metadata?.ownership_percentage || shareholder.ownershipPercentage
        });
        setIsAdding(false);
    };

    const startAdding = () => {
        setEditingId(null);
        setFormState({
            firstName: "",
            lastName: "",
            nationality: "Nigerian",
            bvn: "",
            idType: "",
            ownershipPercentage: "",
            idUrl: "",
            proofOfAddress: ""
        });
        setIsAdding(true);
    };

    const cancelAction = () => {
        setEditingId(null);
        setIsAdding(false);
        setFormState({});
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormState(prev => ({ ...prev, [name]: value }));
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
            setFormState(prev => ({ ...prev, [fieldName]: url }));
            toast({ title: "Upload Successful", variant: "success" });
        } catch (error) {
            toast({ title: "Upload Failed", variant: "destructive" });
        } finally {
            setUploadingFields(prev => ({ ...prev, [fieldName]: false }));
        }
    };

    const handleSave = async () => {
        if (!formState.firstName || !formState.lastName || !formState.nationality || !formState.bvn || !formState.ownershipPercentage || !formState.idType || !formState.idUrl || !formState.proofOfAddress) {
            toast({ title: "Missing Fields", description: "Please fill all required fields and upload documents.", variant: "destructive" });
            return;
        }

        if (!merchantId) {
            toast({
                title: "Error",
                description: "Merchant ID not found. Please refresh the page.",
                variant: "destructive",
            });
            return;
        }

        setIsSaving(true);
        try {
            // Remove ownershipPercentage from root payload as it belongs in metadata
            const { ownershipPercentage, ...rest } = formState;
            const payload = {
                ...rest,
                merchantId: merchantId,
                metadata: {
                    ...formState.metadata,
                    ownership_percentage: ownershipPercentage
                }
            };

            if (isAdding) {
                await merchantApi.submitShareholder(payload);
                toast({ title: "Shareholder Added", variant: "success" });
            } else if (editingId) {
                await merchantApi.updateShareholder(editingId, payload);
                toast({ title: "Shareholder Updated", variant: "success" });
            }

            // Immediate UI feedback
            setEditingId(null);
            setIsAdding(false);
            setFormState({});

            // Refresh specific data
            refetch();
        } catch (error) {
            console.error("Save error:", error);
            toast({ title: "Action Failed", description: "Something went wrong.", variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to remove this shareholder?")) return;

        try {
            await merchantApi.removeShareholder(id);
            toast({ title: "Shareholder Removed", variant: "success" });
            refetch();
        } catch (error) {
            toast({ title: "Delete Failed", variant: "destructive" });
        }
    };

    if (isLoading && shareholders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-muted-foreground animate-pulse">Loading shareholders details...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2">
                    <Users className="text-primary" /> Company Shareholders
                </h3>
                {!isAdding && !editingId && (
                    <Button onClick={startAdding} className="bg-primary text-black hover:bg-primary/90">
                        <Plus className="w-4 h-4 mr-2" /> Add Shareholder
                    </Button>
                )}
            </div>

            {isAdding && (
                <EditForm
                    isAdding={isAdding}
                    formState={formState}
                    isSaving={isSaving}
                    uploadingFields={uploadingFields}
                    handleInputChange={handleInputChange}
                    handleFileUpload={handleFileUpload}
                    handleSave={handleSave}
                    cancelAction={cancelAction}
                />
            )}

            <div className="space-y-12">
                {shareholders.map((shareholder: Shareholder, index: number) => (
                    <div key={shareholder.id || index} className={index !== 0 ? "pt-12 border-t border-white/10" : ""}>
                        {editingId === shareholder.id ? (
                            <EditForm
                                isAdding={false}
                                formState={formState}
                                isSaving={isSaving}
                                uploadingFields={uploadingFields}
                                handleInputChange={handleInputChange}
                                handleFileUpload={handleFileUpload}
                                handleSave={handleSave}
                                cancelAction={cancelAction}
                            />
                        ) : (
                            <>
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                                            <Users className="text-primary w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold text-white">{shareholder?.firstName} {shareholder?.lastName}</h3>
                                            <p className="text-sm text-muted-foreground font-mono">
                                                {shareholder?.metadata?.ownership_percentage || shareholder?.ownershipPercentage || 0}% Ownership
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="sm" onClick={() => startEditing(shareholder)} className="hover:bg-primary/10 text-primary">
                                            <Edit2 className="w-4 h-4 mr-2" /> Edit
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => shareholder.id && handleDelete(shareholder.id)} className="hover:bg-red-500/10 text-red-500">
                                            <Trash2 className="w-4 h-4 mr-2" /> Remove
                                        </Button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <DisplayField label="First Name" value={shareholder?.firstName} />
                                    <DisplayField label="Last Name" value={shareholder?.lastName} />
                                    <DisplayField label="Nationality" value={shareholder?.nationality} />
                                    <DisplayField label="BVN" value={shareholder?.bvn} />
                                    <DisplayField label="Ownership Percentage" value={shareholder?.metadata?.ownership_percentage || shareholder?.ownershipPercentage ? `${shareholder.metadata?.ownership_percentage || shareholder.ownershipPercentage}%` : undefined} />
                                    <DisplayField label="ID Type" value={shareholder?.idType} />

                                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                                        <DocumentPreview label="ID Document" value={shareholder?.idUrl} />
                                        <DocumentPreview label="Proof of Address" value={shareholder?.proofOfAddress} />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                ))}

                {shareholders.length === 0 && !isAdding && (
                    <div className="text-center py-12 bg-white/5 border border-white/10 rounded-2xl border-dashed">
                        <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                        <p className="text-muted-foreground">No shareholders information found.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
