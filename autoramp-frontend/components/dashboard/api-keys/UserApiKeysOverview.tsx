"use client";

import { useState } from "react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { userApi } from "@/lib/api";

type Period = "daily" | "weekly" | "monthly";

async function fetchUserAnalytics(period: Period) {
    const { data } = await userApi.getUserApiKeyAnalytics(period);
    return data;
}

export function UserApiKeysOverview() {
    const [period, setPeriod] = useState<Period>("daily");

    const { data: chartData, isLoading, isError } = useQuery({
        queryKey: ["user-api-keys-analytics", period],
        queryFn: () => fetchUserAnalytics(period),
    });

    if (isLoading) {
        return <Skeleton className="w-full h-[350px]" />;
    }

    if (isError) {
        return <div className="text-red-500">Failed to load analytics data</div>;
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle className="text-base font-semibold">API Usage History</CardTitle>
                <Select
                    value={period}
                    onValueChange={(value: Period) => setPeriod(value)}
                >
                    <SelectTrigger className="w-[120px] h-8 text-xs">
                        <SelectValue placeholder="Period" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent>
                {(!chartData || chartData.length === 0) ? (
                    <div className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">
                        No request data found for this period
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={250}>
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="date"
                                stroke="#888888"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#888888"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value}`}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', fontSize: '12px' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="requestCount"
                                name="Requests"
                                stroke="#2563eb"
                                fillOpacity={1}
                                fill="url(#colorRequests)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
