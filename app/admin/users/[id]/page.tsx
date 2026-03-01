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
    
    const suspendMutation = useMutation({
        mutationFn: async (suspend: boolean) => {
            return await adminApi.suspendUser(userId, { suspend });
        },
        onSuccess: (data) => {
            toast({
                title: "Success",
                description: data.data.message || "User suspension status updated.",
            });
            queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
        },
        onError: (err) => {
            toast({
                title: "Error",
                description: getErrorMessage(err),
                variant: "destructive",
            });
        }
    });

    const toggleFlagMutation = useMutation({
        mutationFn: async (data: { isMerchant?: boolean, isApiAccessApproved?: boolean, isOTCEnabled?: boolean }) => {
            return await adminApi.updateUserFlags(userId, data);
        },
        onSuccess: () => {
            toast({
                title: "Success",
                description: "User OTC status updated successfully.",
            });
            queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
        },
        onError: (err) => {
            toast({
                title: "Error",
                description: "Failed to update user flag: " + getErrorMessage(err),
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
                <Button variant="ghost" onClick={() => router.push("/admin/users")} className="gap-2">
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

    const user = userResponse as AdminUser;

    const handleFlagToggle = (field: "isMerchant" | "isApiAccessApproved" | "isOTCEnabled", checked: boolean) => {
        toggleFlagMutation.mutate({ [field]: checked });
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-10">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => router.push("/admin/users")}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">User Details</h1>
                    <p className="text-muted-foreground">View and manage detailed information for this user.</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Main Identity Card */}
                <Card className={`md:col-span-2 transition-opacity duration-300 ${user.suspended ? "opacity-50 grayscale-[0.5]" : ""}`}>
                    <CardHeader className="flex flex-row items-center justify-between pb-4">
                        <div className="space-y-1">
                            <CardTitle>Profile Information</CardTitle>
                            <CardDescription>Basic contact and identity details</CardDescription>
                        </div>
                        <Badge variant={user.role?.toLowerCase() === "admin" ? "default" : "secondary"} className="capitalize">
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
                <Card className="relative overflow-hidden">
                    {user.suspended && (
                        <div className="absolute inset-0 z-10 bg-background/20 backdrop-blur-[1px] pointer-events-none flex items-center justify-center">
                            <div className="bg-destructive/10 text-destructive text-xs font-bold px-3 py-1.5 rounded-full border border-destructive/20 shadow-sm backdrop-blur-md translate-y-[-2rem]">
                                ACCOUNT SUSPENDED
                            </div>
                        </div>
                    )}
                    <CardHeader>
                        <CardTitle>Permissions & Features</CardTitle>
                        <CardDescription>Manage user access flags</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Flag Toggles */}
                        <div className="space-y-4">
                            {/* Merchant Toggle */}
                            <div className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm bg-background">
                                <div className="space-y-0.5">
                                    <Label className="text-base font-semibold">Merchant Status</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Enable merchant capabilities for this user.
                                    </p>
                                </div>
                                <ToggleSwitch 
                                    checked={!!user.isMerchant} 
                                    onChange={(checked) => handleFlagToggle("isMerchant", checked)}
                                    disabled={toggleFlagMutation.isPending || user.suspended}
                                />
                            </div>

                            {/* API Access Toggle */}
                            <div className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm bg-background">
                                <div className="space-y-0.5">
                                    <Label className="text-base font-semibold">API Access</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Approve API access for this user's account.
                                    </p>
                                </div>
                                <ToggleSwitch 
                                    checked={!!user.isApiAccessApproved} 
                                    onChange={(checked) => handleFlagToggle("isApiAccessApproved", checked)}
                                    disabled={toggleFlagMutation.isPending || user.suspended}
                                />
                            </div>

                            {/* OTC Toggle */}
                            <div className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm bg-background">
                                <div className="space-y-0.5">
                                    <Label className="text-base font-semibold">OTC Enablement</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Allow OTC trading and send enablement email.
                                    </p>
                                </div>
                                <ToggleSwitch 
                                    checked={!!user.isOTCEnabled} 
                                    onChange={(checked) => handleFlagToggle("isOTCEnabled", checked)}
                                    disabled={toggleFlagMutation.isPending || user.suspended}
                                />
                            </div>
                        </div>

                        <div className="h-px bg-border my-6" />

                        <div className="space-y-4">
                            <h4 className="text-sm font-semibold text-destructive">Danger Zone</h4>
                            <Button 
                                variant={user.suspended ? "default" : "destructive"} 
                                className="w-full h-10 relative z-20"
                                onClick={() => suspendMutation.mutate(!user.suspended)}
                                disabled={suspendMutation.isPending}
                            >
                                {user.suspended ? "Unsuspend User" : "Suspend User"}
                            </Button>
                            <p className="text-[10px] text-muted-foreground text-center italic">
                                {user.suspended 
                                    ? (user.suspendedAt ? `Suspended on ${format(new Date(user.suspendedAt), "PPP p")}` : "User is currently suspended.")
                                    : "Suspending will revoke API keys and block platform access."}
                            </p>
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

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean, onChange: (checked: boolean) => void, disabled?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`
                peer inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full
                border-2 border-transparent transition-colors focus-visible:outline-none 
                focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 
                focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50
                ${checked ? 'bg-primary' : 'bg-muted'}
            `}
        >
            <span
                data-state={checked ? "checked" : "unchecked"}
                className={`
                    pointer-events-none block h-5 w-5 rounded-full bg-background 
                    shadow-lg ring-0 transition-transform
                    ${checked ? 'translate-x-5' : 'translate-x-0'}
                `}
            />
        </button>
    );
}
