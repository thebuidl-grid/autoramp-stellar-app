"use client";

import { useState, useEffect } from "react";
import { userApi, ApiKey, getErrorMessage } from "@/lib/api";
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
import { Loader2, Plus, Copy, Check } from "lucide-react";
import { useRouter } from "next/navigation";

export default function MerchantApiKeysPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const router = useRouter();
    const { toast } = useToast();

    // Create key dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [keyName, setKeyName] = useState("");
    const [businessName, setBusinessName] = useState("");
    const [newKey, setNewKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetchApiKeys();
    }, []);

    const fetchApiKeys = async () => {
        try {
            const response = await userApi.getUserApiKeys();
            setApiKeys(response.data);
        } catch (error) {
            console.error("Failed to fetch API keys:", error);
            if ((error as any)?.response?.status === 401) {
                router.push("/merchant/login");
            }
            toast({
                title: "Error",
                description: "Failed to load API keys",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
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
            const response = await userApi.createApiKey({
                name: keyName,
                businessName: businessName || undefined,
            });
            setNewKey(response.data.key);
            toast({
                title: "Success",
                description: "API key created successfully",
                variant: "success",
            });
            // Refresh the list
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
        setBusinessName("");
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

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
                    <p className="text-muted-foreground">
                        Manage your API keys for accessing the AutoRamp API.
                    </p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={(v) => {
                    if (!v) resetDialog();
                    setDialogOpen(v);
                }}>
                    <DialogTrigger asChild>
                        <Button className="gap-2">
                            <Plus className="h-4 w-4" />
                            Create API Key
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create API Key</DialogTitle>
                            <DialogDescription>
                                Create a new API key to access the AutoRamp API.
                            </DialogDescription>
                        </DialogHeader>

                        {!newKey ? (
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="keyName">Key Name *</Label>
                                    <Input
                                        id="keyName"
                                        value={keyName}
                                        onChange={(e) => setKeyName(e.target.value)}
                                        placeholder="e.g. Production API Key"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="businessName">Business Name (optional)</Label>
                                    <Input
                                        id="businessName"
                                        value={businessName}
                                        onChange={(e) => setBusinessName(e.target.value)}
                                        placeholder="e.g. Acme Corp"
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

            <Card>
                <CardHeader>
                    <CardTitle>Your API Keys</CardTitle>
                    <CardDescription>
                        List of all active and inactive API keys.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {apiKeys.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
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
