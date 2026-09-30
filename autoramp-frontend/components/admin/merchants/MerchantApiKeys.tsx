"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Trash2, Key, Shield, Calendar, Activity, AlertCircle, Loader2, Plus, Copy, Check } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, ApiKey, CreateApiKeyResponse } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MerchantApiKeysProps {
    merchantId: string;
    userId: string;
}

export function MerchantApiKeys({ merchantId, userId }: MerchantApiKeysProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Dialog state
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [keyName, setKeyName] = useState("");
    const [newKeyData, setNewKeyData] = useState<CreateApiKeyResponse | null>(null);
    const [copied, setCopied] = useState(false);

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

    const createMutation = useMutation({
        mutationFn: (data: { name: string }) => adminApi.createApiKeyForUser(userId, data),
        onSuccess: (response) => {
            queryClient.invalidateQueries({ queryKey: ["merchant-api-keys", merchantId] });
            setNewKeyData(response.data);
            toast({
                title: "Key Created",
                description: "The API key has been successfully created.",
                variant: "success",
            });
        },
        onError: () => {
            toast({
                title: "Error",
                description: "Failed to create API key.",
                variant: "destructive",
            });
        },
    });

    const handleRevoke = (id: string) => {
        if (confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) {
            revokeMutation.mutate(id);
        }
    };

    const handleCreateKey = () => {
        if (!keyName) {
            toast({
                title: "Missing Name",
                description: "Please enter a name for the API key.",
                variant: "destructive",
            });
            return;
        }
        createMutation.mutate({ name: keyName });
    };

    const copyToClipboard = () => {
        if (newKeyData?.key) {
            navigator.clipboard.writeText(newKeyData.key);
            setCopied(true);
            toast({
                title: "Copied",
                description: "API key copied to clipboard",
            });
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const resetDialog = () => {
        setKeyName("");
        setNewKeyData(null);
        setCopied(false);
        setCreateDialogOpen(false);
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
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">API Access Management</h2>
                <Dialog open={createDialogOpen} onOpenChange={(v) => {
                    if (!v) resetDialog();
                    setCreateDialogOpen(v);
                }}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 bg-primary text-black hover:bg-primary/90">
                            <Plus className="h-4 w-4" />
                            Create API Key
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-white">
                                {newKeyData ? "API Key Created" : "Create API Key"}
                            </DialogTitle>
                            <DialogDescription className="text-zinc-400">
                                {newKeyData
                                    ? "Please save your API key now. You won't be able to see it again."
                                    : "Create a new API key for this merchant."}
                            </DialogDescription>
                        </DialogHeader>

                        {!newKeyData ? (
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="keyName" className="text-white">Key Name *</Label>
                                    <Input
                                        id="keyName"
                                        value={keyName}
                                        onChange={(e) => setKeyName(e.target.value)}
                                        placeholder="e.g. Production API Key"
                                        className="bg-black/20 border-white/10 text-white focus:ring-primary"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="grid gap-6 py-4">
                                <div className="space-y-4">
                                    <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4">
                                        <div className="flex gap-3">
                                            <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
                                            <div className="space-y-1">
                                                <p className="text-sm font-semibold text-rose-500">Security Requirement</p>
                                                <p className="text-xs text-rose-400/80 leading-relaxed">
                                                    For security, we only show this secret key once.
                                                    If the merchant loses it, you'll need to create a new one.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <Label className="text-[10px] uppercase tracking-wider text-zinc-500">Key Name</Label>
                                                <p className="text-sm font-medium text-white">{newKeyData.name || "Unnamed Key"}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[10px] uppercase tracking-wider text-zinc-500">Prefix</Label>
                                                <p className="text-sm font-mono text-zinc-300">{newKeyData.keyPrefix}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-[10px] uppercase tracking-wider text-zinc-500">Secret Key</Label>
                                            <div className="relative group">
                                                <div className="absolute inset-y-0 right-0 flex items-center pr-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10"
                                                        onClick={copyToClipboard}
                                                    >
                                                        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                                                    </Button>
                                                </div>
                                                <div className="bg-black/40 border border-white/10 rounded-lg p-3 pr-10 font-mono text-xs break-all text-emerald-400 selection:bg-emerald-500/20">
                                                    {newKeyData.key}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            {!newKeyData ? (
                                <div className="flex w-full gap-3">
                                    <Button
                                        variant="outline"
                                        className="flex-1 border-white/10 text-white hover:bg-white/5"
                                        onClick={() => setCreateDialogOpen(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        className="flex-1 bg-primary text-black hover:bg-primary/90"
                                        onClick={handleCreateKey}
                                        disabled={createMutation.isPending}
                                    >
                                        {createMutation.isPending ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Creating...
                                            </>
                                        ) : "Create Key"}
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    className="w-full bg-emerald-500 text-white hover:bg-emerald-600 font-semibold"
                                    onClick={resetDialog}
                                >
                                    I have saved this key safely
                                </Button>
                            )}
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

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
