"use client";

import { Edit2, Save, X, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { merchantApi } from "@/lib/merchant";
import { useToast } from "@/components/ui/toast";
import { useMerchantStatus, useMerchantProfile } from "@/lib/hooks";

interface BusinessDetailsViewProps { }

const DisplayField = ({ label, value }: { label: string, value?: string }) => (
    <div className="space-y-1">
        <Label className="text-muted-foreground text-xs uppercase tracking-wider">{label}</Label>
        <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm font-medium">
            {value || "N/A"}
        </div>
    </div>
);

const EditField = ({
    label,
    name,
    value,
    onChange,
    type = "input",
    required = false
}: {
    label: string,
    name: string,
    value: string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void,
    type?: "input" | "textarea",
    required?: boolean
}) => (
    <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider">
            {label} {required && <span className="text-red-500">*</span>}
        </Label>
        {type === "textarea" ? (
            <Textarea
                name={name}
                value={value}
                onChange={onChange}
                required={required}
                className="bg-black/40 border-white/10 min-h-[100px]"
            />
        ) : (
            <Input
                name={name}
                value={value}
                onChange={onChange}
                required={required}
                className="bg-black/40 border-white/10"
            />
        )}
    </div>
);

export default function BusinessDetailsView() {
    const { data: status } = useMerchantStatus();
    const { data: profile, isLoading, refetch } = useMerchantProfile(status?.merchantId || undefined);

    const rawData = Array.isArray(profile) ? profile[0] : profile;
    const info = rawData?.businessDetails || rawData; // Handle both nested and flat structures

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        natureOfBusiness: "",
        description: "",
        websiteUrl: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        postalCode: "",
        country: "",
    });
    const { toast } = useToast();

    // Sync state when data from hook changes
    useEffect(() => {
        if (info) {
            setFormData({
                name: info?.name || "",
                natureOfBusiness: info?.natureOfBusiness || "",
                description: info?.description || "",
                websiteUrl: info?.websiteUrl || "",
                addressLine1: info?.addressLine1 || "",
                addressLine2: info?.addressLine2 || "",
                city: info?.city || "",
                state: info?.state || "",
                postalCode: info?.postalCode || "",
                country: info?.country || "",
            });
        }
    }, [profile]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        const merchantId = profile?.id || status?.merchantId;

        if (!merchantId) {
            toast({
                title: "Error",
                description: "Merchant ID not found. Please refresh the page.",
                variant: "destructive",
            });
            return;
        }

        // Validate all fields are required as per user request
        const emptyFields = Object.entries(formData)
            .filter(([key, value]) => !value || value.toString().trim() === "")
            .map(([key]) => key);

        if (emptyFields.length > 0) {
            toast({
                title: "Required Fields Missing",
                description: "Please fill in all business details fields before saving.",
                variant: "destructive",
            });
            return;
        }

        setIsSaving(true);
        try {
            await merchantApi.updateBusinessDetails(merchantId, formData);
            toast({
                title: "Success",
                description: "Business details updated successfully.",
                variant: "success",
            });
            // Update UI instantly
            setIsEditing(false);
            // Refresh specific data
            refetch();
        } catch (error) {
            console.error("Failed to update business details:", error);
            toast({
                title: "Error",
                description: "Failed to update business details. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading && !profile) {
        return (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-muted-foreground animate-pulse">Loading business profile...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Business Information</h3>
                {!isEditing ? (
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} className="hover:bg-primary/10 text-primary">
                        <Edit2 className="w-4 h-4 mr-2" /> Edit Details
                    </Button>
                ) : (
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} disabled={isSaving}>
                            <X className="w-4 h-4 mr-2" /> Cancel
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={isSaving}>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {!isEditing ? (
                    <>
                        <DisplayField label="Business Name" value={formData.name} />
                        <DisplayField label="Nature of Business" value={formData.natureOfBusiness} />
                        <div className="md:col-span-2">
                            <DisplayField label="Business Description" value={formData.description} />
                        </div>
                        <DisplayField label="Website URL" value={formData.websiteUrl} />
                        <DisplayField label="Address Line 1" value={formData.addressLine1} />
                        <DisplayField label="Address Line 2" value={formData.addressLine2} />
                        <DisplayField label="City" value={formData.city} />
                        <DisplayField label="State" value={formData.state} />
                        <DisplayField label="Postal Code" value={formData.postalCode} />
                        <DisplayField label="Country" value={formData.country} />
                    </>
                ) : (
                    <>
                        <EditField label="Business Name" name="name" value={formData.name} onChange={handleInputChange} required={true} />
                        <EditField label="Nature of Business" name="natureOfBusiness" value={formData.natureOfBusiness} onChange={handleInputChange} required={true} />
                        <div className="md:col-span-2">
                            <EditField label="Business Description" name="description" value={formData.description} type="textarea" onChange={handleInputChange} required={true} />
                        </div>
                        <EditField label="Website URL" name="websiteUrl" value={formData.websiteUrl} onChange={handleInputChange} required={true} />
                        <EditField label="Address Line 1" name="addressLine1" value={formData.addressLine1} onChange={handleInputChange} required={true} />
                        <EditField label="Address Line 2" name="addressLine2" value={formData.addressLine2} onChange={handleInputChange} required={true} />
                        <EditField label="City" name="city" value={formData.city} onChange={handleInputChange} required={true} />
                        <EditField label="State" name="state" value={formData.state} onChange={handleInputChange} required={true} />
                        <EditField label="Postal Code" name="postalCode" value={formData.postalCode} onChange={handleInputChange} required={true} />
                        <EditField label="Country" name="country" value={formData.country} onChange={handleInputChange} required={true} />
                    </>
                )}
            </div>
        </div>
    );
}
