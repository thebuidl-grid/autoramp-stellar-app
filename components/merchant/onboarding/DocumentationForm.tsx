"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { merchantApi, getErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { uploadFile } from "@/lib/cloudinary";
import { Upload, X, FileText, CheckCircle2, Loader2 } from "lucide-react";

const docSchema = z.object({
    cacCertificate: z.string().optional(),
    cacEStatus: z.string().optional(),
    memart: z.string().optional(),
    memorandum: z.string().optional(),
    proofOfAddress: z.string().optional(),
    capitalSource: z.string().optional(),
    tradingName: z.string().min(2, "Trading name is required"),
    taxIdentificationNumber: z.string().optional(),
    proofOfFunds: z.string().optional(),
});

type DocFormValues = z.infer<typeof docSchema>;

interface DocumentationFormProps {
    onNext: () => void;
    onBack: () => void;
}

export default function DocumentationForm({ onNext, onBack }: DocumentationFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [uploadingField, setUploadingField] = useState<string | null>(null);
    const { user } = useAuthStore();
    const { toast } = useToast();
    const [uploads, setUploads] = useState<Record<string, string>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);
    const currentFieldRef = useRef<keyof DocFormValues | null>(null);

    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors },
    } = useForm<DocFormValues>({
        resolver: zodResolver(docSchema),
    });

    const handleUploadClick = (field: keyof DocFormValues) => {
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

    const removeUpload = (field: keyof DocFormValues) => {
        setUploads(prev => {
            const newUploads = { ...prev };
            delete newUploads[field];
            return newUploads;
        });
        setValue(field, "");
    };

    const onSubmit = async (data: DocFormValues) => {
        setIsLoading(true);
        try {
            if (!user?.id) throw new Error("User not found");

            await merchantApi.submitDocumentation({
                ...data,
                merchantId: user.id,
            });

            toast({
                title: "Success",
                description: "Documentation saved successfully",
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

    const UploadField = ({ field, label }: { field: keyof DocFormValues, label: string }) => (
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
                            {uploadingField === field ? "Uploading..." : "Click to upload document"}
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
        </div>
    );

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*,.pdf"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                    <Label htmlFor="tradingName">Trading Name</Label>
                    <Input id="tradingName" {...register("tradingName")} placeholder="Enter trading name" className="bg-black/50 border-white/10 h-11" />
                    {errors.tradingName && <p className="text-red-500 text-xs">{errors.tradingName.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="taxIdentificationNumber">Tax Identification Number (TIN)</Label>
                    <Input id="taxIdentificationNumber" {...register("taxIdentificationNumber")} placeholder="Enter TIN" className="bg-black/50 border-white/10 h-11" />
                    {errors.taxIdentificationNumber && <p className="text-red-500 text-xs">{errors.taxIdentificationNumber.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="capitalSource">Source of Capital</Label>
                    <Input id="capitalSource" {...register("capitalSource")} placeholder="e.g. Personal Savings, Loan" className="bg-black/50 border-white/10 h-11" />
                    {errors.capitalSource && <p className="text-red-500 text-xs">{errors.capitalSource.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="proofOfFunds">Proof of Funds</Label>
                    <Input id="proofOfFunds" {...register("proofOfFunds")} placeholder="Ref for proof of funds" className="bg-black/50 border-white/10 h-11" />
                    {errors.proofOfFunds && <p className="text-red-500 text-xs">{errors.proofOfFunds.message}</p>}
                </div>

                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <UploadField field="cacCertificate" label="CAC Certificate" />
                    <UploadField field="cacEStatus" label="CAC E-Status" />
                    <UploadField field="memart" label="MEMART" />
                    <UploadField field="memorandum" label="Memorandum" />
                    <UploadField field="proofOfAddress" label="Proof of Business Address" />
                </div>
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
