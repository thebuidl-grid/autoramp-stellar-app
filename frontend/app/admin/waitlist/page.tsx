"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowDownRight, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Download, Loader2, MailPlus, Percent, Search, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/api";
import { userTypeLabel } from "@/lib/waitlist";
import { useDebounce } from "@/lib/hooks";

const RANGES = [7, 30, 90] as const;
const LIMIT = 20;

export default function AdminWaitlistPage() {
  const [days, setDays] = useState<number>(30);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"daily" | "cumulative">("daily");
  const [exporting, setExporting] = useState(false);
  const debouncedSearch = useDebounce(search, 400);

  const stats = useQuery({
    queryKey: ["admin-waitlist-stats", days],
    queryFn: async () => (await adminApi.getWaitlistStats(days)).data,
  });
  const list = useQuery({
    queryKey: ["admin-waitlist", page, debouncedSearch],
    queryFn: async () => (await adminApi.getWaitlist(page, LIMIT, debouncedSearch)).data,
  });

  async function exportCsv() {
    setExporting(true);
    try {
      const { data } = await adminApi.exportWaitlistCsv();
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "waitlist.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const meta = list.data?.meta;
  const entries = list.data?.data ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Waitlist analytics</h1>
          <p className="text-muted-foreground">Growth, when people sign up, where they come from, and how many convert.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-muted p-1 rounded-md text-xs font-medium">
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
          <Button variant="outline" className="gap-2" onClick={exportCsv} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={MailPlus} label="Total signups" value={stats.data?.total} loading={stats.isLoading} />
        <StatCard icon={CalendarDays} label="Today (UTC)" value={stats.data?.today} loading={stats.isLoading} />
        <StatCard icon={TrendingUp} label={`Avg / day (${days}d)`} value={stats.data?.averagePerDay} loading={stats.isLoading} />
        <ChangeCard days={days} inRange={stats.data?.inRange} change={stats.data?.change} loading={stats.isLoading} />
        <StatCard
          icon={Percent}
          label="Registered"
          value={stats.data ? `${stats.data.conversion.rate}%` : undefined}
          hint={stats.data ? `${stats.data.conversion.registered} of ${stats.data.conversion.total}` : undefined}
          loading={stats.isLoading}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{mode === "daily" ? "Signups per day" : "Total signups over time"}</CardTitle>
          <div className="flex bg-muted p-1 rounded-md text-xs font-medium">
            {(["daily", "cumulative"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-sm capitalize transition-colors ${mode === m ? "bg-background shadow-sm" : "hover:text-foreground"}`}
              >
                {m}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="h-64 sm:h-72">
          {stats.isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.data?.series ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" tickFormatter={(d: string) => format(new Date(`${d}T00:00:00Z`), "MMM d")} minTickGap={24} />
                <YAxis allowDecimals={false} width={32} />
                <Tooltip labelFormatter={(d) => format(new Date(`${d}T00:00:00Z`), "PP")} formatter={(v) => [v, mode === "daily" ? "Signups" : "Total"]} />
                <Area type="monotone" dataKey={mode === "daily" ? "count" : "cumulative"} stroke="currentColor" fill="currentColor" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>When people sign up (UTC)</CardTitle>
        </CardHeader>
        <CardContent>
          <Heatmap grid={stats.data?.heatmap} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Who is signing up (all time)</CardTitle>
          </CardHeader>
          <CardContent>
            <Sources
              items={
                stats.data
                  ? // `?? []`: an older backend without byType must not crash the page.
                    (stats.data.byType ?? [])
                      .filter((t) => t.type !== "unknown" || t.count > 0)
                      .map((t) => ({ source: userTypeLabel(t.type), count: t.count }))
                  : undefined
              }
              emptyText="No signups yet."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Signups by source</CardTitle>
          </CardHeader>
          <CardContent>
            <Sources items={stats.data?.bySource} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle>Signups</CardTitle>
          <div className="relative w-full md:w-auto">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email or phone..."
              aria-label="Search signups"
              className="pl-8 w-full md:w-64"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Phone</th>
                <th className="py-2 font-medium">Type</th>
                <th className="py-2 font-medium">Source</th>
                <th className="py-2 font-medium">Signed up</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading ? (
                <tr><td colSpan={5} className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No signups found.</td></tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="py-3">
                      <div className="font-medium">{e.name ?? "—"}</div>
                      <div className="text-muted-foreground">{e.email}</div>
                    </td>
                    <td className="py-3 text-muted-foreground">{e.phoneNumber ?? "—"}</td>
                    <td className="py-3">{e.userType ? userTypeLabel(e.userType) : <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-3 text-muted-foreground">{e.source ?? "—"}</td>
                    <td className="py-3 text-muted-foreground">{format(new Date(e.createdAt), "PPp")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>

          {meta && meta.total > 0 && (
            <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(meta.page - 1) * meta.limit + 1} to {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} signups
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" aria-label="Next page" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, loading }: { icon: React.ElementType; label: string; value?: number | string; hint?: string; loading: boolean }) {
  return (
    <Card>
      <CardContent className="p-6 flex items-center gap-4">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{loading ? "…" : (value ?? 0)}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ChangeCard({ days, inRange, change, loading }: { days: number; inRange?: number; change?: { previous: number; percent: number | null }; loading: boolean }) {
  const pct = change?.percent;
  const up = (pct ?? 0) >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <Card>
      <CardContent className="p-6 flex items-center gap-4">
        <Icon className={`h-5 w-5 ${pct == null ? "text-muted-foreground" : up ? "text-green-500" : "text-red-500"}`} />
        <div>
          <p className="text-sm text-muted-foreground">Last {days}d vs previous</p>
          <p className="text-2xl font-bold">{loading ? "…" : pct == null ? "n/a" : `${up ? "+" : ""}${pct}%`}</p>
          {!loading && <p className="text-xs text-muted-foreground">{inRange ?? 0} vs {change?.previous ?? 0}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Heatmap({ grid }: { grid?: number[][] }) {
  if (!grid) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px] space-y-1" role="img" aria-label="Signups by weekday and hour">
        {grid.map((row, d) => (
          <div key={d} className="flex items-center gap-1">
            <span className="w-8 text-xs text-muted-foreground">{WEEKDAYS[d]}</span>
            {row.map((count, h) => (
              <div
                key={h}
                title={`${WEEKDAYS[d]} ${String(h).padStart(2, "0")}:00 UTC: ${count} signup${count === 1 ? "" : "s"}`}
                className="h-5 flex-1 rounded-sm bg-muted"
                style={count ? { backgroundColor: "var(--primary, currentColor)", opacity: 0.2 + 0.8 * (count / max) } : undefined}
              />
            ))}
          </div>
        ))}
        <div className="flex items-center gap-1 pl-9 text-[10px] text-muted-foreground">
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="flex-1 text-center">{h % 6 === 0 ? String(h).padStart(2, "0") : ""}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Sources({ items, emptyText = "No signups in this range." }: { items?: { source: string; count: number }[]; emptyText?: string }) {
  if (!items) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.source} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>{i.source}</span>
            <span className="text-muted-foreground">{i.count}</span>
          </div>
          <div className="h-2 rounded bg-muted">
            <div className="h-2 rounded bg-primary" style={{ width: `${(i.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
