"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import {
  Users,
  ArrowUpDown,
  Store,
  Mail,
  LogOut,
  BarChart3,
  Loader2,
  RefreshCw,
  Wallet,
  ArrowDownToLine,
  Repeat,
  Landmark,
  Activity,
  Clock,
  XCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Header } from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useDataStats } from "@/lib/hooks/use-data";
const DATA_EMAIL_KEY = "autoramp-data-email";
const RATE_REFRESH_INTERVAL = 30_000; // 30 seconds

async function fetchPublicUsdNgnRate(): Promise<number | null> {
  try {
    const response = await axios.get<{ rates?: Record<string, number> }>(
      "https://api.exchangerate-api.com/v4/latest/USD",
    );
    const ngnRate = response.data.rates?.NGN;
    if (typeof ngnRate === "number" && ngnRate > 0) {
      return ngnRate;
    }
    return null;
  } catch (error) {
    console.error("[Dashboard] Public rate fetch failed:", error);
    return null;
  }
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatCompactNGN(value: number): string {
  if (value >= 1_000_000_000) return `₦${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `₦${(value / 1_000).toFixed(1)}K`;
  return `₦${value.toLocaleString()}`;
}

function formatCompactUSD(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatCard({
  title,
  value,
  sublabel,
  icon: Icon,
  iconColor,
}: {
  title: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  icon: React.ElementType;
  iconColor?: string;
}) {
  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-white/70">{title}</CardTitle>
        <Icon className={cn("h-4 w-4", iconColor ?? "text-white/40")} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        {sublabel && <p className="text-xs text-white/40 mt-2">{sublabel}</p>}
      </CardContent>
    </Card>
  );
}

function StatSkeleton() {
  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader className="pb-2">
        <div className="h-4 w-2/3 rounded bg-white/10 animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="h-9 w-1/2 rounded bg-white/10 animate-pulse" />
      </CardContent>
    </Card>
  );
}

function EmailGate({ onSubmit }: { onSubmit: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }
    setError(null);
    onSubmit(email.trim());
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-24 pb-16">
      <Card className="w-full max-w-md bg-white/5 border-white/10 backdrop-blur-xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
            <BarChart3 className="h-6 w-6 text-secondary" />
          </div>
          <CardTitle className="text-2xl">AutoRamp Dashboard</CardTitle>
          <p className="text-sm text-white/50">
            Analytics dashboard — enter your authorized admin email to continue.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                size={18}
              />
              <Input
                type="email"
                placeholder="admin@autoramp.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button
              type="submit"
              className="w-full h-12 bg-secondary text-black hover:bg-secondary/90 font-semibold"
            >
              Continue to dashboard
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DataPage() {
  const [gateEmail, setGateEmail] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(DATA_EMAIL_KEY);
  });
  const [loaded, setLoaded] = useState(false);
  const [currency, setCurrency] = useState<"NGN" | "USDC">("USDC");
  const [clientRate, setClientRate] = useState<number | null>(null);
  const [clientRateLoading, setClientRateLoading] = useState(false);

  // Poll the USD/NGN rate on a fixed interval once the page loads.
  // Keeps the displayed USDC conversion up-to-date without refetching stats.
  useEffect(() => {
    let cancelled = false;

    const fetchRate = async () => {
      try {
        setClientRateLoading(true);
        const rate = await fetchPublicUsdNgnRate();
        if (!cancelled) {
          setClientRate(rate);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[Dashboard] Failed to fetch USDC rate:", err);
        }
      } finally {
        if (!cancelled) {
          setClientRateLoading(false);
        }
      }
    };

    fetchRate();
    const interval = setInterval(fetchRate, RATE_REFRESH_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Email-only gate (no OTP / token) — persisted locally, sent as x-admin-email.
  useEffect(() => {
    setLoaded(true);
  }, []);

  const {
    data: stats,
    error: statsError,
    isLoading: statsLoading,
    refetch: refetchStats,
    isFetching: statsFetching,
  } = useDataStats(gateEmail, !!gateEmail && loaded);

  const handleEmailSubmit = (email: string) => {
    localStorage.setItem(DATA_EMAIL_KEY, email);
    setGateEmail(email);
  };

  const handleLogout = () => {
    localStorage.removeItem(DATA_EMAIL_KEY);
    setGateEmail(null);
  };

  if (!loaded) return null;

  const effectiveRate = clientRate ?? stats?.usdNgnRate ?? null;

  const isUnauthorized =
    axios.isAxiosError(statsError) && statsError.response?.status === 401;
  const backendMessage =
    axios.isAxiosError(statsError) &&
    typeof statsError.response?.data?.message === "string"
      ? (statsError.response.data.message as string)
      : null;

  const transactionsByType = stats
    ? [
        { type: "Onramp", count: stats.onramps, color: "#3b82f6" },
        { type: "Offramp", count: stats.offramps, color: "#a855f7" },
        { type: "Swap", count: stats.swaps, color: "#00f9c7" },
        { type: "Bank Transfer", count: stats.bankTransfers, color: "#f97316" },
        { type: "Merchant", count: stats.merchantTransactions, color: "#eab308" },
      ]
    : [];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      {!gateEmail ? (
        <EmailGate onSubmit={handleEmailSubmit} />
      ) : (
        <main className="max-w-6xl mx-auto px-4 pt-32 pb-20 space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-secondary/10 text-secondary border-secondary/20">
                  AutoRamp Dashboard · Analytics
                </Badge>
                {statsLoading || statsFetching ? (
                  <Badge variant="outline" className="text-[10px] border-white/10 text-white/50">
                    <Loader2 size={12} className="animate-spin mr-1" /> Fetching GET /dashboard…
                  </Badge>
                ) : stats ? (
                  <Badge className="text-[10px] bg-green-500/10 text-green-400 border-green-500/20">
                    Live · GET /dashboard
                  </Badge>
                ) : isUnauthorized ? (
                  <Badge className="text-[10px] bg-red-500/10 text-red-400 border-red-500/20">
                    401 · Email not authorized
                  </Badge>
                ) : (
                  <Badge className="text-[10px] bg-red-500/10 text-red-400 border-red-500/20">
                    Error loading data
                  </Badge>
                )}
              </div>
              <h1 className="text-3xl font-bold tracking-tight">
                Analytics Dashboard
              </h1>
              <p className="text-white/50 text-sm mt-1">
                Total users, total transactions & merchant transactions at a
                glance.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/50 flex items-center gap-1.5">
                <Mail size={14} /> {gateEmail}
              </span>
              <div className="flex items-center gap-2 text-sm">
                <span className={cn("text-white/50", currency === "NGN" && "text-white font-medium")}>NGN</span>
                <Switch
                  checked={currency === "USDC"}
                  onCheckedChange={(checked) => setCurrency(checked ? "USDC" : "NGN")}
                />
                <span className={cn("text-white/50", currency === "USDC" && "text-white font-medium")}>USDC</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchStats()}
                disabled={statsFetching}
                className="border-white/10"
              >
                <RefreshCw size={14} className={cn(statsFetching && "animate-spin")} /> Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="border-white/10"
              >
                <LogOut size={14} /> Change email
              </Button>
            </div>
          </div>

          {isUnauthorized ? (
            <Card className="bg-red-500/5 border-red-500/20">
              <CardContent className="py-8 text-center space-y-3">
                <p className="text-red-300 font-semibold">Email not authorized</p>
                <p className="text-sm text-white/60">
                  <span className="font-mono">{gateEmail}</span> is not on the
                  admin list for <span className="font-mono">GET /dashboard</span>.
                  Try a different email.
                </p>
                {backendMessage && (
                  <p className="text-xs font-mono text-white/40 border border-white/10 rounded-lg px-3 py-2">
                    Backend said: {backendMessage}
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="border-white/10"
                >
                  <LogOut size={14} /> Use a different email
                </Button>
              </CardContent>
            </Card>
          ) : statsLoading && !stats ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <StatSkeleton />
                <StatSkeleton />
                <StatSkeleton />
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatSkeleton />
                <StatSkeleton />
                <StatSkeleton />
                <StatSkeleton />
              </div>
            </>
          ) : statsError && !stats ? (
            <Card className="bg-red-500/5 border-red-500/20">
              <CardContent className="py-8 text-center space-y-3">
                <p className="text-red-300 font-semibold">Could not load dashboard data</p>
                <p className="text-sm text-white/60">
                  <span className="font-mono">GET /dashboard</span> failed. Check the
                  backend and try again.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchStats()}
                  disabled={statsFetching}
                  className="border-white/10"
                >
                  <RefreshCw size={14} className={cn(statsFetching && "animate-spin")} /> Retry
                </Button>
              </CardContent>
            </Card>
          ) : stats ? (
            <>
              {/* Core stats */}
              <div className="grid gap-4 md:grid-cols-3">
                <StatCard
                  title="Total Number of Users"
                  value={stats.totalUsers.toLocaleString()}
                  icon={Users}
                  iconColor="text-blue-400"
                />
                <StatCard
                  title="Total Number of Transactions"
                  value={stats.totalTransactions.toLocaleString()}
                  icon={ArrowUpDown}
                  iconColor="text-secondary"
                />
                <StatCard
                  title="Merchant Transactions"
                  value={stats.merchantTransactions.toLocaleString()}
                  icon={Store}
                  iconColor="text-orange-400"
                />
              </div>

              {/* Breakdown */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  title="Onramps"
                  value={stats.onramps.toLocaleString()}
                  sublabel={`${stats.currency} volume`}
                  icon={ArrowDownToLine}
                  iconColor="text-blue-400"
                />
                <StatCard
                  title="Offramps"
                  value={stats.offramps.toLocaleString()}
                  sublabel={`${stats.currency} volume`}
                  icon={Wallet}
                  iconColor="text-purple-400"
                />
                <StatCard
                  title="Swaps"
                  value={stats.swaps.toLocaleString()}
                  sublabel="On-chain swaps"
                  icon={Repeat}
                  iconColor="text-secondary"
                />
                <StatCard
                  title="Bank Transfers"
                  value={stats.bankTransfers.toLocaleString()}
                  sublabel="Fiat transfers"
                  icon={Landmark}
                  iconColor="text-orange-400"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  title="Total Amount Transacted"
                  value={
                    currency === "USDC" && clientRateLoading ? (
                      <Loader2 size={24} className="animate-spin text-white/40" />
                    ) : currency === "USDC" && effectiveRate ? (
                      formatCompactUSD(stats.totalAmountTransacted / effectiveRate)
                    ) : (
                      formatCompactNGN(stats.totalAmountTransacted)
                    )
                  }
                  sublabel={
                    currency === "USDC" && clientRateLoading ? (
                      "Fetching USDC rate…"
                    ) : currency === "USDC" && effectiveRate ? (
                      `$${(stats.totalAmountTransacted / effectiveRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
                    ) : (
                      `${stats.totalAmountTransacted.toLocaleString()} ${stats.currency}`
                    )
                  }
                  icon={Activity}
                  iconColor="text-green-400"
                />
                <StatCard
                  title="Active Merchants"
                  value={stats.activeMerchants.toLocaleString()}
                  sublabel="Verified & active"
                  icon={Store}
                  iconColor="text-secondary"
                />
                <StatCard
                  title="Pending Verifications"
                  value={stats.pendingVerifications.toLocaleString()}
                  sublabel="Awaiting review"
                  icon={Clock}
                  iconColor="text-yellow-400"
                />
                <StatCard
                  title="Failed Transactions"
                  value={stats.failedTransactions.toLocaleString()}
                  sublabel="Needs attention"
                  icon={XCircle}
                  iconColor="text-red-400"
                />
              </div>

              {/* Transactions by type (live) */}
              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-lg">Transactions by Type</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[260px] mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={transactionsByType} layout="vertical">
                        <CartesianGrid
                          strokeDasharray="3 3"
                          horizontal={false}
                        />
                        <XAxis type="number" hide />
                        <YAxis
                          type="category"
                          dataKey="type"
                          stroke="#888"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          width={90}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0a0a0a",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]} fill="#00f9c7" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
                    {transactionsByType.map((t) => (
                      <div
                        key={t.type}
                        className="flex items-center justify-between text-xs rounded-lg border border-white/10 px-3 py-2"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: t.color }}
                          />
                          {t.type}
                        </span>
                        <span className="font-mono text-white/60">
                          {t.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

            </>
          ) : null}
        </main>
      )}
      <Footer />
    </div>
  );
}
