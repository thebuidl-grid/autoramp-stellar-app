"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { Loader2, CheckCircle2, ChevronRight, ChevronLeft, Upload, Building2, User, FileText, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

const kybSchema = z.object({
    // Step 1: Business Profile
    businessName: z.string().min(2, "Business name is required"),
    email: z.string().email("Invalid email address"),
    websiteUrl: z.string().min(1, "Website / Product URL is required"),
    natureOfBusiness: z.string().min(10, "Please provide a brief description"),
    tradingName: z.string().min(2, "Trading name is required"),

    // Step 2: Contact & Identification
    contactPerson: z.string().min(2, "Contact person is required"),
    contactPhone: z.string().min(10, "Invalid phone number"),
    bvn: z.string().length(11, "BVN must be 11 digits"),
    tin: z.string().min(8, "TIN is required"),

    // Step 3: Legal Documents (Handling as pointers/references for now)
    cacCertificate: z.any().optional(),
    cacEStatus: z.any().optional(),
    memart: z.any().optional(),
    memorandum: z.any().optional(),
    proofOfAddress: z.any().optional(),

    // Step 4: Directors & Funds
    capitalSource: z.string().min(5, "Capital source is required"),
    proofOfFunds: z.any().optional(),
    numberOfDirectors: z.string().min(1, "Number of directors is required"),
    companyDirectors: z.string().min(5, "Please list company directors"),
    directorProofOfAddress: z.any().optional(),
    idType: z.string().min(2, "ID type is required"),
    idDocument: z.any().optional(),
});

type KYBFormValues = z.infer<typeof kybSchema>;

const STEPS = [
    { id: "business", title: "Business Profile", icon: Building2 },
    { id: "contact", title: "Contact & Identification", icon: User },
    { id: "documents", title: "Legal Documents", icon: FileText },
    { id: "directors", title: "Directors & Funds", icon: Landmark },
];

export function KYBForm() {
    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    const form = useForm<KYBFormValues>({
        resolver: zodResolver(kybSchema),
        defaultValues: {
            businessName: "",
            email: "",
            websiteUrl: "",
            natureOfBusiness: "",
            tradingName: "",
            contactPerson: "",
            contactPhone: "",
            bvn: "",
            tin: "",
            capitalSource: "",
            numberOfDirectors: "",
            companyDirectors: "",
            idType: "",
        },
        mode: "onChange",
    });

    const onSubmit = async (data: KYBFormValues) => {
        setIsSubmitting(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call
            toast({
                title: "Success",
                description: "Your KYB application has been submitted successfully.",
                variant: "success",
            });
            setCurrentStep(STEPS.length); // Final success step
        } catch {
            toast({
                title: "Error",
                description: "Failed to submit KYB application. Please try again.",
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
            case 0: return ["businessName", "email", "websiteUrl", "natureOfBusiness", "tradingName"];
            case 1: return ["contactPerson", "contactPhone", "bvn", "tin"];
            case 2: return ["cacCertificate", "cacEStatus", "memart", "memorandum", "proofOfAddress"];
            case 3: return ["capitalSource", "proofOfFunds", "numberOfDirectors", "companyDirectors", "directorProofOfAddress", "idType", "idDocument"];
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
                                        name="natureOfBusiness"
                                        render={({ field }) => (
                                            <FormItem className="col-span-1 md:col-span-2">
                                                <FormLabel className="text-zinc-200">Nature of Business</FormLabel>
                                                <FormControl>
                                                    <textarea
                                                        {...field}
                                                        placeholder="Briefly describe your business model, flows, and rails..."
                                                        className={cn(
                                                            "w-full min-h-[100px] rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                                                            form.formState.errors.natureOfBusiness && "border-destructive focus-visible:ring-destructive"
                                                        )}
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
                                            <FormItem>
                                                <FormLabel className="text-zinc-200">Contact Person</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Enter contact name" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="contactPhone"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-zinc-200">Contact Phone</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="+234..." {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="bvn"
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
                                        name="tin"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-zinc-200">TIN</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Tax Identification Number" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            )}

                            {currentStep === 2 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {[
                                        { name: "cacCertificate", label: "CAC Certificate" },
                                        { name: "cacEStatus", label: "CAC E-Status" },
                                        { name: "memart", label: "Memart" },
                                        { name: "memorandum", label: "Memorandum" },
                                        { name: "proofOfAddress", label: "Proof of Address (Utility Bill)" },
                                    ].map((doc) => (
                                        <FormField
                                            key={doc.name}
                                            control={form.control}
                                            name={doc.name as any}
                                            render={({ field: { onChange, ...field } }) => (
                                                <FormItem>
                                                    <FormLabel className="text-zinc-200">{doc.label}</FormLabel>
                                                    <FormControl>
                                                        <div className="relative group">
                                                            <input
                                                                type="file"
                                                                accept=".pdf"
                                                                onChange={(e) => onChange(e.target.files?.[0])}
                                                                className="hidden"
                                                                id={`file-${doc.name}`}
                                                                {...field}
                                                                value=""
                                                            />
                                                            <label
                                                                htmlFor={`file-${doc.name}`}
                                                                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer bg-zinc-900/30 group-hover:bg-zinc-900/50 group-hover:border-primary/50 transition-all duration-300"
                                                            >
                                                                <Upload className="w-8 h-8 text-zinc-500 group-hover:text-primary transition-colors" />
                                                                <span className="mt-2 text-sm text-zinc-400 group-hover:text-zinc-200 text-center px-4 overflow-hidden text-ellipsis whitespace-nowrap max-w-full">
                                                                    {form.watch(doc.name as any)?.name || "Upload PDF (Max 1MB)"}
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
                            )}

                            {currentStep === 3 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                                    <FormField
                                        control={form.control}
                                        name="numberOfDirectors"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-zinc-200">Number of Directors</FormLabel>
                                                <FormControl>
                                                    <Input type="number" placeholder="0" {...field} className="bg-zinc-900/50 border-zinc-700 text-white" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="companyDirectors"
                                        render={({ field }) => (
                                            <FormItem className="col-span-1 md:col-span-2">
                                                <FormLabel className="text-zinc-200">Company Directors</FormLabel>
                                                <FormControl>
                                                    <textarea
                                                        {...field}
                                                        placeholder="Enter full names of company directors..."
                                                        className={cn(
                                                            "w-full min-h-[80px] rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                                            form.formState.errors.companyDirectors && "border-destructive focus-visible:ring-destructive"
                                                        )}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="idType"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-zinc-200">Upload ID Type</FormLabel>
                                                <FormControl>
                                                    <select
                                                        {...field}
                                                        className={cn(
                                                            "w-full h-10 rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-white outline-none",
                                                            form.formState.errors.idType && "border-destructive"
                                                        )}
                                                    >
                                                        <option value="">Select ID type</option>
                                                        <option value="passport">International Passport</option>
                                                        <option value="national_id">National ID Card</option>
                                                        <option value="driver_license">Driver License</option>
                                                    </select>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <div className="grid grid-cols-1 gap-4 col-span-1 md:col-span-2">
                                        <h3 className="text-zinc-200 font-medium">Supporting Documents</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {[
                                                { name: "proofOfFunds", label: "Proof of Funds" },
                                                { name: "directorProofOfAddress", label: "Director Utility Bill" },
                                                { name: "idDocument", label: "ID Document" },
                                            ].map((item) => (
                                                <FormField
                                                    key={item.name}
                                                    control={form.control}
                                                    name={item.name as any}
                                                    render={({ field: { onChange, ...field } }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-zinc-300 text-xs">{item.label}</FormLabel>
                                                            <FormControl>
                                                                <div className="relative group">
                                                                    <input
                                                                        type="file"
                                                                        accept=".pdf"
                                                                        onChange={(e) => onChange(e.target.files?.[0])}
                                                                        className="hidden"
                                                                        id={`file-${item.name}`}
                                                                        {...field}
                                                                        value=""
                                                                    />
                                                                    <label
                                                                        htmlFor={`file-${item.name}`}
                                                                        className="flex flex-col items-center justify-center w-full h-24 border border-dashed border-zinc-700 rounded-lg cursor-pointer bg-zinc-900/30 group-hover:bg-zinc-900/50 transition-colors"
                                                                    >
                                                                        <Upload className="w-5 h-5 text-zinc-500" />
                                                                        <span className="mt-1 text-[10px] text-zinc-400 text-center px-2 overflow-hidden text-ellipsis whitespace-nowrap max-w-full">
                                                                            {form.watch(item.name as any)?.name || "PDF (1MB)"}
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
                                toast({
                                    title: "Submission Error",
                                    description: "Please check all steps for required information.",
                                    variant: "destructive",
                                });
                            })}
                            disabled={isSubmitting}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 min-w-[120px]"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Submitting...
                                </>
                            ) : (
                                "Finish Application"
                            )}
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            onClick={nextStep}
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            Next Step
                            <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                    )}
                </CardFooter>
            </Card>
        </div>
    );
}
