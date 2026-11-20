"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Activity, ArrowDownRight, ArrowUpRight, Loader2, Repeat, UserPlus, Users } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "@/lib/api";

const RANGES = [7, 30, 90] as const;
const KIND_LABEL = { onramp: "On-ramp", offramp: "Off-ramp", swap: "Swap" } as const;
const fmtDate = (d: string) => format(new Date(`${d}T00:00:00Z`), "MMM d");
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export default function AdminUserAnalyticsPage() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-user-analytics", days],
    queryFn: async () => (await adminApi.getUserAnalytics(days)).data,
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User analytics</h1>
          <p className="text-muted-foreground">Growth, engagement, activation and retention across the platform.</p>
        </div>
        <div className="flex self-start bg-muted p-1 rounded-md text-xs font-medium">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={`px-3 py-1.5 rounded-sm transition-colors ${days === r ? "bg-background shadow-sm" : "hover:text-foreground"}`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {isError && <p role="alert" className="text-sm text-red-500">Could not load analytics. Please try again.</p>}
      {isLoading && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Users} label="Total users" value={nf.format(data.users.total)} />
            <NewUsersCard days={days} users={data.users} />
            <Stat
              icon={Activity}
              label="Active (DAU / WAU / MAU)"
              value={`${data.active.dau} / ${data.active.wau} / ${data.active.mau}`}
              hint={`Stickiness ${data.active.stickiness}%`}
            />
            <Stat
              icon={Repeat}
              label="Repeat users"
              value={String(data.funnel[3]?.count ?? 0)}
              hint={`${data.funnel[3]?.percent ?? 0}% of registered`}
            />
          </div>
          <p className="text-xs text-muted-foreground -mt-4">
            Active-user counts and retention rely on activity tracking that started at deploy, so they grow more accurate over time.
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>New users per day</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.users.signups}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" tickFormatter={fmtDate} minTickGap={24} />
                    <YAxis allowDecimals={false} width={32} />
                    <Tooltip labelFormatter={(d) => fmtDate(String(d))} formatter={(v) => [v, "New users"]} />
                    <Area type="monotone" dataKey="count" stroke="currentColor" fill="currentColor" fillOpacity={0.15} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Users transacting per day</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.active.transactingPerDay}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" tickFormatter={fmtDate} minTickGap={24} />
                    <YAxis allowDecimals={false} width={32} />
                    <Tooltip labelFormatter={(d) => fmtDate(String(d))} formatter={(v) => [v, "Users"]} />
                    <Bar dataKey="users" fill="currentColor" fillOpacity={0.6} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Activation funnel (all time)</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-4">
                  {data.funnel.map((f) => (
                    <li key={f.step} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{f.step}</span>
                        <span className="text-muted-foreground">{f.count} · {f.percent}%</span>
                      </div>
                      <div className="h-2 rounded bg-muted">
                        <div className="h-2 rounded bg-primary" style={{ width: `${f.percent}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Retention</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2 font-medium">Still active after</th>
                      <th className="py-2 font-medium">Users</th>
                      <th className="py-2 font-medium">Retained</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.retention.map((r) => (
                      <tr key={r.day} className="border-b last:border-0">
                        <td className="py-3">{r.day} day{r.day === 1 ? "" : "s"}</td>
                        <td className="py-3 text-muted-foreground">{r.retained} of {r.eligible}</td>
                        <td className="py-3 font-medium">{r.percent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Transactions (last {days} days)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 font-medium">Type</th>
                    <th className="py-2 font-medium">Total</th>
                    <th className="py-2 font-medium">Completed</th>
                    <th className="py-2 font-medium">Failed</th>
                    <th className="py-2 font-medium">Success rate</th>
                    <th className="py-2 font-medium">Users</th>
                    <th className="py-2 font-medium">Completed volume</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((t) => {
                    const vol = data.volume.filter((v) => v.kind === t.kind);
                    return (
                      <tr key={t.kind} className="border-b last:border-0">
                        <td className="py-3 font-medium">{KIND_LABEL[t.kind]}</td>
                        <td className="py-3">{t.total}</td>
                        <td className="py-3">{t.completed}</td>
                        <td className="py-3">{t.failed}</td>
                        <td className="py-3">{t.total ? `${t.successRate}%` : "—"}</td>
                        <td className="py-3">{t.users}</td>
                        <td className="py-3 text-muted-foreground">
                          {t.kind === "swap" ? "n/a (token swaps)" : vol.length ? vol.map((v) => `${nf.format(v.amount)} ${v.currency}`).join(", ") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: React.ElementType; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-6 flex items-center gap-4">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function NewUsersCard({ days, users }: { days: number; users: { new: number; newChange: { previous: number; percent: number | null } } }) {
  const pct = users.newChange.percent;
  const up = (pct ?? 0) >= 0;
  const Trend = pct == null ? UserPlus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <Card>
      <CardContent className="p-6 flex items-center gap-4">
        <Trend className={`h-5 w-5 ${pct == null ? "text-muted-foreground" : up ? "text-green-500" : "text-red-500"}`} />
        <div>
          <p className="text-sm text-muted-foreground">New users ({days}d)</p>
          <p className="text-2xl font-bold">{users.new}</p>
          <p className="text-xs text-muted-foreground">
            {pct == null ? "No previous period" : `${up ? "+" : ""}${pct}% vs ${users.newChange.previous} before`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
