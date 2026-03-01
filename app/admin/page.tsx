"use client";

import {
    LayoutDashboard,
    Users,
    Key,
    History,
    Activity,
    ArrowRight,
    BadgeCheck,
    Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useAdminOtcUsers } from "@/lib/hooks/use-admin-otc";
import { formatDate } from "@/lib/utils";

export default function AdminDashboardPage() {
    const { data: otcData, isLoading: isOtcLoading } = useAdminOtcUsers(1, 5);
    const recentOtcUsers = otcData?.users?.slice(0, 5) || [];
    const otcTotal = otcData?.pagination?.total ?? 0;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
                <p className="text-muted-foreground">
                    Welcome to the AutoRamp administration portal.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">System Status</CardTitle>
                        <Activity className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Operational</div>
                        <p className="text-xs text-muted-foreground">All systems go</p>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Nav */}
            <div className="grid gap-4 md:grid-cols-4">
                <Link href="/admin/users">
                    <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center gap-4">
                            <Users className="h-8 w-8 text-blue-500" />
                            <div>
                                <CardTitle>User Management</CardTitle>
                                <p className="text-sm text-muted-foreground">View and manage users</p>
                            </div>
                        </CardHeader>
                    </Card>
                </Link>
                <Link href="/admin/api-keys">
                    <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center gap-4">
                            <Key className="h-8 w-8 text-amber-500" />
                            <div>
                                <CardTitle>API Keys</CardTitle>
                                <p className="text-sm text-muted-foreground">Manage API access</p>
                            </div>
                        </CardHeader>
                    </Card>
                </Link>
                <Link href="/admin/transactions">
                    <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center gap-4">
                            <History className="h-8 w-8 text-secondary" />
                            <div>
                                <CardTitle>Transactions</CardTitle>
                                <p className="text-sm text-muted-foreground">Monitor platform volume</p>
                            </div>
                        </CardHeader>
                    </Card>
                </Link>
                <Link href="/admin/otc">
                    <Card className="hover:bg-muted/50 transition-colors cursor-pointer border-primary/30 bg-primary/5 hover:bg-primary/10">
                        <CardHeader className="flex flex-row items-center gap-4">
                            <BadgeCheck className="h-8 w-8 text-primary" />
                            <div>
                                <CardTitle>OTC Service</CardTitle>
                                <p className="text-sm text-muted-foreground">
                                    {isOtcLoading ? "Loading..." : `${otcTotal} OTC user${otcTotal !== 1 ? "s" : ""}`}
                                </p>
                            </div>
                        </CardHeader>
                    </Card>
                </Link>
            </div>

            {/* OTC Panel */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-lg">OTC Users</CardTitle>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Recently onboarded OTC traders
                        </p>
                    </div>
                    <Button asChild variant="ghost" size="sm" className="gap-1">
                        <Link href="/admin/otc">
                            View All <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </Button>
                </CardHeader>
                <CardContent>
                    {isOtcLoading ? (
                        <div className="flex items-center justify-center h-24">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : recentOtcUsers.length === 0 ? (
                        <div className="text-center py-8 opacity-50">
                            <BadgeCheck className="w-8 h-8 mx-auto mb-2" />
                            <p className="text-sm font-medium">No OTC users yet</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Enable OTC access for users via User Management.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {recentOtcUsers.map((user) => (
                                <Link
                                    key={user.id}
                                    href={`/admin/users/${user.id}`}
                                    className="flex items-center justify-between py-3 hover:bg-muted/40 px-2 rounded-lg transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                            <BadgeCheck className="w-4 h-4 text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">{user.email}</p>
                                            <p className="text-[10px] font-mono text-muted-foreground">
                                                {user.id.slice(0, 14)}…
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span
                                            className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
                                                user.suspended
                                                    ? "text-destructive bg-destructive/10"
                                                    : "text-green-600 bg-green-500/10"
                                            }`}
                                        >
                                            {user.suspended ? "Suspended" : "Active"}
                                        </span>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                            {formatDate(user.createdAt)}
                                        </p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
