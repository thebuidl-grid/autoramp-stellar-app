"use client";

import { useState, useEffect } from "react";
import { getErrorMessage } from "@/lib/api";
import { merchantApi, MerchantApiKey } from "@/lib/merchant";
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
import { Loader2, Plus, Copy, Check, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function MerchantApiKeysPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [apiKeys, setApiKeys] = useState<MerchantApiKey[]>([]);
    const [isMerchant, setIsMerchant] = useState<boolean | null>(null);
    const [onboardingStatus, setOnboardingStatus] = useState<"VERIFIED" | "PENDING" | "REJECTED" | null>(null);

    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuthStore();

    // Create key dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [keyName, setKeyName] = useState("");
    const [newKey, setNewKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const checkAccess = async () => {
            try {
                try {
                    // Only need getMerchantStatus now as it contains all info
                    const { data } = await merchantApi.getMerchantStatus();

                    const hasRecord = data.hasMerchantRecord;
                    setIsMerchant(hasRecord);
                    setOnboardingStatus(data.onboardingStatus);

                    if (hasRecord && data.onboardingStatus === "VERIFIED") {
                        await fetchApiKeys();
                    }
                } catch (error) {
                    console.error("Access check failed:", error);
                    toast({
                        title: "Authentication Error",
                        description: "Failed to verify merchant status. Please login again.",
                        variant: "destructive",
                    });
                } finally {
                    setIsLoading(false);
                }
            };

            checkAccess();
        }, []);

    const fetchApiKeys = async () => {
        try {
            const response = await merchantApi.getApiKeys();
            setApiKeys(response.data);
        } catch (error) {
            console.error("Failed to fetch API keys:", error);
            toast({
                title: "Error",
                description: "Failed to load API keys",
                variant: "destructive",
            });
        }
    };

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
                merchantId: user?.id || "", // Fallback to userId if merchantId not available in store
                name: keyName,
            });
            setNewKey(response.data.key);
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

    const copyToClipboard = () => {
        if (newKey) {
            navigator.clipboard.writeText(newKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const resetDialog = () => {
        setKeyName("");
        setNewKey(null);
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
                        <Button className="gap-2 bg-primary text-white">
                            <Plus className="h-4 w-4" />
                            Create API Key
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-zinc-900 border-white/10 text-white">
                        <DialogHeader>
                            <DialogTitle className="text-white">Create API Key</DialogTitle>
                            <DialogDescription className="text-zinc-400">
                                Create a new API key to access the AutoRamp API.
                            </DialogDescription>
                        </DialogHeader>

                        {!newKey ? (
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="keyName" className="text-white">Key Name *</Label>
                                    <Input
                                        id="keyName"
                                        value={keyName}
                                        onChange={(e) => setKeyName(e.target.value)}
                                        placeholder="e.g. Production API Key"
                                        className="bg-black/20 border-white/10 text-white"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="grid gap-4 py-4">
                                <div className="rounded-md bg-amber-50 p-4 dark:bg-amber-900/20">
                                    <p className="text-sm text-amber-800 dark:text-amber-200">
                                        <strong>Important:</strong> Copy this key now. For security reasons, it will not be shown again.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input
                                        readOnly
                                        value={newKey}
                                        className="font-mono text-xs"
                                    />
                                    <Button size="icon" variant="outline" onClick={copyToClipboard}>
                                        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            {!newKey ? (
                                <Button onClick={handleCreateKey} disabled={isCreating}>
                                    {isCreating ? "Creating..." : "Create Key"}
                                </Button>
                            ) : (
                                <Button onClick={resetDialog}>Done</Button>
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
                                    className="flex items-center justify-between rounded-lg border p-4 shadow-sm"
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-2 bg-muted px-2 py-1 rounded font-mono text-sm">
                                                <span>{key.keyPrefix}...</span>
                                            </div>
                                            <Badge variant={key.isActive ? "success" : "secondary"}>
                                                {key.isActive ? "Active" : "Inactive"}
                                            </Badge>
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            Created: {new Date(key.createdAt).toLocaleDateString()}
                                        </div>
                                        {key.name && (
                                            <div className="text-sm text-muted-foreground">
                                                Name: {key.name}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
