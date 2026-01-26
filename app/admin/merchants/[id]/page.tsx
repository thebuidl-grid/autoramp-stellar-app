"use client";

import { use } from "react";
import { ChevronLeft, Building2, User, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { MerchantKYBDetails } from "@/components/admin/merchants/MerchantKYBDetails";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function MerchantDetailPage({ params }: PageProps) {
    const { id } = use(params);

    const { data: merchant, isLoading, refetch } = useQuery({
        queryKey: ["admin-merchant", id],
        queryFn: async () => {
            const { data } = await adminApi.getMerchantById(id);
            return data;
        },
    });

    if (isLoading) {
        return (
            <div className="flex h-[400px] w-full items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                    <p className="text-zinc-500 animate-pulse">Fetching merchant details...</p>
                </div>
            </div>
        );
    }

    if (!merchant) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 bg-white/5 border border-white/10 rounded-xl">
                <div className="p-4 bg-red-500/10 rounded-full text-red-500">
                    <Building2 className="h-12 w-12" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold text-white">Merchant Not Found</h1>
                    <p className="text-zinc-500 max-w-sm">
                        The merchant you are looking for does not exist or has been removed from the platform.
                    </p>
                </div>
                <Button asChild variant="outline" className="border-white/10 text-white">
                    <Link href="/admin/merchants">Return to List</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-12">
            <div className="flex items-center gap-4">
                <Button asChild variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-white/5">
                    <Link href="/admin/merchants">
                        <ChevronLeft className="h-6 w-6" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white">
                        {merchant.kyb?.businessName || "Merchant Details"}
                    </h1>
                    <p className="text-zinc-500 text-sm">Review merchant onboarding and KYB data.</p>
                </div>
            </div>

            <Tabs defaultValue="kyb" className="w-full">
                <TabsList className="bg-white/5 border-white/10 p-1 mb-8">
                    <TabsTrigger value="kyb" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex gap-2 items-center">
                        <Building2 className="h-4 w-4" /> KYB Application
                    </TabsTrigger>
                    <TabsTrigger value="transactions" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex gap-2 items-center">
                        <History className="h-4 w-4" /> Transactions
                    </TabsTrigger>
                    <TabsTrigger value="api-keys" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex gap-2 items-center">
                        <User className="h-4 w-4" /> API Keys & Usage
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="kyb" className="mt-0 outline-none">
                    <MerchantKYBDetails merchant={merchant} onStatusUpdate={() => refetch()} />
                </TabsContent>

                <TabsContent value="transactions" className="mt-0 outline-none">
                    <div className="p-12 text-center bg-white/5 border border-white/10 rounded-xl border-dashed">
                        <History className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-white mb-2">Merchant Transactions</h3>
                        <p className="text-zinc-500 mb-6">View all onramp and offramp transactions associated with this merchant API key.</p>
                        <Button variant="outline" className="border-white/10 text-white" disabled>Coming Soon</Button>
                    </div>
                </TabsContent>

                <TabsContent value="api-keys" className="mt-0 outline-none">
                    <div className="p-12 text-center bg-white/5 border border-white/10 rounded-xl border-dashed">
                        <User className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-white mb-2">API Access Tracking</h3>
                        <p className="text-zinc-500 mb-6">Monitor API usage, request limits, and active keys for this business.</p>
                        <Button variant="outline" className="border-white/10 text-white" disabled>Coming Soon</Button>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
