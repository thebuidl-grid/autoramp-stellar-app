"use client";

import { useState } from "react";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
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
import { adminApi } from "@/lib/api";

type Period = "daily" | "weekly" | "monthly";

async function fetchAnalytics(period: Period) {
    const { data } = await adminApi.getApiKeysAnalytics(period);
    return data;
}

export function ApiKeysOverview() {
    const [period, setPeriod] = useState<Period>("daily");

    const { data: chartData, isLoading, isError } = useQuery({
        queryKey: ["admin-api-keys-analytics", period],
        queryFn: () => fetchAnalytics(period),
    });

    if (isLoading) {
        return <Skeleton className="w-full h-[400px]" />;
    }

    if (isError) {
        return <div className="text-red-500">Failed to load API keys analytics data</div>;
    }

    return (
        <Card className="col-span-4">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>API Usage Overview</CardTitle>
                <Select
                    value={period}
                    onValueChange={(value: Period) => setPeriod(value)}
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent className="pl-2">
                {(!chartData || chartData.length === 0) ? (
                    <div className="flex h-[350px] items-center justify-center text-muted-foreground">
                        No data available for this period
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={chartData}>
                            <XAxis
                                dataKey="date"
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value}`}
                            />
                            <Tooltip
                                labelFormatter={(label) => `Date: ${label}`}
                            />
                            <Legend />
                            <Bar dataKey="requestCount" name="Total Requests" fill="#adfa1d" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="uniqueKeys" name="Unique Keys Used" fill="#2563eb" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
