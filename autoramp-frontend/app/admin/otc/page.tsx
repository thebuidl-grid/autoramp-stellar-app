"use client";

import { useAdminOtcUsers, useAdminOtcTransactions } from "@/lib/hooks/use-admin-otc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
    Users,
    ArrowUpRight,
    BadgeCheck,
    AlertCircle,
    Loader2,
    RefreshCw,
    ShieldOff,
    History,
    CheckCircle2,
    Clock,
    XCircle
} from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { useState } from "react";
import { adminApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

export default function AdminOtcPage() {
    const [usersPage, setUsersPage] = useState(1);
    const [txPage, setTxPage] = useState(1);
    const [activeTab, setActiveTab] = useState("transactions");
    
    const { 
        data: usersData, 
        isLoading: isUsersLoading, 
        refetch: refetchUsers, 
        isFetching: isUsersFetching 
    } = useAdminOtcUsers(usersPage, 20);

    const {
        data: txData,
        isLoading: isTxLoading,
        refetch: refetchTx,
        isFetching: isTxFetching
    } = useAdminOtcTransactions(txPage, 20);

    const queryClient = useQueryClient();
    
    // Users Data
    const users = usersData?.users || [];
    const usersPagination = usersData?.pagination;
    const usersTotalPages = usersPagination?.totalPages || 1;

    // Transactions Data
    const transactions = txData?.transactions || [];
    const txPagination = txData?.pagination;
    const txTotalPages = txPagination?.totalPages || 1;

    const handleToggleOtc = async (userId: string, currentValue: boolean) => {
        try {
            await adminApi.updateUserFlags(userId, { isOTCEnabled: !currentValue });
            queryClient.invalidateQueries({ queryKey: ["admin-otc-users"] });
        } catch (e) {
            console.error("Failed to update OTC flag", e);
        }
    };

    const handleRefresh = () => {
        if (activeTab === "users") {
            refetchUsers();
        } else {
            refetchTx();
        }
    };

    const isRefreshing = activeTab === "users" ? isUsersFetching : isTxFetching;

    const getStatusBadge = (status: string) => {
        switch (status?.toUpperCase()) {
            case "COMPLETED":
                return (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 flex items-center gap-1 w-fit">
                        <CheckCircle2 className="h-3 w-3" /> Completed
                    </Badge>
                );
            case "PENDING":
                return (
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 flex items-center gap-1 w-fit">
                        <Clock className="h-3 w-3" /> Pending
                    </Badge>
                );
            case "PROCESSING":
                return (
                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 flex items-center gap-1 w-fit">
                        <RefreshCw className="h-3 w-3 animate-spin" /> Processing
                    </Badge>
                );
            case "FAILED":
                return (
                    <Badge className="bg-red-100 text-red-700 hover:bg-red-100 flex items-center gap-1 w-fit">
                        <XCircle className="h-3 w-3" /> Failed
                    </Badge>
                );
            default:
                return (
                    <Badge variant="outline" className="flex items-center gap-1 w-fit">
                        {status || "UNKNOWN"}
                    </Badge>
                );
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">OTC Service</h1>
                    <p className="text-muted-foreground">
                        Manage OTC users and monitor OTC transactions.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="gap-2"
                >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="mb-4">
                    <TabsTrigger value="transactions">Transactions</TabsTrigger>
                    <TabsTrigger value="users">OTC Users</TabsTrigger>
                </TabsList>

                {/* TRANSACTIONS TAB */}
                <TabsContent value="transactions">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">OTC Transactions</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {isTxLoading ? (
                                <div className="flex items-center justify-center h-32">
                                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : transactions.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-2 text-center opacity-60">
                                    <History className="w-10 h-10" />
                                    <p className="font-medium">No OTC transactions yet</p>
                                </div>
                            ) : (
                                <>
                                    <div className="divide-y divide-border rounded-lg border overflow-hidden">
                                        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-2 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                            <span>Date</span>
                                            <span>Reference / User</span>
                                            <span className="justify-self-center">Status</span>
                                            <span className="justify-self-end">Action</span>
                                        </div>

                                        {transactions.map((tx) => (
                                            <div
                                                key={tx.id}
                                                className="grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center px-4 py-3 hover:bg-muted/30 transition-colors"
                                            >
                                                <div className="text-xs text-muted-foreground whitespace-nowrap min-w-[100px]">
                                                    {format(new Date(tx.createdAt), "MMM d, HH:mm")}
                                                </div>

                                                <div className="min-w-0">
                                                    <p className="font-medium font-mono text-sm">{tx.reference}</p>
                                                    <p className="text-xs text-muted-foreground truncate">
                                                        {tx.userEmail || "Unknown User"}
                                                    </p>
                                                </div>

                                                <div className="justify-self-center">
                                                    {getStatusBadge(tx.status)}
                                                </div>

                                                <div className="justify-self-end">
                                                    <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs gap-1">
                                                        <Link href={`/admin/otc/transactions/${tx.reference}`}>
                                                            Manage <ArrowUpRight className="w-3 h-3" />
                                                        </Link>
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {txTotalPages > 1 && (
                                        <div className="flex items-center justify-between mt-4 pt-4 border-t">
                                            <p className="text-sm text-muted-foreground">
                                                Page {txPage} of {txTotalPages}
                                            </p>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={txPage <= 1 || isTxFetching}
                                                    onClick={() => setTxPage((p) => p - 1)}
                                                >
                                                    Previous
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={txPage >= txTotalPages || isTxFetching}
                                                    onClick={() => setTxPage((p) => p + 1)}
                                                >
                                                    Next
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* USERS TAB */}
                <TabsContent value="users">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">OTC-Enabled Accounts</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {isUsersLoading ? (
                                <div className="flex items-center justify-center h-32">
                                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : users.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-2 text-center opacity-60">
                                    <Users className="w-10 h-10" />
                                    <p className="font-medium">No OTC users yet</p>
                                    <p className="text-sm text-muted-foreground">
                                        Enable OTC access for users via the User Management page.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="divide-y divide-border rounded-lg border overflow-hidden">
                                        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                            <span>User</span>
                                            <span className="justify-self-center">Status</span>
                                            <span className="justify-self-center">Joined</span>
                                            <span className="justify-self-end">Actions</span>
                                        </div>

                                        {users.map((user) => (
                                            <div
                                                key={user.id}
                                                className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-4 py-3 hover:bg-muted/30 transition-colors"
                                            >
                                                <div className="min-w-0">
                                                    <p className="font-medium truncate text-sm">{user.email}</p>
                                                    <p className="text-[10px] font-mono text-muted-foreground truncate">
                                                        {user.id.slice(0, 16)}…
                                                    </p>
                                                </div>

                                                <div className="justify-self-center">
                                                    {user.suspended ? (
                                                        <span className="flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
                                                            <ShieldOff className="w-3 h-3" /> Suspended
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full">
                                                            <BadgeCheck className="w-3 h-3" /> Active
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="justify-self-center text-xs text-muted-foreground whitespace-nowrap">
                                                    {formatDate(user.createdAt)}
                                                </div>

                                                <div className="justify-self-end flex items-center gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => handleToggleOtc(user.id, true)}
                                                        title="Revoke OTC access"
                                                    >
                                                        Revoke
                                                    </Button>
                                                    <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs gap-1">
                                                        <Link href={`/admin/users/${user.id}`}>
                                                            View <ArrowUpRight className="w-3 h-3" />
                                                        </Link>
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {usersTotalPages > 1 && (
                                        <div className="flex items-center justify-between mt-4 pt-4 border-t">
                                            <p className="text-sm text-muted-foreground">
                                                Page {usersPage} of {usersTotalPages}
                                            </p>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={usersPage <= 1 || isUsersFetching}
                                                    onClick={() => setUsersPage((p) => p - 1)}
                                                >
                                                    Previous
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={usersPage >= usersTotalPages || isUsersFetching}
                                                    onClick={() => setUsersPage((p) => p + 1)}
                                                >
                                                    Next
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
