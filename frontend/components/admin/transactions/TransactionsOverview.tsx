"use client";

import { useState } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { Loader2 } from "lucide-react";

export function TransactionsOverview() {
    const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");

    const { data, isLoading } = useQuery({
        queryKey: ["admin-transactions-analytics", period],
        queryFn: async () => {
            const { data } = await adminApi.getTransactionsAnalytics(period);
            return data;
        },
    });

    return (
        <Card className="col-span-4">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Transactions Volume</CardTitle>
                <Select
                    value={period}
                    onValueChange={(value: any) => setPeriod(value)}
                >
                    <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    {isLoading ? (
                        <div className="flex h-full w-full items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : data && data.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
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
                                    contentStyle={{
                                        backgroundColor: "hsl(var(--background))",
                                        borderColor: "hsl(var(--border))",
                                        borderRadius: "8px",
                                    }}
                                    itemStyle={{ fontSize: "12px" }}
                                />
                                <Legend />
                                <Bar
                                    dataKey="onrampCount"
                                    name="Onramp"
                                    fill="#3b82f6"
                                    radius={[4, 4, 0, 0]}
                                    stackId="a"
                                />
                                <Bar
                                    dataKey="offrampCount"
                                    name="Offramp"
                                    fill="#a855f7"
                                    radius={[4, 4, 0, 0]}
                                    stackId="a"
                                />
                                <Bar
                                    dataKey="swapCount"
                                    name="Swap"
                                    fill="#6366f1"
                                    radius={[4, 4, 0, 0]}
                                    stackId="a"
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            No transaction data for this period
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
