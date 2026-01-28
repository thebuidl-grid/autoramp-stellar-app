"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Trash2, Key, Shield, Calendar, Activity, AlertCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, ApiKey } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";

interface MerchantApiKeysProps {
    merchantId: string;
}

export function MerchantApiKeys({ merchantId }: MerchantApiKeysProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: apiKeys, isLoading } = useQuery({
        queryKey: ["merchant-api-keys", merchantId],
        queryFn: async () => {
            const { data } = await adminApi.getMerchantApiKeys(merchantId);
            // Handle potentially wrapped response
            if (Array.isArray(data)) return data;
            // Check for common wrapper patterns
            const possibleArray = (data as any).apiKeys || (data as any).data || (data as any).keys;
            return Array.isArray(possibleArray) ? possibleArray : [];
        },
    });

    const revokeMutation = useMutation({
        mutationFn: (id: string) => adminApi.revokeApiKey(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["merchant-api-keys", merchantId] });
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

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-32 w-full bg-white/5" />
                <Skeleton className="h-64 w-full bg-white/5" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-white/5 border-white/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-zinc-500 text-xs font-medium uppercase tracking-wider flex items-center gap-2">
                            <Key className="h-4 w-4" /> Total Keys
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white">{apiKeys?.length || 0}</div>
                    </CardContent>
                </Card>
                <Card className="bg-white/5 border-white/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-zinc-500 text-xs font-medium uppercase tracking-wider flex items-center gap-2">
                            <Shield className="h-4 w-4 text-green-500" /> Active Keys
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white">
                            {apiKeys?.filter(k => k.isActive).length || 0}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-white/5 border-white/10 overflow-hidden">
                <CardHeader className="border-b border-white/10">
                    <CardTitle className="text-white">Active API Access Tokens</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-white/5 text-zinc-400 border-b border-white/10">
                                <tr>
                                    <th className="p-4 text-left font-medium">Key Prefix</th>
                                    <th className="p-4 text-left font-medium">Name</th>
                                    <th className="p-4 text-left font-medium">Status</th>
                                    <th className="p-4 text-left font-medium">Last Used</th>
                                    <th className="p-4 text-left font-medium">Created</th>
                                    <th className="p-4 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {!apiKeys || apiKeys.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-12 text-center text-zinc-500">
                                            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                            No API keys generated for this merchant.
                                        </td>
                                    </tr>
                                ) : (
                                    apiKeys.map((key) => (
                                        <tr key={key.id} className="hover:bg-white/5 transition-colors group">
                                            <td className="p-4 font-mono text-zinc-300">
                                                {key.keyPrefix}...
                                            </td>
                                            <td className="p-4">
                                                <div className="font-medium text-white">{key.name || "Production Key"}</div>
                                                <div className="text-xs text-zinc-500 flex items-center gap-1">
                                                    <Activity className="h-3 w-3" />
                                                    {(key as any).requestCount || 0} total requests
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <Badge
                                                    variant={key.isActive ? "success" : "default"}
                                                    className={key.isActive ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-white/5 text-zinc-500 border-white/10"}
                                                >
                                                    {key.isActive ? "Active" : "Revoked"}
                                                </Badge>
                                            </td>
                                            <td className="p-4 text-zinc-400">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-3.5 w-3.5 text-zinc-600" />
                                                    {key.lastUsedAt ? format(new Date(key.lastUsedAt), "MMM d, HH:mm") : "Never used"}
                                                </div>
                                            </td>
                                            <td className="p-4 text-zinc-400">
                                                {format(new Date(key.createdAt), "MMM d, yyyy")}
                                            </td>
                                            <td className="p-4 text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-zinc-500 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    disabled={!key.isActive || revokeMutation.isPending}
                                                    onClick={() => handleRevoke(key.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
