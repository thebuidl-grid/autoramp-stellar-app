"use client";

import { useState, useMemo } from "react";
import {
    BarChart,
    Bar,
    AreaChart,
    Area,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
    Users,
    TrendingUp,
    TrendingDown,
    DollarSign,
    Activity,
    ArrowUpRight,
    ArrowDownRight,
    BarChart3,
    UserMinus,
    UserCheck,
    Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Mock Data ────────────────────────────────────────────────────────────────

const COHORTS = [
    { id: "jan-2026", label: "Jan 2026", totalUsers: 1248 },
    { id: "feb-2026", label: "Feb 2026", totalUsers: 1856 },
    { id: "mar-2026", label: "Mar 2026", totalUsers: 2340 },
    { id: "apr-2026", label: "Apr 2026", totalUsers: 2890 },
    { id: "may-2026", label: "May 2026", totalUsers: 3215 },
    { id: "jun-2026", label: "Jun 2026", totalUsers: 3780 },
];

const RETENTION_MATRIX = [
    { cohort: "Jan 2026", users: 1248, month0: 100, month1: 95.2, month2: 86.4, month3: 78.1, month4: 71.3, month5: 64.8 },
    { cohort: "Feb 2026", users: 1856, month0: 100, month1: 97.1, month2: 89.2, month3: 81.7, month4: 74.2, month5: null },
    { cohort: "Mar 2026", users: 2340, month0: 100, month1: 93.8, month2: 84.1, month3: 75.6, month4: null, month5: null },
    { cohort: "Apr 2026", users: 2890, month0: 100, month1: 96.4, month2: 87.9, month3: null, month4: null, month5: null },
    { cohort: "May 2026", users: 3215, month0: 100, month1: 91.6, month2: null, month3: null, month4: null, month5: null },
    { cohort: "Jun 2026", users: 3780, month0: 100, month1: null, month2: null, month3: null, month4: null, month5: null },
];

const CHURN_DATA = [
    { cohort: "Jan 2026", churnRate: 4.80, retained: 95.20 },
    { cohort: "Feb 2026", churnRate: 2.90, retained: 97.10 },
    { cohort: "Mar 2026", churnRate: 6.20, retained: 93.80 },
    { cohort: "Apr 2026", churnRate: 3.60, retained: 96.40 },
    { cohort: "May 2026", churnRate: 8.40, retained: 91.60 },
    { cohort: "Jun 2026", churnRate: 5.10, retained: 94.90 },
];

const DAILY_ACTIVE_USERS = [
    { date: "Jun 1", dau: 4120, newUsers: 187, returning: 3933 },
    { date: "Jun 2", dau: 4285, newUsers: 203, returning: 4082 },
    { date: "Jun 3", dau: 3980, newUsers: 165, returning: 3815 },
    { date: "Jun 4", dau: 4350, newUsers: 221, returning: 4129 },
    { date: "Jun 5", dau: 4510, newUsers: 245, returning: 4265 },
    { date: "Jun 6", dau: 4680, newUsers: 267, returning: 4413 },
    { date: "Jun 7", dau: 4890, newUsers: 289, returning: 4601 },
    { date: "Jun 8", dau: 5020, newUsers: 312, returning: 4708 },
    { date: "Jun 9", dau: 5180, newUsers: 334, returning: 4846 },
    { date: "Jun 10", dau: 5340, newUsers: 356, returning: 4984 },
    { date: "Jun 11", dau: 5490, newUsers: 378, returning: 5112 },
    { date: "Jun 12", dau: 5620, newUsers: 395, returning: 5225 },
    { date: "Jun 13", dau: 5780, newUsers: 412, returning: 5368 },
    { date: "Jun 14", dau: 5930, newUsers: 428, returning: 5502 },
    { date: "Jun 15", dau: 6100, newUsers: 447, returning: 5653 },
    { date: "Jun 16", dau: 6280, newUsers: 468, returning: 5812 },
    { date: "Jun 17", dau: 6420, newUsers: 485, returning: 5935 },
    { date: "Jun 18", dau: 6590, newUsers: 502, returning: 6088 },
    { date: "Jun 19", dau: 6750, newUsers: 521, returning: 6229 },
    { date: "Jun 20", dau: 6920, newUsers: 538, returning: 6382 },
    { date: "Jun 21", dau: 7080, newUsers: 556, returning: 6524 },
    { date: "Jun 22", dau: 7250, newUsers: 575, returning: 6675 },
    { date: "Jun 23", dau: 7410, newUsers: 593, returning: 6817 },
    { date: "Jun 24", dau: 7580, newUsers: 612, returning: 6968 },
    { date: "Jun 25", dau: 7740, newUsers: 628, returning: 7112 },
    { date: "Jun 26", dau: 7920, newUsers: 647, returning: 7273 },
    { date: "Jun 27", dau: 8080, newUsers: 665, returning: 7415 },
    { date: "Jun 28", dau: 8250, newUsers: 683, returning: 7567 },
    { date: "Jun 29", dau: 8420, newUsers: 701, returning: 7719 },
    { date: "Jun 30", dau: 8600, newUsers: 720, returning: 7880 },
];

const WEEKLY_ACTIVE_USERS = [
    { week: "W1 Jun", wau: 28940, newUsers: 1322, returning: 27618 },
    { week: "W2 Jun", wau: 35610, newUsers: 2268, returning: 33342 },
    { week: "W3 Jun", wau: 44230, newUsers: 3402, returning: 40828 },
    { week: "W4 Jun", wau: 54990, newUsers: 4542, returning: 50448 },
];

const MONTHLY_ACTIVE_USERS = [
    { month: "Jan", mau: 12480, newUsers: 1248, returning: 11232 },
    { month: "Feb", mau: 18560, newUsers: 1856, returning: 16704 },
    { month: "Mar", mau: 23400, newUsers: 2340, returning: 21060 },
    { month: "Apr", mau: 28900, newUsers: 2890, returning: 26010 },
    { month: "May", mau: 32150, newUsers: 3215, returning: 28935 },
    { month: "Jun", mau: 37800, newUsers: 3780, returning: 34020 },
];

const REVENUE_DATA = [
    { month: "Jan", revenue: 37500000, transactions: 184200, volume: 2500000000, avgPerTx: 203.58 },
    { month: "Feb", revenue: 42000000, transactions: 243100, volume: 2800000000, avgPerTx: 172.77 },
    { month: "Mar", revenue: 48750000, transactions: 312800, volume: 3250000000, avgPerTx: 155.85 },
    { month: "Apr", revenue: 56250000, transactions: 389400, volume: 3750000000, avgPerTx: 144.46 },
    { month: "May", revenue: 63000000, transactions: 446200, volume: 4200000000, avgPerTx: 141.19 },
    { month: "Jun", revenue: 72000000, transactions: 553400, volume: 4800000000, avgPerTx: 130.10 },
];

const DAILY_REVENUE = [
    { date: "Jun 1", revenue: 1850000, transactions: 14180 },
    { date: "Jun 2", revenue: 1980000, transactions: 15200 },
    { date: "Jun 3", revenue: 1750000, transactions: 13480 },
    { date: "Jun 4", revenue: 2120000, transactions: 16340 },
    { date: "Jun 5", revenue: 2280000, transactions: 17570 },
    { date: "Jun 6", revenue: 2450000, transactions: 18880 },
    { date: "Jun 7", revenue: 2620000, transactions: 20190 },
    { date: "Jun 8", revenue: 2180000, transactions: 16800 },
    { date: "Jun 9", revenue: 2350000, transactions: 18110 },
    { date: "Jun 10", revenue: 2520000, transactions: 19420 },
    { date: "Jun 11", revenue: 2680000, transactions: 20650 },
    { date: "Jun 12", revenue: 2450000, transactions: 18880 },
    { date: "Jun 13", revenue: 2620000, transactions: 20190 },
    { date: "Jun 14", revenue: 2780000, transactions: 21420 },
    { date: "Jun 15", revenue: 2250000, transactions: 17340 },
    { date: "Jun 16", revenue: 2420000, transactions: 18650 },
    { date: "Jun 17", revenue: 2580000, transactions: 19880 },
    { date: "Jun 18", revenue: 2750000, transactions: 21190 },
    { date: "Jun 19", revenue: 2480000, transactions: 19110 },
    { date: "Jun 20", revenue: 2650000, transactions: 20420 },
    { date: "Jun 21", revenue: 2820000, transactions: 21730 },
    { date: "Jun 22", revenue: 2380000, transactions: 18340 },
    { date: "Jun 23", revenue: 2550000, transactions: 19650 },
    { date: "Jun 24", revenue: 2720000, transactions: 20960 },
    { date: "Jun 25", revenue: 2880000, transactions: 22190 },
    { date: "Jun 26", revenue: 2650000, transactions: 20420 },
    { date: "Jun 27", revenue: 2820000, transactions: 21730 },
    { date: "Jun 28", revenue: 2980000, transactions: 22960 },
    { date: "Jun 29", revenue: 2750000, transactions: 21190 },
    { date: "Jun 30", revenue: 2920000, transactions: 22490 },
];

const REVENUE_BY_TYPE = [
    { type: "Onramp", revenue: 121090000, percentage: 37.9, color: "#3b82f6" },
    { type: "Offramp", revenue: 79880000, percentage: 25.0, color: "#a855f7" },
    { type: "Swap", revenue: 60070000, percentage: 18.8, color: "#00f9c7" },
    { type: "Bank Transfer", revenue: 33550000, percentage: 10.5, color: "#f97316" },
    { type: "OTC", revenue: 15980000, percentage: 5.0, color: "#eab308" },
    { type: "VAS", revenue: 8630000, percentage: 2.7, color: "#06b6d4" },
];

const COHORT_REVENUE = [
    { cohort: "Jan 2026", totalRevenue: 37500000, avgPerUser: 3004.81, totalTx: 184200 },
    { cohort: "Feb 2026", totalRevenue: 42000000, avgPerUser: 2262.93, totalTx: 243100 },
    { cohort: "Mar 2026", totalRevenue: 48750000, avgPerUser: 2083.33, totalTx: 312800 },
    { cohort: "Apr 2026", totalRevenue: 56250000, avgPerUser: 1946.37, totalTx: 389400 },
    { cohort: "May 2026", totalRevenue: 63000000, avgPerUser: 1959.56, totalTx: 446200 },
    { cohort: "Jun 2026", totalRevenue: 72000000, avgPerUser: 1904.76, totalTx: 553400 },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatNGN(value: number): string {
    if (value >= 1_000_000_000) return `₦${(value / 1_000_000_000).toFixed(1)}B`;
    if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `₦${(value / 1_000).toFixed(0)}K`;
    return `₦${value.toLocaleString()}`;
}

function formatNumber(value: number): string {
    return value.toLocaleString();
}

function getRetentionColor(value: number | null): string {
    if (value === null) return "bg-transparent";
    if (value >= 90) return "bg-green-500/20 text-green-400";
    if (value >= 80) return "bg-green-500/15 text-green-400/80";
    if (value >= 70) return "bg-yellow-500/15 text-yellow-400/80";
    if (value >= 60) return "bg-orange-500/15 text-orange-400/80";
    return "bg-red-500/15 text-red-400/80";
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
    title,
    value,
    change,
    changeLabel,
    icon: Icon,
    iconColor,
}: {
    title: string;
    value: string;
    change?: number;
    changeLabel?: string;
    icon: React.ElementType;
    iconColor?: string;
}) {
    const isPositive = change && change > 0;
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className={cn("h-4 w-4", iconColor || "text-muted-foreground")} />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                {change !== undefined && (
                    <div className="flex items-center gap-1 mt-1">
                        {isPositive ? (
                            <ArrowUpRight className="h-3 w-3 text-green-500" />
                        ) : (
                            <ArrowDownRight className="h-3 w-3 text-red-500" />
                        )}
                        <span className={cn("text-xs font-medium", isPositive ? "text-green-500" : "text-red-500")}>
                            {Math.abs(change).toFixed(1)}%
                        </span>
                        {changeLabel && (
                            <span className="text-xs text-muted-foreground">{changeLabel}</span>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function CohortAnalytics() {
    const [revenuePeriod, setRevenuePeriod] = useState<"daily" | "monthly">("daily");
    const [activeUsersPeriod, setActiveUsersPeriod] = useState<"daily" | "weekly" | "monthly">("daily");

    const summaryStats = useMemo(() => {
        const totalUsers = COHORTS.reduce((sum, c) => sum + c.totalUsers, 0);
        const totalRevenue = REVENUE_DATA.reduce((sum, r) => sum + r.revenue, 0);
        const totalTransactions = REVENUE_DATA.reduce((sum, r) => sum + r.transactions, 0);
        const totalVolume = REVENUE_DATA.reduce((sum, r) => sum + r.volume, 0);
        const validRows = RETENTION_MATRIX.filter((r): r is typeof r & { month1: number } => r.month1 !== null);
        const avgRetention = validRows.reduce((sum, r) => sum + r.month1, 0) / validRows.length;
        const avgChurn = CHURN_DATA.reduce((sum, c) => sum + c.churnRate, 0) / CHURN_DATA.length;
        const currentDau = DAILY_ACTIVE_USERS[DAILY_ACTIVE_USERS.length - 1].dau;
        const prevDau = DAILY_ACTIVE_USERS[DAILY_ACTIVE_USERS.length - 2].dau;
        const dauChange = ((currentDau - prevDau) / prevDau) * 100;

        return {
            totalUsers,
            totalRevenue,
            totalTransactions,
            totalVolume,
            avgRetention: avgRetention.toFixed(1),
            avgChurn: avgChurn.toFixed(2),
            currentDau,
            dauChange,
        };
    }, []);

    return (
        <div className="space-y-8">
            {/* Page Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Cohort Analytics</h1>
                <p className="text-muted-foreground">
                    User retention, churn, revenue, and engagement metrics by cohort.
                </p>
            </div>

            {/* Summary Stats */}
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
                <StatCard
                    title="Total Users"
                    value={formatNumber(summaryStats.totalUsers)}
                    change={22.4}
                    changeLabel="vs last quarter"
                    icon={Users}
                    iconColor="text-blue-500"
                />
                <StatCard
                    title="Transaction Volume"
                    value={formatNGN(summaryStats.totalVolume)}
                    change={42.8}
                    changeLabel="vs last quarter"
                    icon={Activity}
                    iconColor="text-secondary"
                />
                <StatCard
                    title="Total Revenue"
                    value={formatNGN(summaryStats.totalRevenue)}
                    change={38.2}
                    changeLabel="vs last quarter"
                    icon={DollarSign}
                    iconColor="text-green-500"
                />
                <StatCard
                    title="Total Transactions"
                    value={formatNumber(summaryStats.totalTransactions)}
                    change={31.7}
                    changeLabel="vs last quarter"
                    icon={BarChart3}
                    iconColor="text-purple-500"
                />
                <StatCard
                    title="Avg Retention (M1)"
                    value={`${summaryStats.avgRetention}%`}
                    change={5.8}
                    changeLabel="vs last quarter"
                    icon={UserCheck}
                    iconColor="text-secondary"
                />
            </div>

            {/* Daily Active Users Chart */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-lg">Active Users</CardTitle>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            New vs returning active users over time
                        </p>
                    </div>
                    <Select value={activeUsersPeriod} onValueChange={(v: any) => setActiveUsersPeriod(v)}>
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
                    <div className="h-[300px] w-full">
                        {activeUsersPeriod === "daily" && (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={DAILY_ACTIVE_USERS}>
                                    <defs>
                                        <linearGradient id="colorDAU" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#00f9c7" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#00f9c7" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="date" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} interval={4} />
                                    <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : `${v}`} />
                                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                                    <Legend />
                                    <Area type="monotone" dataKey="returning" name="Returning Users" stroke="#00f9c7" fillOpacity={1} fill="url(#colorDAU)" />
                                    <Area type="monotone" dataKey="newUsers" name="New Users" stroke="#3b82f6" fillOpacity={1} fill="url(#colorNew)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                        {activeUsersPeriod === "weekly" && (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={WEEKLY_ACTIVE_USERS}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="week" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : `${v}`} />
                                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                                    <Legend />
                                    <Bar dataKey="returning" name="Returning Users" fill="#00f9c7" radius={[0, 0, 0, 0]} stackId="a" />
                                    <Bar dataKey="newUsers" name="New Users" fill="#3b82f6" radius={[4, 4, 0, 0]} stackId="a" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                        {activeUsersPeriod === "monthly" && (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={MONTHLY_ACTIVE_USERS}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="month" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : `${v}`} />
                                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                                    <Legend />
                                    <Bar dataKey="returning" name="Returning Users" fill="#00f9c7" stackId="a" />
                                    <Bar dataKey="newUsers" name="New Users" fill="#3b82f6" radius={[4, 4, 0, 0]} stackId="a" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Retention Matrix + Churn Rate */}
            <div className="grid gap-4 md:grid-cols-3">
                {/* Retention Cohort Table */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg">Retention Cohort</CardTitle>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Percentage of users retained from each monthly cohort
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Cohort</th>
                                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">Users</th>
                                        <th className="text-center py-2 px-2 font-medium text-muted-foreground">M0</th>
                                        <th className="text-center py-2 px-2 font-medium text-muted-foreground">M1</th>
                                        <th className="text-center py-2 px-2 font-medium text-muted-foreground">M2</th>
                                        <th className="text-center py-2 px-2 font-medium text-muted-foreground">M3</th>
                                        <th className="text-center py-2 px-2 font-medium text-muted-foreground">M4</th>
                                        <th className="text-center py-2 px-2 font-medium text-muted-foreground">M5</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {RETENTION_MATRIX.map((row) => (
                                        <tr key={row.cohort} className="border-b border-border/50">
                                            <td className="py-2 px-2 font-medium">{row.cohort}</td>
                                            <td className="py-2 px-2 text-right text-muted-foreground">{formatNumber(row.users)}</td>
                                            {(["month0", "month1", "month2", "month3", "month4", "month5"] as const).map((key) => (
                                                <td key={key} className="py-2 px-2 text-center">
                                                    {row[key] !== null ? (
                                                        <span className={cn("inline-block px-2 py-0.5 rounded font-mono font-medium", getRetentionColor(row[key]))}>
                                                            {row[key]}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground/30">—</span>
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                {/* Churn Rate Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Churn Rate</CardTitle>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Monthly churn by cohort
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[260px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={CHURN_DATA} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                                    <YAxis type="category" dataKey="cohort" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} width={70} />
                                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} formatter={(value: any) => `${value}%`} />
                                    <Bar dataKey="churnRate" name="Churn Rate" radius={[0, 4, 4, 0]}>
                                        {CHURN_DATA.map((entry, index) => (
                                            <Cell key={index} fill={entry.churnRate > 4 ? "#f97316" : entry.churnRate > 3 ? "#eab308" : "#00f9c7"} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-4 space-y-2">
                            {CHURN_DATA.map((item) => (
                                <div key={item.cohort} className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">{item.cohort}</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div className="h-full rounded-full bg-destructive/60" style={{ width: `${item.churnRate * 10}%` }} />
                                        </div>
                                        <span className="font-mono font-medium">{item.churnRate}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Revenue Section */}
            <div className="grid gap-4 md:grid-cols-3">
                {/* Revenue Chart */}
                <Card className="md:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-lg">Revenue</CardTitle>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                Platform revenue and transaction volume
                            </p>
                        </div>
                        <Select value={revenuePeriod} onValueChange={(v: any) => setRevenuePeriod(v)}>
                            <SelectTrigger className="w-[120px] h-8 text-xs">
                                <SelectValue placeholder="Period" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="daily">Daily</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                            </SelectContent>
                        </Select>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full">
                            {revenuePeriod === "daily" ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={DAILY_REVENUE}>
                                        <defs>
                                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#00f9c7" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#00f9c7" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="date" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} interval={4} />
                                        <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => formatNGN(v)} />
                                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} formatter={(value: any) => [formatNGN(value), "Revenue"]} />
                                        <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#00f9c7" fillOpacity={1} fill="url(#colorRevenue)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={REVENUE_DATA}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="month" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                                        <YAxis yAxisId="left" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => formatNGN(v)} />
                                        <YAxis yAxisId="right" orientation="right" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => formatNGN(v)} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                                            formatter={(value: any, name: string) => [formatNGN(value), name === "revenue" ? "Revenue" : "Volume"]}
                                        />
                                        <Legend />
                                        <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#00f9c7" radius={[4, 4, 0, 0]} />
                                        <Bar yAxisId="right" dataKey="volume" name="Volume" fill="#3b82f6" radius={[4, 4, 0, 0]} opacity={0.4} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Revenue by Type */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Revenue by Type</CardTitle>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Breakdown by transaction type
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {REVENUE_BY_TYPE.map((item) => (
                                <div key={item.type} className="space-y-1.5">
                                    <div className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                            <span className="font-medium">{item.type}</span>
                                        </div>
                                        <span className="font-mono text-muted-foreground">{formatNGN(item.revenue)}</span>
                                    </div>
                                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                                        <div className="h-full rounded-full transition-all" style={{ width: `${item.percentage}%`, backgroundColor: item.color }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-6 pt-4 border-t border-border">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Total</span>
                                <span className="font-mono font-bold">{formatNGN(REVENUE_BY_TYPE.reduce((s, r) => s + r.revenue, 0))}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Cohort Revenue Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Cohort Revenue</CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Revenue, volume, and average spend per user by cohort
                    </p>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Cohort</th>
                                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Users</th>
                                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Transactions</th>
                                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Volume</th>
                                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Revenue</th>
                                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Fee Rate</th>
                                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Avg per User</th>
                                </tr>
                            </thead>
                            <tbody>
                                {COHORT_REVENUE.map((row) => {
                                    const volume = row.totalRevenue / 0.015;
                                    return (
                                        <tr key={row.cohort} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                            <td className="py-3 px-3 font-medium">{row.cohort}</td>
                                            <td className="py-3 px-3 text-right text-muted-foreground">{formatNumber(COHORTS.find((c) => c.label === row.cohort)?.totalUsers || 0)}</td>
                                            <td className="py-3 px-3 text-right text-muted-foreground">{formatNumber(row.totalTx)}</td>
                                            <td className="py-3 px-3 text-right font-mono text-muted-foreground">{formatNGN(volume)}</td>
                                            <td className="py-3 px-3 text-right font-mono font-medium">{formatNGN(row.totalRevenue)}</td>
                                            <td className="py-3 px-3 text-right font-mono text-secondary">1.5%</td>
                                            <td className="py-3 px-3 text-right font-mono">{formatNGN(row.avgPerUser)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
