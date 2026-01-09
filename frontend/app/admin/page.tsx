"use client";

import {
    LayoutDashboard,
    ArrowUpRight,
    Users,
    Key,
    History,
    Activity
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function AdminDashboardPage() {
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

            <div className="grid gap-4 md:grid-cols-3">
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
            </div>
        </div>
    );
}
