"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, User, Fingerprint } from "lucide-react";
import { otcApi, OtcIdentityType } from "@/lib/api";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const onboardingSchema = z.object({
    identityType: z.enum(OtcIdentityType),
    identityNumber: z.string().min(10, "Identity number must be at least 10 characters"),
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

export function OtcOnboardingForm() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);
    const { toast } = useToast();
    const [isLoaded, setIsLoaded] = useState(false);

    const form = useForm<OnboardingFormValues>({
        resolver: zodResolver(onboardingSchema) as any,
        defaultValues: {
            identityType: OtcIdentityType.BVN,
            identityNumber: "",
        },
    });

    // Persistence: Load progress on mount
    useEffect(() => {
        const savedProgress = localStorage.getItem("otc_onboarding_progress");
        if (savedProgress) {
            try {
                const { formData } = JSON.parse(savedProgress);
                form.reset(formData);
            } catch (error) {
                console.error("Error loading OTC progress:", error);
            }
        }
        setIsLoaded(true);
    }, [form]);

    // Persistence: Save progress on changes
    useEffect(() => {
        if (!isLoaded) return;

        const timer = setTimeout(() => {
            const formData = form.getValues();
            localStorage.setItem("otc_onboarding_progress", JSON.stringify({
                formData
            }));
        }, 1000);

        return () => clearTimeout(timer);
    }, [form.watch(), isLoaded]);

    const onSubmit = async (data: OnboardingFormValues) => {
        setIsSubmitting(true);
        try {
            const response = await otcApi.onboard(data);
            
            if (response.data.success) {
                toast({
                    title: "Success",
                    description: response.data.message || "Identity verification submitted successfully.",
                    variant: "success",
                });
                setIsCompleted(true);
                localStorage.removeItem("otc_onboarding_progress");
            } else {
                throw new Error(response.data.message || "Failed to submit onboarding.");
            }
        } catch (error: any) {
            console.error("OTC onboarding error", error);
            toast({
                title: "Error",
                description: error.response?.data?.message || error.message || "Failed to submit onboarding. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isCompleted) {
        return (
            <Card className="max-w-2xl mx-auto border-none shadow-2xl bg-white/5 backdrop-blur-md">
                <CardContent className="pt-12 pb-12 flex flex-col items-center text-center space-y-6">
                    <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-12 h-12 text-green-500" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-3xl font-bold tracking-tight text-white">Verification Submitted!</h2>
                        <p className="text-gray-400 max-w-md mx-auto">
                            Thank you for submitting your identity details. We will notify you once your verification is complete.
                        </p>
                    </div>
                    <Button asChild className="mt-4">
                        <a href="/otc/trade">Proceed to Trade</a>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="max-w-xl mx-auto border-none shadow-2xl bg-white/5 backdrop-blur-md ring-1 ring-white/10">
            <CardHeader>
                <CardTitle className="text-2xl text-white flex items-center gap-2">
                    <Fingerprint className="w-6 h-6 text-primary" />
                    Identity Verification
                </CardTitle>
                <CardDescription className="text-zinc-400">
                    Choose your identity type and provide the corresponding number to get started with OTC.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <FormField
                            control={form.control}
                            name="identityType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-zinc-200">Identity Type</FormLabel>
                                    <Select
                                        onValueChange={field.onChange}
                                        defaultValue={field.value}
                                    >
                                        <FormControl>
                                            <SelectTrigger className="bg-zinc-900/50 border-zinc-700 text-white">
                                                <SelectValue placeholder="Select identity type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                                            <SelectItem value={OtcIdentityType.BVN}>BVN (Bank Verification Number)</SelectItem>
                                            <SelectItem value={OtcIdentityType.NIN}>NIN (National Identification Number)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="identityNumber"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-zinc-200">Identity Number</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder={`Enter your ${form.watch("identityType")} number`}
                                            {...field}
                                            className="bg-zinc-900/50 border-zinc-700 text-white focus:ring-primary"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full h-12 text-lg font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Submitting...
                                </>
                            ) : (
                                "Submit Verification"
                            )}
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
