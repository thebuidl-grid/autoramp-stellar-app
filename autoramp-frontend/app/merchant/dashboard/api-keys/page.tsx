"use client";

import { useState, useEffect } from "react";
import { getErrorMessage } from "@/lib/api";
import { CreateMerchantApiKeyResponse, merchantApi, MerchantApiKey } from "@/lib/merchant";
import { useAuthStore } from "@/lib/store";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Copy, Check, AlertCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { useMerchantStatus, useMerchantApiKeys } from "@/lib/hooks";

export default function MerchantApiKeysPage() {
    const { data: status, isLoading: isStatusLoading } = useMerchantStatus();
    const { data: apiKeys = [], isLoading: isKeysLoading, refetch: fetchApiKeys } = useMerchantApiKeys();

    const isMerchant = status?.hasMerchantRecord ?? null;
    const onboardingStatus = status?.onboardingStaus ?? null;
    const isLoading = isStatusLoading || (isMerchant && onboardingStatus === "VERIFIED" && isKeysLoading);

    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuthStore();

    // Create key dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [keyName, setKeyName] = useState("");
    const [newKeyData, setNewKeyData] = useState<CreateMerchantApiKeyResponse | null>(null);
    const [copied, setCopied] = useState(false);

    // Revocation state
    const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
    const [keyToRevoke, setKeyToRevoke] = useState<MerchantApiKey | null>(null);
    const [isRevoking, setIsRevoking] = useState(false);

    const handleCreateKey = async () => {
        if (!keyName) {
            toast({
                title: "Error",
                description: "Please enter a name for the API key",
                variant: "destructive",
            });
            return;
        }

        setIsCreating(true);
        try {
            // In a real scenario, we might need to get the merchantId from the profile
            // For now, the backend might handle it via the token if it's uniquely mapped
            const response = await merchantApi.createApiKey({
                merchantId: (await merchantApi.getMerchantStatus()).data?.merchantId || "", // Fallback to userId if merchantId not available in store
                name: keyName,
            });
            setNewKeyData(response.data);
            toast({
                title: "Success",
                description: "API key created successfully",
                variant: "success",
            });
            fetchApiKeys();
        } catch (error) {
            toast({
                title: "Error",
                description: getErrorMessage(error),
                variant: "destructive",
            });
        } finally {
            setIsCreating(false);
        }
    };

    const handleRevokeKey = async () => {
        if (!keyToRevoke) return;

        setIsRevoking(true);
        try {
            await merchantApi.revokeApiKey(keyToRevoke.id);
            toast({
                title: "Success",
                description: "API key revoked successfully",
                variant: "success",
            });
            fetchApiKeys();
            setRevokeDialogOpen(false);
        } catch (error) {
            toast({
                title: "Error",
                description: getErrorMessage(error),
                variant: "destructive",
            });
        } finally {
            setIsRevoking(false);
            setKeyToRevoke(null);
        }
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
        setDialogOpen(false);
    };

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!isMerchant) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 bg-white/5 border border-white/10 rounded-xl">
                <div className="p-4 bg-red-500/10 rounded-full text-red-500">
                    <AlertCircle className="h-12 w-12" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold text-white">Access Restricted</h1>
                    <p className="text-zinc-500 max-w-sm">
                        You need to be an approved merchant to access API keys. Please complete your KYB application.
                    </p>
                </div>
                <Button asChild className="bg-primary text-white">
                    <Link href="/merchant/onboarding">Start Onboarding</Link>
                </Button>
            </div>
        );
    }

    if (onboardingStatus === "PENDING") {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 bg-white/5 border border-white/10 rounded-xl">
                <div className="p-4 bg-amber-500/10 rounded-full text-amber-500">
                    <Loader2 className="h-12 w-12 animate-spin" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold text-white">Onboarding in Progress</h1>
                    <p className="text-zinc-500 max-w-sm">
                        Your merchant application is currently being reviewed. API functionality will be unlocked once your account is verified.
                    </p>
                </div>
            </div>
        );
    }

    if (onboardingStatus === "REJECTED") {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 bg-white/5 border border-white/10 rounded-xl">
                <div className="p-4 bg-red-500/10 rounded-full text-red-500">
                    <AlertCircle className="h-12 w-12" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold text-white">Application Rejected</h1>
                    <p className="text-zinc-500 max-w-sm">
                        Unfortunately, your merchant application was not approved. Please contact support for more information or to re-apply.
                    </p>
                </div>
                <Button asChild variant="outline" className="border-white/10 text-white">
                    <Link href="/merchant/support">Contact Support</Link>
                </Button>
            </div>
        );
    }

    if (onboardingStatus !== "VERIFIED") {
        // Fallback for null or unknown status, treat as not onboarded/restricted
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 bg-white/5 border border-white/10 rounded-xl">
                <div className="p-4 bg-red-500/10 rounded-full text-red-500">
                    <AlertCircle className="h-12 w-12" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold text-white">Access Restricted</h1>
                    <p className="text-zinc-500 max-w-sm">
                        You need to be a verified merchant to access API keys.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white">API Keys</h1>
                    <p className="text-zinc-400">
                        Manage your API keys for accessing the AutoRamp API.
                    </p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={(v) => {
                    if (!v) resetDialog();
                    setDialogOpen(v);
                }}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 bg-primary text-black">
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
                                    : "Create a new API key to access the AutoRamp API."}
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
                                                    For your security, we only show this secret key once.
                                                    If you lose it, you'll need to create a new one.
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
                                        onClick={() => setDialogOpen(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        className="flex-1 bg-primary text-black hover:bg-primary/90"
                                        onClick={handleCreateKey}
                                        disabled={isCreating}
                                    >
                                        {isCreating ? (
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

            <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                <CardHeader>
                    <CardTitle className="text-white">Your API Keys</CardTitle>
                    <CardDescription className="text-zinc-500">
                        List of all active and inactive API keys.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {apiKeys.length === 0 ? (
                        <div className="text-center py-12 text-zinc-600 border border-dashed border-white/10 rounded-lg">
                            No API keys yet. Click "Create API Key" to get started.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {apiKeys.map((key) => (
                                <div
                                    key={key.id}
                                    className="flex items-center justify-between rounded-lg border border-white/10 p-4 shadow-sm hover:bg-white/5 transition-colors group"
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-2 bg-white/5 px-2 py-1 rounded font-mono text-sm border border-white/5">
                                                <span className="text-zinc-300">{key.keyPrefix}...</span>
                                            </div>
                                            <Badge variant={key.isActive ? "success" : "secondary"} className={key.isActive ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : ""}>
                                                {key.isActive ? "Active" : "Inactive"}
                                            </Badge>
                                        </div>
                                        <div className="flex flex-col gap-0.5 mt-2">
                                            {key.name && (
                                                <span className="text-sm font-medium text-white">{key.name}</span>
                                            )}
                                            <span className="text-[10px] text-zinc-500">Created: {new Date(key.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => {
                                            setKeyToRevoke(key);
                                            setRevokeDialogOpen(true);
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Revoke Confirmation Dialog */}
            <Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
                <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-rose-500" />
                            Revoke API Key
                        </DialogTitle>
                        <DialogDescription className="text-zinc-400">
                            Are you sure you want to revoke <span className="text-white font-medium">{keyToRevoke?.name || "this key"}</span>?
                            This action cannot be undone and any applications using this key will lose access immediately.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            className="border-white/10 text-white hover:bg-white/5"
                            onClick={() => setRevokeDialogOpen(false)}
                            disabled={isRevoking}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="bg-rose-500 text-white hover:bg-rose-600"
                            onClick={handleRevokeKey}
                            disabled={isRevoking}
                        >
                            {isRevoking ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Revoking...
                                </>
                            ) : "Revoke Key"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
