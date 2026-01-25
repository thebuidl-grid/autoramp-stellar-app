"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { merchantApi, getErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

const businessSchema = z.object({
    name: z.string().min(2, "Business name must be at least 2 characters"),
    natureOfBusiness: z.string().optional(),
    description: z.string().optional(),
    websiteUrl: z.string().optional(),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    postalCode: z.string().optional(),
});

type BusinessFormValues = z.infer<typeof businessSchema>;

interface BusinessDetailsFormProps {
    onNext: () => void;
}

export default function BusinessDetailsForm({ onNext }: BusinessDetailsFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const { user } = useAuthStore();
    const { toast } = useToast();

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<BusinessFormValues>({
        resolver: zodResolver(businessSchema),
        defaultValues: {
            country: "Nigeria",
        }
    });

    const onSubmit = async (data: BusinessFormValues) => {
        setIsLoading(true);
        try {
            if (!user?.id) throw new Error("User not found");

            // Submit details to backend
            await merchantApi.submitBusinessDetails({
                ...data,
                userId: user.id,
            });

            toast({
                title: "Success",
                description: "Business details saved successfully",
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

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label htmlFor="name">Business Name</Label>
                    <Input id="name" {...register("name")} placeholder="Enter business name" className="bg-black/50 border-white/10" />
                    {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="natureOfBusiness">Nature of Business</Label>
                    <Input id="natureOfBusiness" {...register("natureOfBusiness")} placeholder="e.g. Retail, FinTech" className="bg-black/50 border-white/10" />
                    {errors.natureOfBusiness && <p className="text-red-500 text-xs">{errors.natureOfBusiness.message}</p>}
                </div>

                <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="description">Business Description</Label>
                    <Textarea id="description" {...register("description")} placeholder="Describe your business operations" className="bg-black/50 border-white/10" />
                    {errors.description && <p className="text-red-500 text-xs">{errors.description.message}</p>}
                </div>

                <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="websiteUrl">Website URL</Label>
                    <Input id="websiteUrl" {...register("websiteUrl")} placeholder="https://example.com" className="bg-black/50 border-white/10" />
                    {errors.websiteUrl && <p className="text-red-500 text-xs">{errors.websiteUrl.message}</p>}
                </div>

                <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="addressLine1">Address Line 1</Label>
                    <Input id="addressLine1" {...register("addressLine1")} placeholder="Street address" className="bg-black/50 border-white/10" />
                    {errors.addressLine1 && <p className="text-red-500 text-xs">{errors.addressLine1.message}</p>}
                </div>

                <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="addressLine2">Address Line 2 (Optional)</Label>
                    <Input id="addressLine2" {...register("addressLine2")} placeholder="Suite, Apartment, etc." className="bg-black/50 border-white/10" />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" {...register("city")} placeholder="City" className="bg-black/50 border-white/10" />
                    {errors.city && <p className="text-red-500 text-xs">{errors.city.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input id="state" {...register("state")} placeholder="State" className="bg-black/50 border-white/10" />
                    {errors.state && <p className="text-red-500 text-xs">{errors.state.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="postalCode">Postal Code</Label>
                    <Input id="postalCode" {...register("postalCode")} placeholder="Postal code" className="bg-black/50 border-white/10" />
                    {errors.postalCode && <p className="text-red-500 text-xs">{errors.postalCode.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input id="country" {...register("country")} placeholder="Country" className="bg-black/50 border-white/10" />
                    {errors.country && <p className="text-red-500 text-xs">{errors.country.message}</p>}
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <Button type="submit" disabled={isLoading} className="w-full md:w-auto px-12">
                    {isLoading ? "Saving..." : "Next Step"}
                </Button>
            </div>
        </form>
    );
}
