"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    ChevronLeft,
    ChevronRight,
    MoreHorizontal,
    Trash2,
    Key
} from "lucide-react";
import { format } from "date-fns";
import { adminApi, getErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function ApiKeysPage() {
    const [page, setPage] = useState(1);
    const limit = 10;
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [apiKeyToRevoke, setApiKeyToRevoke] = useState<string | null>(null);

    const { data, isLoading, error } = useQuery({
        queryKey: ["adminApiKeys", page],
        queryFn: () => adminApi.getAllApiKeys(page, limit),
    });

    const revokeMutation = useMutation({
        mutationFn: (id: string) => adminApi.revokeApiKey(id),
        onSuccess: () => {
            toast({
                title: "API Key Revoked",
                description: "The API key has been successfully revoked.",
                variant: "success",
            });
            queryClient.invalidateQueries({ queryKey: ["adminApiKeys"] });
            setApiKeyToRevoke(null);
        },
        onError: (err) => {
            toast({
                title: "Error",
                description: getErrorMessage(err),
                variant: "destructive",
            });
            setApiKeyToRevoke(null);
        },
    });

    const apiKeys = data?.data.apiKeys || [];
    const pagination = data?.data.pagination;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">API Keys</h2>
                    <p className="text-muted-foreground">
                        Monitor and manage API credentials across the platform.
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>All API Keys</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-2">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                            ))}
                        </div>
                    ) : error ? (
                        <div className="text-red-500">Error loading API keys.</div>
                    ) : (
                        <>
                            <div className="relative w-full overflow-auto">
                                <table className="w-full caption-bottom text-sm">
                                    <thead className="[&_tr]:border-b">
                                        <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                                                Key Prefix
                                            </th>
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                                                Owner
                                            </th>
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                                                Name
                                            </th>
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                                                Status
                                            </th>
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                                                Created
                                            </th>
                                            <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="[&_tr:last-child]:border-0">
                                        {apiKeys.map((key) => (
                                            <tr
                                                key={key.id}
                                                className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                                            >
                                                <td className="p-4 align-middle font-medium font-mono">
                                                    {key.keyPrefix}...
                                                </td>
                                                <td className="p-4 align-middle">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs text-muted-foreground">
                                                            {key.user?.id.substring(0, 8)}...
                                                        </span>
                                                        <span>{key.user?.email || "Unknown"}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4 align-middle">
                                                    {key.name || "Default Key"}
                                                </td>
                                                <td className="p-4 align-middle">
                                                    <Badge variant={key.isActive ? "success" : "secondary"}>
                                                        {key.isActive ? "Active" : "Revoked"}
                                                    </Badge>
                                                </td>
                                                <td className="p-4 align-middle">
                                                    {format(new Date(key.createdAt), "MMM d, yyyy")}
                                                </td>
                                                <td className="p-4 align-middle text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <span className="sr-only">Open menu</span>
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                className="text-red-600 focus:text-red-600 cursor-pointer"
                                                                onClick={() => setApiKeyToRevoke(key.id)}
                                                                disabled={!key.isActive}
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Revoke Key
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className="flex items-center justify-end space-x-2 py-4">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    Previous
                                </Button>
                                <div className="text-sm font-medium">
                                    Page {pagination?.page} of {pagination?.totalPages}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.min(pagination?.totalPages || 1, p + 1))}
                                    disabled={page >= (pagination?.totalPages || 1)}
                                >
                                    Next
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={!!apiKeyToRevoke} onOpenChange={(open) => !open && setApiKeyToRevoke(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently revoke this API key
                            and prevent any further requests using it.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700"
                            onClick={() => apiKeyToRevoke && revokeMutation.mutate(apiKeyToRevoke)}
                        >
                            Revoke Key
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
