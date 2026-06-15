"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/api";
import { merchantApi } from "@/lib/merchant";
import { useAuthStore } from "@/lib/store";
import { uploadFile } from "@/lib/cloudinary";
import { Upload, X, FileText, CheckCircle2, Loader2 } from "lucide-react";

const shareholderSchema = z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    nationality: z.string().optional(),
    bvn: z.string().optional(),
    proofOfAddress: z.string().optional(),
    idType: z.string().optional(),
    idUrl: z.string().optional(),
    ownershipPercentage: z.string().optional(),
});

type ShareholderFormValues = z.infer<typeof shareholderSchema>;

interface ShareholdersFormProps {
    onNext: () => void;
    onBack: () => void;
}

export default function ShareholdersForm({ onNext, onBack }: ShareholdersFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [uploadingField, setUploadingField] = useState<string | null>(null);
    const { user } = useAuthStore();
    const { toast } = useToast();
    const [uploads, setUploads] = useState<Record<string, string>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);
    const currentFieldRef = useRef<keyof ShareholderFormValues | null>(null);

    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors },
    } = useForm<ShareholderFormValues>({
        resolver: zodResolver(shareholderSchema),
    });

    const handleUploadClick = (field: keyof ShareholderFormValues) => {
        currentFieldRef.current = field;
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const field = currentFieldRef.current;

        if (!file || !field) return;

        setUploadingField(field);
        try {
            const secureUrl = await uploadFile(file);
            setUploads(prev => ({ ...prev, [field]: secureUrl }));
            setValue(field, secureUrl);
            toast({
                title: "File Uploaded",
                description: "Document has been successfully uploaded.",
                variant: "success",
            });
        } catch (error) {
            toast({
                title: "Upload Failed",
                description: getErrorMessage(error),
                variant: "destructive",
            });
        } finally {
            setUploadingField(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const removeUpload = (field: keyof ShareholderFormValues) => {
        setUploads(prev => {
            const newUploads = { ...prev };
            delete newUploads[field];
            return newUploads;
        });
        setValue(field, "");
    };

    const onSubmit = async (data: ShareholderFormValues) => {
        setIsLoading(true);
        try {
            if (!user?.id) throw new Error("User not found");

            await merchantApi.submitShareholder({
                ...data,
                merchantId: user.id,
            });

            toast({
                title: "Success",
                description: "Shareholder information saved successfully",
                variant: "success",
            });
            onNext();
        } catch (error) {
            toast({
                title: "Error",
                description: getErrorMessage(error),
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const UploadField = ({ field, label }: { field: keyof ShareholderFormValues, label: string }) => (
        <div className="space-y-2">
            <Label>{label}</Label>
            <div className="relative">
                {!uploads[field] ? (
                    <div
                        onClick={() => !uploadingField && handleUploadClick(field)}
                        className={`flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-xl p-6 transition-all group ${uploadingField ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/5 cursor-pointer'}`}
                    >
                        {uploadingField === field ? (
                            <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
                        ) : (
                            <Upload className="w-8 h-8 text-gray-400 group-hover:text-primary mb-2" />
                        )}
                        <span className="text-sm text-gray-400">
                            {uploadingField === field ? "Uploading..." : "Click to upload " + label}
                        </span>
                    </div>
                ) : (
                    <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2">
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
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeUpload(field)}
                            className="text-gray-400 hover:text-red-400"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                )}
            </div>
            {errors[field] && <p className="text-red-500 text-xs">{errors[field]?.message as string}</p>}
        </div>
    );

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*,.pdf"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" {...register("firstName")} placeholder="First Name" className="bg-black/50 border-white/10 h-11" />
                    {errors.firstName && <p className="text-red-500 text-xs">{errors.firstName.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" {...register("lastName")} placeholder="Last Name" className="bg-black/50 border-white/10 h-11" />
                    {errors.lastName && <p className="text-red-500 text-xs">{errors.lastName.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="nationality">Nationality</Label>
                    <Input id="nationality" {...register("nationality")} placeholder="e.g. Nigerian" className="bg-black/50 border-white/10 h-11" />
                    {errors.nationality && <p className="text-red-500 text-xs">{errors.nationality.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="bvn">BVN</Label>
                    <Input id="bvn" {...register("bvn")} placeholder="11-digit BVN" maxLength={11} className="bg-black/50 border-white/10 h-11" />
                    {errors.bvn && <p className="text-red-500 text-xs">{errors.bvn.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="ownershipPercentage">Ownership Percentage (%)</Label>
                    <Input id="ownershipPercentage" type="text" {...register("ownershipPercentage")} placeholder="e.g. 51" className="bg-black/50 border-white/10 h-11" />
                    {errors.ownershipPercentage && <p className="text-red-500 text-xs">{errors.ownershipPercentage.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="idType">Select ID Type</Label>
                    <Select onValueChange={(value) => setValue("idType", value)}>
                        <SelectTrigger className="bg-black/50 border-white/10 h-11">
                            <SelectValue placeholder="Select ID type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Passport">International Passport</SelectItem>
                            <SelectItem value="ID Card">National ID Card</SelectItem>
                            <SelectItem value="Drivers License">Driver's License</SelectItem>
                            <SelectItem value="Voters Card">Voter's Card</SelectItem>
                        </SelectContent>
                    </Select>
                    {errors.idType && <p className="text-red-500 text-xs">{errors.idType.message}</p>}
                </div>

                <UploadField field="idUrl" label="ID Document" />
                <UploadField field="proofOfAddress" label="Proof of Address" />
            </div>

            <div className="flex gap-4 pt-4">
                <Button type="button" variant="outline" onClick={onBack} disabled={isLoading || !!uploadingField} className="flex-1 h-12">
                    Back
                </Button>
                <Button type="submit" disabled={isLoading || !!uploadingField} className="flex-1 h-12">
                    {isLoading ? "Saving..." : "Next Step"}
                </Button>
            </div>
        </form>
    );
}
