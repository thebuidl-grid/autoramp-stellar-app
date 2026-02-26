"use client";

import { useMerchantApiKeyStats } from "@/lib/hooks";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Key, Activity, BarChart3, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, TrendingUp } from "lucide-react";
import { useOtcStatus } from "@/lib/hooks";

export default function MerchantDashboardPage() {
    const { data: stats, isLoading } = useMerchantApiKeyStats();
    const router = useRouter();
    const { toast } = useToast();
    const { isOTCEnabled } = useOtcStatus();

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Merchant Dashboard</h1>
                <p className="text-muted-foreground">
                    Welcome to your merchant overview.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total API Keys</CardTitle>
                        <Key className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.totalKeys || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Keys</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{stats?.activeKeys || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.totalRequests || 0}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Link href="/merchant/dashboard/api-keys">
                    <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                        <CardHeader className="flex flex-row items-center gap-4">
                            <Key className="h-8 w-8 text-amber-500" />
                            <div>
                                <CardTitle>API Keys</CardTitle>
                                <p className="text-sm text-muted-foreground">Manage your API keys</p>
                            </div>
                        </CardHeader>
                    </Card>
                </Link>
                <Link href="/merchant/dashboard/transactions">
                    <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                        <CardHeader className="flex flex-row items-center gap-4">
                            <BarChart3 className="h-8 w-8 text-blue-500" />
                            <div>
                                <CardTitle>Transactions</CardTitle>
                                <p className="text-sm text-muted-foreground">View usage reports</p>
                            </div>
                        </CardHeader>
                    </Card>
                </Link>
                <Link href="/merchant/dashboard/settings">
                    <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                        <CardHeader className="flex flex-row items-center gap-4">
                            <Settings className="h-8 w-8 text-slate-500" />
                            <div>
                                <CardTitle>Settings</CardTitle>
                                <p className="text-sm text-muted-foreground">Manage your account</p>
                            </div>
                        </CardHeader>
                    </Card>
                </Link>
                {isOTCEnabled && (
                    <Link href="/otc/trade">
                        <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full border-primary/20 bg-primary/5">
                            <CardHeader className="flex flex-row items-center gap-4">
                                <TrendingUp className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle>OTC Trading</CardTitle>
                                    <p className="text-sm text-muted-foreground">Access OTC trade portal</p>
                                </div>
                            </CardHeader>
                        </Card>
                    </Link>
                )}
            </div>
        </div>
    );
}
