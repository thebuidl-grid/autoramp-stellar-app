"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/api";
import { ApiKeysOverview } from "@/components/admin/api-keys/ApiKeysOverview";
import { ApiKeysTable } from "@/components/admin/api-keys/ApiKeysTable";
import { GenerateApiKeyDialog } from "@/components/admin/api-keys/GenerateApiKeyDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Key, Activity, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";

export default function AdminApiKeysPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const limit = 10;

    // Fetch summary stats
    const { data: summary, isLoading: isSummaryLoading } = useQuery({
        queryKey: ["admin-api-keys-summary"],
        queryFn: async () => {
            const { data } = await adminApi.getApiKeysSummary();
            return data;
        },
    });

    // Fetch all API keys
    const { data: keysResponse, isLoading: isKeysLoading } = useQuery({
        queryKey: ["admin-api-keys", page],
        queryFn: async () => {
            const { data } = await adminApi.getAllApiKeys(page, limit);
            return data;
        },
    });

    // Revoke key mutation
    const revokeMutation = useMutation({
        mutationFn: (id: string) => adminApi.revokeApiKey(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-api-keys"] });
            queryClient.invalidateQueries({ queryKey: ["admin-api-keys-summary"] });
            toast({
                title: "Key Revoked",
                description: "The API key has been successfully revoked.",
                variant: "success",
            });
        },
        onError: () => {
            toast({
                title: "Error",
                description: "Failed to revoke API key.",
                variant: "destructive",
            });
        },
    });

    const handleRevoke = (id: string) => {
        if (confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) {
            revokeMutation.mutate(id);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">API Keys Management</h1>
                    <p className="text-muted-foreground">
                        Generate and manage API keys for regular users.
                    </p>
                </div>
                <GenerateApiKeyDialog />
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Keys</CardTitle>
                        <Key className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isSummaryLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{summary?.totalKeys || 0}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Across all users</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Keys</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        {isSummaryLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{summary?.activeKeys || 0}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Currently operational</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                        <Activity className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        {isSummaryLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{summary?.totalRequests?.toLocaleString() || 0}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Lifetime usage</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Requests/Key</CardTitle>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isSummaryLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{summary?.averageRequestsPerKey || 0}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Efficiency metric</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                <div className="md:col-span-2 lg:col-span-7">
                    <ApiKeysOverview />
                </div>
            </div>

            <Card className="col-span-4">
                <CardHeader>
                    <CardTitle>API Keys List</CardTitle>
                </CardHeader>
                <CardContent>
                    {isKeysLoading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                        </div>
                    ) : (
                        <ApiKeysTable
                            apiKeys={keysResponse?.apiKeys || []}
                            onRevoke={handleRevoke}
                        />
                    )}

                    {/* Simple Pagination */}
                    {keysResponse && keysResponse.pagination.totalPages > 1 && (
                        <div className="flex items-center justify-end space-x-2 py-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(page - 1)}
                                disabled={page === 1}
                            >
                                Previous
                            </Button>
                            <span className="text-sm text-muted-foreground">
                                Page {page} of {keysResponse.pagination.totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(page + 1)}
                                disabled={page === keysResponse.pagination.totalPages}
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
