"use client";

import { useQuery } from "@tanstack/react-query";
import {
    ArrowDownLeft,
    ArrowUpRight,
    ArrowRightLeft,
    DollarSign,
    Activity
} from "lucide-react";
import { adminApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminDashboard() {
    const { data: summary, isLoading, error } = useQuery({
        queryKey: ["adminTransactionSummary"],
        queryFn: () => adminApi.getAdminTransactionSummary(),
    });

    if (isLoading) {
        return (
            <div className="grid gap-4 md:grid-cols-3">
                {[1, 2, 3].map((i) => (
                    <Card key={i}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                <Skeleton className="h-4 w-[100px]" />
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-8 w-[60px] mb-2" />
                            <Skeleton className="h-4 w-[140px]" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 rounded-lg bg-red-50 text-red-600 dark:bg-red-900/10 dark:text-red-400">
                Error loading dashboard data. Please try again.
            </div>
        );
    }

    const stats = [
        {
            title: "Total On-Ramps",
            value: summary?.data.onRamps.count || 0,
            amount: summary?.data.onRamps.totalAmount || 0,
            icon: ArrowDownLeft,
            color: "text-green-600",
        },
        {
            title: "Total Off-Ramps",
            value: summary?.data.offRamps.count || 0,
            amount: summary?.data.offRamps.totalAmount || 0,
            icon: ArrowUpRight,
            color: "text-red-600",
        },
        {
            title: "Total Swaps",
            value: summary?.data.swaps.count || 0,
            amount: summary?.data.swaps.totalAmount || 0,
            icon: ArrowRightLeft,
            color: "text-blue-600",
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                <p className="text-muted-foreground">
                    Overview of platform activity and performance.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                {stats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={stat.title}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">
                                    {stat.title}
                                </CardTitle>
                                <Icon className={`h-4 w-4 ${stat.color}`} />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stat.value}</div>
                                <p className="text-xs text-muted-foreground">
                                    Total Volume:
                                    <span className="font-medium ml-1">
                                        {new Intl.NumberFormat('en-NG', {
                                            style: 'currency',
                                            currency: 'NGN'
                                        }).format(stat.amount)}
                                    </span>
                                </p>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Placeholder for Recent Activity Chart or List */}
            <Card className="col-span-3">
                <CardHeader>
                    <CardTitle>Platform Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <Activity className="h-4 w-4" />
                        <span>System operational. All services running normally.</span>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
