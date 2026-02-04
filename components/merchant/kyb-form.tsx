"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, ChevronRight, ChevronLeft, Upload, Building2, User, FileText, Landmark, X, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { publicMerchantApi } from "@/lib/merchant";
import { useAuthStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { TagInput } from "@/components/ui/tag-input";
import { uploadFile } from "@/lib/cloudinary"

const kybSchema = z.object({
    // Step 1: Business Profile
    businessName: z.string().min(2, "Business name is required"),
    email: z.string().email("Invalid email address"), // Changed from z.email()
    websiteUrl: z.string().min(1, "Website / Product URL is required"),
    natureOfBusiness: z.string().min(5, "Please describe business nature"),
    description: z.string().min(10, "Please provide a brief description"),
    tradingName: z.string().min(2, "Trading name is required"),

    // Address Fields
    addressLine1: z.string().min(5, "Address Line 1 is required"),
    addressLine2: z.string().optional(),
    city: z.string().min(2, "City is required"),
    state: z.string().min(2, "State is required"),
    country: z.string().min(1, "Country is required"),
    postalCode: z.string().min(3, "Postal code is required"),

    // Step 2: Address & Contact
    contactPerson: z.string().min(2, "Contact person is required"),

    // Step 3: Documentation
    cacCertificate: z.any(),
    cacEStatus: z.any(),
    memart: z.any(),
    memorandum: z.any(),
    proofOfAddress: z.any(),
    capitalSource: z.string().min(5, "Capital source is required"),
    taxIdentificationNumber: z.string().min(8, "TIN is required"),
    proofOfFunds: z.any(),

    // Step 4: Directors
    directors: z.array(z.object({
        firstName: z.string().min(2, "First name is required"),
        lastName: z.string().min(2, "Last name is required"),
        nationality: z.string().min(2, "Nationality is required"),
        bvn: z.string().length(11, "BVN must be 11 digits"),
        proofOfAddress: z.union([z.string().min(1, "Proof of address is required"), z.any()]).refine(val => val !== undefined && val !== null && val !== "", "Proof of address is required"),
        idType: z.string().min(2, "ID type is required"),
        idUrl: z.union([z.string().min(1, "ID document is required"), z.any()]).refine(val => val !== undefined && val !== null && val !== "", "ID document is required"),
        role: z.string().min(2, "Role is required"),
    })).min(1, "At least one director is required"),
});

type KYBFormValues = z.infer<typeof kybSchema>;


const STEPS = [
    { id: "business", title: "Business Profile", icon: Building2 },
    { id: "contact", title: "Address & Contact", icon: User },
    { id: "documents", title: "Documentation", icon: FileText },
    { id: "directors", title: "Directors", icon: Landmark },
];

export function KYBForm() {
    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [merchantId, setMerchantId] = useState<string | null>(null);
    const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({});
    const { toast } = useToast();
    const { user } = useAuthStore();

    const form = useForm<KYBFormValues>({
        resolver: zodResolver(kybSchema),
        defaultValues: {
            businessName: "",
            email: "",
            websiteUrl: "",
            natureOfBusiness: "",
            description: "",
            addressLine1: "",
            addressLine2: "",
            city: "",
            state: "",
            country: "Nigeria",
            postalCode: "",
            tradingName: "",
            contactPerson: "",
            capitalSource: "",
            taxIdentificationNumber: "",
            directors: [{ firstName: "", lastName: "", nationality: "Nigerian", bvn: "", idType: "", role: "", proofOfAddress: undefined, idUrl: undefined }],
        },
        mode: "onChange",
    });

    const { fields: directorFields, append: appendDirector, remove: removeDirector } = useFieldArray({
        control: form.control,
        name: "directors",
    });

    const handleAutoUpload = async (file: File, fieldName: string) => {
        if (!file) return;

        // 10MB limit check
        if (file.size > 10 * 1024 * 1024) {
            toast({
                title: "File too large",
                description: "The selected file exceeds the 10MB limit. Please upload a smaller file.",
                variant: "destructive",
            });
            return;
        }

        setUploadingFields(prev => ({ ...prev, [fieldName]: true }));
        try {
            const url = await uploadFile(file);
            form.setValue(fieldName as any, url);
            toast({
                title: "Upload Successful",
                description: "File has been uploaded and saved.",
                variant: "success",
            });
        } catch (error) {
            console.error(`Upload error for ${fieldName}:`, error);
            toast({
                title: "Upload Failed",
                description: "There was an error uploading your file. Please try again.",
                variant: "destructive",
            });
        } finally {
            setUploadingFields(prev => ({ ...prev, [fieldName]: false }));
        }
    };

    const handleCloudinaryUpload = async (file: File) => {
        if (file.size > 10 * 1024 * 1024) {
            toast({
                title: "File too large",
                description: "The selected file exceeds the 10MB limit.",
                variant: "destructive",
            });
            throw new Error("File too large");
        }
        return await uploadFile(file);
    };

    const handleCreateMerchant = async (data: KYBFormValues) => {
        if (!user?.id) {
            toast({
                title: "Error",
                description: "User session not found. Please log in again.",
                variant: "destructive",
            });
            return false;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                userId: user.id,
                name: data.businessName,
                natureOfBusiness: data.natureOfBusiness,
                description: data.description,
                websiteUrl: data.websiteUrl,
                addressLine1: data.addressLine1,
                addressLine2: data.addressLine2,
                city: data.city,
                state: data.state,
                country: data.country,
                postalCode: data.postalCode,
                metadata: {
                    industry: "Tech",
                    contactPerson: data.contactPerson
                }
            };

            const response = await publicMerchantApi.createMerchant(payload);
            setMerchantId(response.data.id);
            return true;
        } catch (error: any) {
            console.error("Create merchant error", error);
            toast({
                title: "Error Creating Merchant",
                description: error.response?.data?.message || "Failed to initialize application. Please try again.",
                variant: "destructive",
            });
            return false;
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdateDocumentation = async (data: KYBFormValues) => {
        if (!merchantId) {
            toast({
                title: "Error",
                description: "Merchant ID missing. Please restart the process.",
                variant: "destructive",
            });
            return false;
        }

        setIsSubmitting(true);
        try {
            const uploadPromises = [
                "cacCertificate", "cacEStatus", "memart", "memorandum",
                "proofOfAddress", "proofOfFunds"
            ].map(async (key) => {
                const value = (data as any)[key];
                // If it's already a URL (from auto-upload), use it
                if (typeof value === "string" && value.startsWith("http")) {
                    return { [key]: value };
                }
                // If it's a File (backup), upload it
                if (value instanceof File) {
                    try {
                        const folder = `merchant/${merchantId}/documentation`;
                        const url = await handleCloudinaryUpload(value);
                        return { [key]: url };
                    } catch (err) {
                        console.error(`Failed to upload ${key}`, err);
                        throw new Error(`Failed to upload ${key}`);
                    }
                }
                return {};
            });

            const uploadedDocs = await Promise.all(uploadPromises);
            const docsPayload = uploadedDocs.reduce((acc, curr) => ({ ...acc, ...curr }), {});

            const finalPayload = {
                merchantId,
                cacCertificate: docsPayload.cacCertificate || "",
                cacEStatus: docsPayload.cacEStatus || "",
                memart: docsPayload.memart || "",
                memorandum: docsPayload.memorandum || "",
                proofOfAddress: docsPayload.proofOfAddress || "",
                capitalSource: data.capitalSource,
                tradingName: data.tradingName,
                taxIdentificationNumber: data.taxIdentificationNumber,
                proofOfFunds: docsPayload.proofOfFunds || "",
                metadata: {
                    notes: "Verified on site"
                }
            };

            await publicMerchantApi.completeMerchantKYB(finalPayload);
            return true;
        } catch (error: any) {
            console.error("Submit docs error", error);
            toast({
                title: "Error",
                description: error.message || "Failed to submit documentation. Please try again.",
                variant: "destructive",
            });
            return false;
        } finally {
            setIsSubmitting(false);
        }
    };

    const onSubmit = async (data: KYBFormValues) => {
        if (!merchantId) {
            toast({
                title: "Error",
                description: "Merchant ID missing. Please restart the process.",
                variant: "destructive",
            });
            return;
        }

        setIsSubmitting(true);
        try {
            // Stage 3: Register Directors individually
            for (const director of data.directors) {
                let directorPoAUrl = "";
                let directorIdUrl = "";

                const directorFolder = `merchant/${merchantId}/directors`;

                if (typeof director.proofOfAddress === "string" && director.proofOfAddress.startsWith("http")) {
                    directorPoAUrl = director.proofOfAddress;
                } else if (director.proofOfAddress instanceof File) {
                    directorPoAUrl = await handleCloudinaryUpload(director.proofOfAddress);
                }

                if (typeof director.idUrl === "string" && director.idUrl.startsWith("http")) {
                    directorIdUrl = director.idUrl;
                } else if (director.idUrl instanceof File) {
                    directorIdUrl = await handleCloudinaryUpload(director.idUrl);
                }

                const directorPayload = {
                    merchantId,
                    firstName: director.firstName,
                    lastName: director.lastName,
                    nationality: director.nationality,
                    bvn: director.bvn,
                    proofOfAddress: directorPoAUrl,
                    idType: director.idType,
                    idUrl: directorIdUrl,
                    metadata: {
                        role: director.role
                    }
                };

                await publicMerchantApi.addMerchantDirector(directorPayload);
            }

            toast({
                title: "Success",
                description: "Your KYB application and directors have been submitted successfully.",
                variant: "success",
            });
            setCurrentStep(STEPS.length);
        } catch (error: any) {
            console.error("Submit directors error", error);
            toast({
                title: "Error",
                description: error.message || "Failed to submit directors info. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const nextStep = async () => {
        try {
            const fields = getFieldsForStep(currentStep);
            const isValid = await form.trigger(fields as any);

            if (!isValid) {
                toast({
                    title: "Validation Error",
                    description: "Please check the form for missing or invalid fields.",
                    variant: "destructive",
                });
                return;
            }

            // Step 1 is "Contact & Identification" (index 1).
            // Logic: Step 0 (Business) -> Step 1 (Contact) -> Create Merchant -> Step 2 (Docs).
            if (currentStep === 1) {
                const success = await handleCreateMerchant(form.getValues());
                if (!success) return;
            }

            if (currentStep === 2) {
                const success = await handleUpdateDocumentation(form.getValues());
                if (!success) return;
            }

            setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
        } catch (error) {
            console.error("Critical error in nextStep:", error);
            toast({
                title: "Error",
                description: "An unexpected error occurred. Please try again.",
                variant: "destructive",
            });
        }
    };

    const prevStep = () => {
        setCurrentStep((prev) => Math.max(prev - 1, 0));
    };

    const getFieldsForStep = (step: number) => {
        switch (step) {
            case 0: return ["businessName", "email", "websiteUrl", "natureOfBusiness", "description", "tradingName"];
            case 1: return ["contactPerson", "addressLine1", "city", "state", "country", "postalCode"];
            case 2: return ["cacCertificate", "cacEStatus", "memart", "memorandum", "proofOfAddress", "capitalSource", "taxIdentificationNumber", "proofOfFunds"];
            case 3: return ["directors"];
            default: return [];
        }
    };

    if (currentStep === STEPS.length) {
        return (
            <Card className="max-w-2xl mx-auto border-none shadow-2xl bg-white/5 backdrop-blur-md">
                <CardContent className="pt-12 pb-12 flex flex-col items-center text-center space-y-6">
                    <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-12 h-12 text-green-500" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-3xl font-bold tracking-tight text-white">Application Submitted!</h2>
                        <p className="text-gray-400 max-w-md mx-auto">
                            Thank you for submitting your KYB details. Our compliance team will review your application and get back to you within 2-3 business days.
                        </p>
                    </div>
                    <Button asChild className="mt-4">
                        <a href="/merchant/dashboard">Go to Dashboard</a>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            {/* Progress Stepper */}
            <div className="flex justify-between items-center px-4 relative">
                <div className="absolute top-1/2 left-0 w-full h-0.5 bg-white/10 -translate-y-1/2 -z-10" />
                {STEPS.map((step, index) => {
                    const Icon = step.icon;
                    const isActive = index === currentStep;
                    const isCompleted = index < currentStep;
                    return (
                        <div key={step.id} className="flex flex-col items-center space-y-2">
                            <div
                                className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 border-2",
                                    isActive ? "bg-primary border-primary text-primary-foreground scale-110 shadow-[0_0_15px_rgba(var(--primary),0.5)]" :
                                        isCompleted ? "bg-green-500 border-green-500 text-white" : "bg-zinc-900 border-zinc-700 text-zinc-500"
                                )}
                            >
                                {isCompleted ? <CheckCircle2 className="w-6 h-6" /> : <Icon className="w-5 h-5" />}
                            </div>
                            <span className={cn(
                                "text-xs font-medium transition-colors duration-300 hidden md:block",
                                isActive ? "text-primary" : "text-zinc-500"
                            )}>
                                {step.title}
                            </span>
                        </div>
                    );
                })}
            </div>

            <Card className="border-none shadow-2xl bg-white/5 backdrop-blur-md ring-1 ring-white/10">
                <CardHeader>
                    <CardTitle className="text-2xl text-white">{STEPS[currentStep].title}</CardTitle>
                    <CardDescription className="text-zinc-400">Please provide the required information below.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            {currentStep === 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormField
                                        control={form.control}
                                        name="businessName"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-zinc-200">Business Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter business name" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="tradingName"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-zinc-200">Trading Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter trading name" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-zinc-200">Business Email</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="name@company.com" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="websiteUrl"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-zinc-200">Website / Product URL</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="https://..." {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="description"
                                        render={({ field }) => (
                                            <FormItem className="col-span-1 md:col-span-2">
                                                <FormLabel className="text-zinc-200">Business Description</FormLabel>
                                                <FormControl>
                                                    <textarea
                                                        {...field}
                                                        placeholder="A leading retail company..."
                                                        className={cn(
                                                            "w-full min-h-[80px] rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                                            form.formState.errors.description && "border-destructive focus-visible:ring-destructive"
                                                        )}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="natureOfBusiness"
                                        render={({ field }) => (
                                            <FormItem className="col-span-1 md:col-span-2">
                                                <FormLabel className="text-zinc-200">Nature of Business</FormLabel>
                                                <FormControl>
                                                    <TagInput
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                        placeholder="Type a tag and press Comma or Enter (e.g., Fiat, Crypto)..."
                                                    />
                                                </FormControl>
                                                <FormDescription>Onramp/offramp flows, fiat rails, crypto rails</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            )}

                            {currentStep === 1 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormField
                                        control={form.control}
                                        name="contactPerson"
                                        render={({ field }) => (
                                            <FormItem className="col-span-1 md:col-span-2">
                                                <FormLabel className="text-zinc-200">Contact Person</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter contact name" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <h3 className="text-zinc-200 font-medium col-span-1 md:col-span-2 mt-2">Address Information</h3>

                                    <FormField
                                        control={form.control}
                                        name="addressLine1"
                                        render={({ field }) => (
                                            <FormItem className="col-span-1 md:col-span-2">
                                                <FormLabel className="text-zinc-200">Address Line 1</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="123 Main St" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="addressLine2"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-zinc-200">Address Line 2 (Optional)</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Suite 100" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="city"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-zinc-200">City</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Lagos" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="state"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-zinc-200">State</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Lagos State" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="country"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-zinc-200">Country</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Nigeria" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="postalCode"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-zinc-200">Postal Code</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="100001" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            )}

                            {currentStep === 2 && (
                                <div className="space-y-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="taxIdentificationNumber"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-zinc-200">Tax Identification Number (TIN)</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="TIN" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="capitalSource"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-zinc-200">Capital Source</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Source of funds" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {[
                                            { name: "cacCertificate", label: "CAC Certificate" },
                                            { name: "cacEStatus", label: "CAC E-Status" },
                                            { name: "memart", label: "Memart" },
                                            { name: "memorandum", label: "Memorandum" },
                                            { name: "proofOfAddress", label: "Proof of Address (Utility Bill)" },
                                            { name: "proofOfFunds", label: "Proof of Funds" },
                                        ].map((doc) => (
                                            <FormField
                                                key={doc.name}
                                                control={form.control}
                                                name={doc.name as any}
                                                render={({ field: { onChange, value, ...field } }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-zinc-200">{doc.label}</FormLabel>
                                                        <FormControl>
                                                            <div className="relative group">
                                                                <input
                                                                    type="file"
                                                                    accept=".pdf"
                                                                    onChange={(e) => {
                                                                        const file = e.target.files?.[0];
                                                                        if (file) handleAutoUpload(file, doc.name);
                                                                    }}
                                                                    className="hidden"
                                                                    id={`file-${doc.name}`}
                                                                    {...field}
                                                                    value=""
                                                                />
                                                                <label
                                                                    htmlFor={`file-${doc.name}`}
                                                                    className={cn(
                                                                        "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-zinc-900/30 transition-all duration-300",
                                                                        uploadingFields[doc.name] ? "border-primary/50 bg-primary/5" :
                                                                            value ? "border-green-500/50 bg-green-500/5" : "border-zinc-700 group-hover:bg-zinc-900/50 group-hover:border-primary/50"
                                                                    )}
                                                                >
                                                                    {uploadingFields[doc.name] ? (
                                                                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                                                    ) : value ? (
                                                                        <CheckCircle2 className="w-8 h-8 text-green-500" />
                                                                    ) : (
                                                                        <Upload className="w-8 h-8 text-zinc-500 group-hover:text-primary transition-colors" />
                                                                    )}
                                                                    <span className="mt-2 text-sm text-zinc-400 group-hover:text-zinc-200 text-center px-4 overflow-hidden text-ellipsis whitespace-nowrap max-w-full">
                                                                        {uploadingFields[doc.name] ? "Uploading..." :
                                                                            typeof value === "string" ? "Uploaded Successfully" :
                                                                                (value as any)?.name || "Upload PDF (Max 1MB)"}
                                                                    </span>
                                                                </label>
                                                            </div>
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {currentStep === 3 && (
                                <div className="space-y-10">
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-xl font-semibold text-white">Company Directors</h3>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => appendDirector({ firstName: "", lastName: "", nationality: "Nigerian", bvn: "", idType: "", role: "", proofOfAddress: undefined, idUrl: undefined })}
                                            className="border-primary/50 text-primary hover:bg-primary/10"
                                        >
                                            <Plus className="w-4 h-4 mr-2" />
                                            Add Director
                                        </Button>
                                    </div>

                                    {directorFields.map((field, index) => (
                                        <div key={field.id} className="p-6 rounded-xl border border-white/10 bg-white/5 space-y-6 relative overflow-hidden group">
                                            <div className="absolute top-0 left-0 w-1 h-full bg-primary/40 group-hover:bg-primary transition-colors" />

                                            <div className="flex justify-between items-center">
                                                <h4 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Director #{index + 1}</h4>
                                                {directorFields.length > 1 && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => removeDirector(index)}
                                                        className="text-zinc-500 hover:text-red-400 hover:bg-red-400/10"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <FormField
                                                    control={form.control}
                                                    name={`directors.${index}.firstName`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-zinc-200">First Name</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="John" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name={`directors.${index}.lastName`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-zinc-200">Last Name</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Doe" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name={`directors.${index}.nationality`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-zinc-200">Nationality</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Nigerian" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name={`directors.${index}.bvn`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-zinc-200">BVN</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="11 digits" maxLength={11} {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name={`directors.${index}.role`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-zinc-200">Role</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="e.g. CEO, Chairman" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name={`directors.${index}.idType`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-zinc-200">ID Type</FormLabel>
                                                            <FormControl>
                                                                <select
                                                                    {...field}
                                                                    className={cn(
                                                                        "w-full h-10 rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-white outline-none",
                                                                    )}
                                                                >
                                                                    <option value="">Select ID type</option>
                                                                    <option value="Passport">International Passport</option>
                                                                    <option value="National ID">National ID Card</option>
                                                                    <option value="Driver License">Driver License</option>
                                                                    <option value="Voters Card">Voters Card</option>
                                                                </select>
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <FormField
                                                    control={form.control}
                                                    name={`directors.${index}.idUrl`}
                                                    render={({ field: { onChange, value, ...field } }) => {
                                                        const fieldKey = `directors.${index}.idUrl`;
                                                        return (
                                                            <FormItem>
                                                                <FormLabel className="text-zinc-200">ID Image/PDF</FormLabel>
                                                                <FormControl>
                                                                    <div className="relative group/file">
                                                                        <input
                                                                            type="file"
                                                                            onChange={(e) => {
                                                                                const file = e.target.files?.[0];
                                                                                if (file) handleAutoUpload(file, fieldKey);
                                                                            }}
                                                                            className="hidden"
                                                                            id={`director-id-${index}`}
                                                                            {...field}
                                                                            value=""
                                                                        />
                                                                        <label
                                                                            htmlFor={`director-id-${index}`}
                                                                            className={cn(
                                                                                "flex flex-col items-center justify-center w-full h-24 border border-dashed rounded-lg cursor-pointer bg-zinc-900/10 transition-all",
                                                                                uploadingFields[fieldKey] ? "border-primary/50 bg-primary/5" :
                                                                                    value ? "border-green-500/50 bg-green-500/5" : "border-zinc-700 group-hover/file:bg-zinc-900/30 group-hover/file:border-primary/30"
                                                                            )}
                                                                        >
                                                                            {uploadingFields[fieldKey] ? (
                                                                                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                                                                            ) : value ? (
                                                                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                                                                            ) : (
                                                                                <Upload className="w-5 h-5 text-zinc-500 group-hover/file:text-primary transition-colors" />
                                                                            )}
                                                                            <span className="mt-2 text-[10px] text-zinc-400 text-center px-4 overflow-hidden text-ellipsis whitespace-nowrap max-w-full italic">
                                                                                {uploadingFields[fieldKey] ? "Uploading..." :
                                                                                    typeof value === "string" ? "Uploaded" :
                                                                                        (value as any)?.name || "Upload ID Document"}
                                                                            </span>
                                                                        </label>
                                                                    </div>
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )
                                                    }}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name={`directors.${index}.proofOfAddress`}
                                                    render={({ field: { onChange, value, ...field } }) => {
                                                        const fieldKey = `directors.${index}.proofOfAddress`;
                                                        return (
                                                            <FormItem>
                                                                <FormLabel className="text-zinc-200">Proof of Address</FormLabel>
                                                                <FormControl>
                                                                    <div className="relative group/file">
                                                                        <input
                                                                            type="file"
                                                                            onChange={(e) => {
                                                                                const file = e.target.files?.[0];
                                                                                if (file) handleAutoUpload(file, fieldKey);
                                                                            }}
                                                                            className="hidden"
                                                                            id={`director-poa-${index}`}
                                                                            {...field}
                                                                            value=""
                                                                        />
                                                                        <label
                                                                            htmlFor={`director-poa-${index}`}
                                                                            className={cn(
                                                                                "flex flex-col items-center justify-center w-full h-24 border border-dashed rounded-lg cursor-pointer bg-zinc-900/10 transition-all",
                                                                                uploadingFields[fieldKey] ? "border-primary/50 bg-primary/5" :
                                                                                    value ? "border-green-500/50 bg-green-500/5" : "border-zinc-700 group-hover/file:bg-zinc-900/30 group-hover/file:border-primary/30"
                                                                            )}
                                                                        >
                                                                            {uploadingFields[fieldKey] ? (
                                                                                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                                                                            ) : value ? (
                                                                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                                                                            ) : (
                                                                                <Upload className="w-5 h-5 text-zinc-500 group-hover/file:text-primary transition-colors" />
                                                                            )}
                                                                            <span className="mt-2 text-[10px] text-zinc-400 text-center px-4 overflow-hidden text-ellipsis whitespace-nowrap max-w-full italic">
                                                                                {uploadingFields[fieldKey] ? "Uploading..." :
                                                                                    typeof value === "string" ? "Uploaded" :
                                                                                        (value as any)?.name || "Upload Utility Bill"}
                                                                            </span>
                                                                        </label>
                                                                    </div>
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </form>
                    </Form>
                </CardContent>
                <CardFooter className="flex justify-between border-t border-white/5 pt-6 mt-6">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={prevStep}
                        disabled={currentStep === 0 || isSubmitting}
                        className="text-white hover:bg-white/10"
                    >
                        <ChevronLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>


                    {currentStep === STEPS.length - 1 ? (
                        <Button
                            onClick={form.handleSubmit(onSubmit, (errors) => {
                                console.log("Form Errors:", errors);
                                toast({
                                    title: "Submission Error",
                                    description: "Please check all steps for required information.",
                                    variant: "destructive",
                                });
                            })}
                            disabled={isSubmitting || Object.values(uploadingFields).some(Boolean)}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 min-w-[120px]"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Submitting...
                                </>
                            ) : Object.values(uploadingFields).some(Boolean) ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Uploading...
                                </>
                            ) : (
                                "Finish Application"
                            )}
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            onClick={nextStep}
                            disabled={isSubmitting || Object.values(uploadingFields).some(Boolean)}
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Processing...
                                </>
                            ) : Object.values(uploadingFields).some(Boolean) ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Uploading...
                                </>
                            ) : (
                                <>
                                    Next Step
                                    <ChevronRight className="w-4 h-4 ml-2" />
                                </>
                            )}
                        </Button>
                    )}
                </CardFooter>
            </Card>
        </div>
    );
}
