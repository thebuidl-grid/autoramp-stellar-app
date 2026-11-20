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
  AreaChart,
  Area,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMerchantBankAnalytics } from "@/lib/hooks/use-merchant-bank";
import { Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";

interface AnalyticsDataPoint {
  date: string;
  successCount: number;
  errorCount: number;
  moneyMoved: number;
}

function CustomTooltip({
  active,
  payload,
  label,
  prefix,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  prefix?: string;
}) {
  if (!active || !payload?.length) return null;

  let displayDate = label;
  try {
    displayDate = format(parseISO(label!), "MMM d, yyyy");
  } catch {}

  return (
    <div className="rounded-lg border border-(--c-line) bg-black/80 backdrop-blur-md px-4 py-3 shadow-xl">
      <p className="text-sm font-medium text-(--c-text) mb-2">{displayDate}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-sm">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-(--c-text)/60">{entry.name}:</span>
          <span className="text-(--c-text) font-medium">
            {prefix}
            {entry.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatXAxisDate(date: string, period: string) {
  try {
    const d = parseISO(date);
    if (period === "monthly") return format(d, "MMM yyyy");
    if (period === "weekly") return format(d, "MMM d");
    return format(d, "MMM d");
  } catch {
    return date;
  }
}

export function BankAnalyticsChart() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const { data, isLoading } = useMerchantBankAnalytics(period);

  const chartData = (data ?? []).map((d: AnalyticsDataPoint) => ({
    ...d,
    shortDate: formatXAxisDate(d.date, period),
  }));

  return (
    <Card className="col-span-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Bank Activity</CardTitle>
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
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex h-[300px] w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : data && data.length > 0 ? (
          <>
            {/* Transactions Chart */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3 px-1">Transactions</p>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={2}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="shortDate"
                      stroke="#666"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#666"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      content={<CustomTooltip />}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    />
                    <Bar
                      dataKey="successCount"
                      name="Success"
                      fill="#22c55e"
                      radius={[3, 3, 0, 0]}
                      stackId="a"
                    />
                    <Bar
                      dataKey="errorCount"
                      name="Errors"
                      fill="#ef4444"
                      radius={[3, 3, 0, 0]}
                      stackId="a"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Money Moved Chart */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3 px-1">Money Moved (₦)</p>
              <div className="h-[160px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="moneyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="shortDate"
                      stroke="#666"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#666"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) =>
                        v >= 1000000
                          ? `${(v / 1000000).toFixed(1)}M`
                          : v >= 1000
                            ? `${(v / 1000).toFixed(0)}k`
                            : `${v}`
                      }
                    />
                    <Tooltip
                      cursor={{ stroke: "#3b82f6", strokeWidth: 1 }}
                      content={<CustomTooltip prefix="₦" />}
                    />
                    <Area
                      type="monotone"
                      dataKey="moneyMoved"
                      name="Money Moved"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#moneyGradient)"
                      dot={false}
                      activeDot={{
                        r: 5,
                        fill: "#3b82f6",
                        stroke: "#1e3a5f",
                        strokeWidth: 2,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-[300px] w-full items-center justify-center text-muted-foreground">
            No activity data for this period
          </div>
        )}
      </CardContent>
    </Card>
  );
}
