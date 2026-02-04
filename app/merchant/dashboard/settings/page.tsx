"use client";

import { useBanks } from "@/lib/hooks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import BusinessDetailsView from "@/components/merchant/settings/BusinessDetailsView";
import DocumentationView from "@/components/merchant/settings/DocumentationView";
import DirectorsView from "@/components/merchant/settings/DirectorsView";
import ShareholdersView from "@/components/merchant/settings/ShareholdersView";
import BankAccountView from "@/components/merchant/settings/BankAccountView";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

export default function MerchantSettingsPage() {
    const { data: banks = [], isLoading: isBanksLoading } = useBanks();
    const isLoading = isBanksLoading;
    const { toast } = useToast();

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-4 w-64" />
                <div className="mt-8 space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-[400px] w-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Merchant Settings</h1>
                <p className="text-muted-foreground">
                    View your business profile and compliance information.
                </p>
            </div>

            <Tabs defaultValue="business" className="w-full space-y-6">
                <TabsList className="bg-white/5 border border-white/10 p-1 rounded-xl w-full justify-start overflow-x-auto">
                    <TabsTrigger value="business" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-black">Business Details</TabsTrigger>
                    <TabsTrigger value="documentation" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-black">Documentation</TabsTrigger>
                    <TabsTrigger value="directors" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-black">Directors</TabsTrigger>
                    <TabsTrigger value="shareholders" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-black">Shareholders</TabsTrigger>
                    <TabsTrigger value="bank" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-black">Settlement Bank</TabsTrigger>
                </TabsList>

                <Card className="bg-black/30 backdrop-blur-md border-white/10 rounded-2xl overflow-hidden">
                    <CardHeader className="border-b border-white/5 bg-white/2">
                        <CardTitle>Merchant Profile Information</CardTitle>
                        <CardDescription>
                            Keep your business profile and settlement details up to date.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-8">
                        <TabsContent value="business" className="mt-0 outline-none">
                            <BusinessDetailsView />
                        </TabsContent>
                        <TabsContent value="documentation" className="mt-0 outline-none">
                            <DocumentationView />
                        </TabsContent>
                        <TabsContent value="directors" className="mt-0 outline-none">
                            <DirectorsView />
                        </TabsContent>
                        <TabsContent value="shareholders" className="mt-0 outline-none">
                            <ShareholdersView />
                        </TabsContent>
                        <TabsContent value="bank" className="mt-0 outline-none">
                            <BankAccountView banks={banks} />
                        </TabsContent>
                    </CardContent>
                </Card>
            </Tabs>
        </div>
    );
}
