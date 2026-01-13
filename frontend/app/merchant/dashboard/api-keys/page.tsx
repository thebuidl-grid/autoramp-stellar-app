"use client";

import { useState, useEffect } from "react";
import { userApi, ApiKey } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function MerchantApiKeysPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const router = useRouter();
    const { toast } = useToast();

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
                description: "Failed to reload API keys",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
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
            <div>
                <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
                <p className="text-muted-foreground">
                    Manage your API keys for accessing the AutoRamp API.
                </p>
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
                            No API keys found. Please contact support to generate one.
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
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm" disabled>
                                            Revoke (Admin Only)
                                        </Button>
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
