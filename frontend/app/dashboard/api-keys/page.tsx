"use client";

import { useQuery } from "@tanstack/react-query";
import { userApi } from "@/lib/api";
import { UserApiKeysOverview } from "@/components/dashboard/api-keys/UserApiKeysOverview";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Key, Activity, Clock, ShieldCheck, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UserApiKeysPage() {
    // Fetch user keys
    const { data: keys, isLoading: isKeysLoading } = useQuery({
        queryKey: ["user-api-keys"],
        queryFn: async () => {
            const { data } = await userApi.getUserApiKeys();
            return data;
        },
    });

    // Fetch user stats
    const { data: stats, isLoading: isStatsLoading } = useQuery({
        queryKey: ["user-api-keys-stats"],
        queryFn: async () => {
            const { data } = await userApi.getUserApiKeyStats();
            return data;
        },
    });

    return (
        <div className="container py-10 space-y-8">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">API Management</h1>
                    <p className="text-muted-foreground">
                        Monitor your API keys and usage statistics.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="gap-2">
                        <HelpCircle className="h-4 w-4" />
                        Docs
                    </Button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Keys</CardTitle>
                        <ShieldCheck className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        {isStatsLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{stats?.activeKeys || 0} / {stats?.totalKeys || 0}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Operational keys</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                        <Activity className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        {isStatsLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{stats?.totalRequests?.toLocaleString() || 0}</div>
                        )}
                        <p className="text-xs text-muted-foreground">All-time API calls</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Last Activity</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isStatsLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">
                                {stats?.lastRequestAt ? format(new Date(stats.lastRequestAt), "HH:mm") : "Never"}
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            {stats?.lastRequestAt ? format(new Date(stats.lastRequestAt), "MMM d, yyyy") : "No requests yet"}
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-primary/5 border-primary/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Need more keys?</CardTitle>
                        <Key className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground mb-2">
                            Contact support or your account manager to generate new API keys.
                        </p>
                        <Button variant="link" className="h-auto p-0 text-xs font-semibold">
                            Request New Key
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <UserApiKeysOverview />

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Your API Keys</CardTitle>
                        <CardDescription>Only prefixes are shown for security.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isKeysLoading ? (
                            <div className="space-y-3">
                                <Skeleton className="h-12 w-full" />
                                <Skeleton className="h-12 w-full" />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {keys && keys.length > 0 ? (
                                    keys.map((key) => (
                                        <div key={key.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-sm font-medium text-foreground">
                                                        {key.keyPrefix}...
                                                    </span>
                                                    <Badge variant={key.isActive ? "success" : "secondary"} className="text-[10px] py-0 h-4">
                                                        {key.isActive ? "Active" : "Revoked"}
                                                    </Badge>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    {key.name || "Default Key"} • Created {format(new Date(key.createdAt), "MMM d, yyyy")}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Last used</p>
                                                <p className="text-xs font-medium">
                                                    {key.lastUsedAt ? format(new Date(key.lastUsedAt), "MMM d") : "Never"}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-6 text-muted-foreground text-sm">
                                        No API keys assigned to your account.
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
