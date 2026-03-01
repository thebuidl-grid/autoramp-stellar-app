"use client";

import { useOtcStats, useOtcStatus } from "@/lib/hooks";
import { useAuthStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
    TrendingUp, 
    History, 
    Clock, 
    ArrowRightCircle, 
    Plus,
    UserCircle,
    Copy,
    ArrowUpRight
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

export default function OtcDashboardPage() {
    const { user } = useAuthStore();
    const { data: otcData, isLoading: isStatsLoading } = useOtcStats();
    const { toast } = useToast();

    const stats = otcData?.stats || { totalTrades: 0, totalVolume: 0, pendingTrades: 0 };
    const recentTransactions = otcData?.transactions?.slice(0, 5) || [];

    if (isStatsLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">OTC Dashboard</h1>
                    <p className="text-muted-foreground">
                        Welcome back, {user?.firstName || user?.email?.split('@')[0]}. Here's your trading overview.
                    </p>
                </div>
                <Button asChild className="shrink-0 gap-2">
                    <Link href="/otc/trade">
                        <Plus className="w-4 h-4" />
                        New Trade
                    </Link>
                </Button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {stats.totalVolume.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">USDC</span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Trades</CardTitle>
                        <History className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalTrades}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Trades</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-500">{stats.pendingTrades}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Transactions */}
                <Card className="lg:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between shrink-0">
                        <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
                        <Button asChild variant="ghost" size="sm">
                            <Link href="/otc/history">View All</Link>
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {recentTransactions.length === 0 ? (
                            <div className="text-center py-10 opacity-50">
                                <p>No transactions yet</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {recentTransactions.map((tx) => (
                                    <Link 
                                        key={tx.id} 
                                        href={`/otc/status/${tx.reference}`}
                                        className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors border border-transparent hover:border-border"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                                <TrendingUp className="w-5 h-5 text-primary" />
                                            </div>
                                            <div>
                                                <p className="font-semibold">
                                                    {tx.quantity} <span className="text-xs text-muted-foreground uppercase">{tx.token}</span>
                                                </p>
                                                <p className="text-[10px] font-mono text-muted-foreground">
                                                    {tx.reference.slice(0, 12)}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right hidden sm:block">
                                                <p className="text-xs font-medium">{formatDate(tx.createdAt)}</p>
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{tx.network}</p>
                                            </div>
                                            <StatusBadge status={tx.status} />
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Account Summary & Support */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg font-semibold">Verification</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500" />
                                <p className="text-sm font-medium">Fully Verified Account</p>
                            </div>
                            <div className="pt-4 border-t">
                                <Button asChild variant="outline" className="w-full justify-between">
                                    <Link href="/profile">
                                        View Profile
                                        <ArrowUpRight className="w-4 h-4 ml-2" />
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-primary/5 border-primary/20">
                        <CardContent className="pt-6 space-y-4">
                            <div className="space-y-2">
                                <h3 className="font-bold">Need Support?</h3>
                                <p className="text-sm text-muted-foreground">Contact our OTC desk for high-volume trade assistance.</p>
                            </div>
                            <Button asChild className="w-full font-bold">
                                <Link href="mailto:dev@thebuidlgrid.org">Contact Agents</Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

// Re-using common components for layout if needed
function Activity({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
    )
}
