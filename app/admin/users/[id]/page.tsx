"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
    ArrowLeft, 
    User as UserIcon, 
    Mail, 
    Phone, 
    Wallet, 
    Calendar, 
    ShieldAlert, 
    CheckCircle2, 
    XCircle 
} from "lucide-react";
import { format } from "date-fns";

import { adminApi, AdminUser } from "@/lib/api";
import { getErrorMessage } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

export default function UserDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    
    const userId = params.id as string;

    const { data: userResponse, isLoading, error } = useQuery({
        queryKey: ["admin-user", userId],
        queryFn: async () => {
            const { data } = await adminApi.getUserById(userId);
            return data;
        },
        enabled: !!userId,
    });

    // Mock internal state for the toggle if the API endpoint isn't fully ready
    // We try to use the the fetched state first (if it exists on the model)
    // The user schema might have isOtcEnabled, or we manage it locally if it fails
    
    const toggleOtcMutation = useMutation({
        mutationFn: async (isOtcEnabled: boolean) => {
            return await adminApi.toggleUserOtc(userId, { isOtcEnabled });
        },
        onSuccess: () => {
            toast({
                title: "Success",
                description: "User OTC status updated successfully.",
            });
            queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
        },
        onError: (err) => {
            // Also handle possibility of missing endpoint gracefully
            toast({
                title: "Warning",
                description: "API might not support OTC toggle yet: " + getErrorMessage(err),
                variant: "destructive",
            });
        }
    });

    if (isLoading) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <p className="text-muted-foreground animate-pulse">Loading user details...</p>
            </div>
        );
    }

    if (error || !userResponse) {
        return (
            <div className="space-y-4">
                <Button variant="ghost" onClick={() => router.back()} className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Users
                </Button>
                <Card>
                    <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                        <ShieldAlert className="h-12 w-12 text-destructive mb-4" />
                        <h2 className="text-xl font-semibold mb-2">User Not Found</h2>
                        <p className="text-muted-foreground mb-6">The user you are looking for does not exist or an error occurred.</p>
                        <Button onClick={() => router.push("/admin/users")}>Return to Users List</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const user = userResponse as AdminUser & { isOtcEnabled?: boolean };
    const isOtcEnabled = user.isOtcEnabled ?? false; // Default to false if not provided by backend

    const handleOtcToggle = (checked: boolean) => {
        toggleOtcMutation.mutate(checked);
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-10">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">User Details</h1>
                    <p className="text-muted-foreground">View and manage detailed information for this user.</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Main Identity Card */}
                <Card className="md:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between pb-4">
                        <div className="space-y-1">
                            <CardTitle>Profile Information</CardTitle>
                            <CardDescription>Basic contact and identity details</CardDescription>
                        </div>
                        <Badge variant={user.role === "admin" ? "default" : "secondary"} className="capitalize">
                            {user.role}
                        </Badge>
                    </CardHeader>
                    <CardContent className="grid sm:grid-cols-2 gap-6">
                        <div className="space-y-1">
                            <div className="flex items-center text-sm text-muted-foreground mb-1">
                                <UserIcon className="mr-2 h-4 w-4" />
                                User ID
                            </div>
                            <p className="font-mono text-sm break-all">{user.id}</p>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center text-sm text-muted-foreground mb-1">
                                <Mail className="mr-2 h-4 w-4" />
                                Email Address
                            </div>
                            <p className="text-sm font-medium">{user.email}</p>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center text-sm text-muted-foreground mb-1">
                                <Phone className="mr-2 h-4 w-4" />
                                Phone Number
                            </div>
                            <p className="text-sm font-medium">{user.phoneNumber || "Not provided"}</p>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center text-sm text-muted-foreground mb-1">
                                <Calendar className="mr-2 h-4 w-4" />
                                Joined Date
                            </div>
                            <p className="text-sm font-medium">
                                {user.createdAt ? format(new Date(user.createdAt), "PPP") : "Unknown"}
                            </p>
                        </div>

                        <div className="sm:col-span-2 space-y-1 pt-4 border-t">
                            <div className="flex items-center text-sm text-muted-foreground mb-1">
                                <Wallet className="mr-2 h-4 w-4" />
                                Default Wallet Address
                            </div>
                            <p className="font-mono text-sm break-all bg-muted p-3 rounded-md">
                                {user.walletAddress || "No default wallet linked"}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Settings & Flags */}
                <Card>
                    <CardHeader>
                        <CardTitle>Permissions & Features</CardTitle>
                        <CardDescription>Manage user access flags</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* OTC Toggle */}
                        <div className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm bg-background">
                            <div className="space-y-0.5">
                                <Label className="text-base font-semibold">Manual OTC</Label>
                                <p className="text-xs text-muted-foreground">
                                    Allow this user to access manual OTC trading features.
                                </p>
                            </div>
                            <input 
                                type="checkbox"
                                checked={isOtcEnabled} 
                                onChange={(e) => handleOtcToggle(e.target.checked)}
                                disabled={toggleOtcMutation.isPending}
                                className="h-6 w-11 rounded-full bg-white/10 checked:bg-primary transition-colors appearance-none cursor-pointer relative after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:h-4 after:w-4 after:rounded-full after:transition-all checked:after:translate-x-5"
                            />
                        </div>

                        <div className="h-px bg-white/10 my-6" />

                        <div className="space-y-4">
                            <h4 className="text-sm font-semibold">Other Status Flags</h4>
                            
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Is Merchant</span>
                                {user.isMerchant ? (
                                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50"><CheckCircle2 className="mr-1 h-3 w-3" /> Yes</Badge>
                                ) : (
                                    <Badge variant="outline" className="text-muted-foreground"><XCircle className="mr-1 h-3 w-3" /> No</Badge>
                                )}
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">API Access Approved</span>
                                {user.isApiAccessApproved ? (
                                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50"><CheckCircle2 className="mr-1 h-3 w-3" /> Yes</Badge>
                                ) : (
                                    <Badge variant="outline" className="text-muted-foreground"><XCircle className="mr-1 h-3 w-3" /> No</Badge>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Transaction Summary (Optional) */}
                <Card className="md:col-span-3">
                    <CardHeader>
                        <CardTitle>Transaction Overview</CardTitle>
                        <CardDescription>Activity summary for this user</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-4 rounded-lg bg-muted/50 border">
                                <p className="text-sm text-muted-foreground mb-1">On-ramp Txns</p>
                                <p className="text-2xl font-bold">{user._count?.onrampTransactions || 0}</p>
                            </div>
                            <div className="p-4 rounded-lg bg-muted/50 border">
                                <p className="text-sm text-muted-foreground mb-1">Off-ramp Txns</p>
                                <p className="text-2xl font-bold">{user._count?.offrampTransactions || 0}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

            </div>
        </div>
    );
}
