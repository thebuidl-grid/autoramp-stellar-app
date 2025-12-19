"use client";

import Link from "next/link";
import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { useAuthStore } from "@/lib/store";
import { useTransactions } from "@/lib/hooks";
import { formatCurrency, truncateAddress } from "@/lib/utils";
import { TransactionDetailsDialog } from "@/components/transactions/transaction-details-dialog";
import {
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Clock,
  CheckCircle,
  Eye,
} from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { data: transactions, isLoading } = useTransactions();
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);

  const stats = {
    totalOnramp: transactions?.onramp?.length || 0,
    totalOfframp: transactions?.offramp?.length || 0,
    completedOnramp: transactions?.onramp?.filter(t => t.status === "COMPLETED").length || 0,
    completedOfframp: transactions?.offramp?.filter(t => t.status === "COMPLETED").length || 0,
  };

  const recentTransactions = [
    ...(transactions?.onramp?.map(t => ({ ...t, type: "onramp" as const })) || []),
    ...(transactions?.offramp?.map(t => ({ ...t, type: "offramp" as const })) || []),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  return (
    <div className="animate-fade-in">
      <Header 
        title={`Welcome back${user?.firstName ? `, ${user.firstName}` : ""}`}
        description="Here's an overview of your account"
      />

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Link href="/dashboard/onramp">
          <Card className="hover:border-foreground/50 transition-colors cursor-pointer group">
            <CardContent className="flex items-center gap-4 py-6">
              <div className="w-12 h-12 rounded-xl bg-foreground text-background flex items-center justify-center group-hover:scale-105 transition-transform">
                <ArrowDownLeft size={24} />
              </div>
              <div>
                <h3 className="font-bold text-lg">Buy Crypto</h3>
                <p className="text-sm text-muted-foreground">Convert NGN to crypto</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/offramp">
          <Card className="hover:border-foreground/50 transition-colors cursor-pointer group">
            <CardContent className="flex items-center gap-4 py-6">
              <div className="w-12 h-12 rounded-xl bg-foreground text-background flex items-center justify-center group-hover:scale-105 transition-transform">
                <ArrowUpRight size={24} />
              </div>
              <div>
                <h3 className="font-bold text-lg">Sell Crypto</h3>
                <p className="text-sm text-muted-foreground">Convert crypto to NGN</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Stats */}
      {(
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="py-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <TrendingUp size={16} />
                <span className="text-sm">Total Onramp</span>
              </div>
              <p className="text-3xl font-bold">{stats.totalOnramp}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <TrendingUp size={16} />
                <span className="text-sm">Total Offramp</span>
              </div>
              <p className="text-3xl font-bold">{stats.totalOfframp}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <CheckCircle size={16} />
                <span className="text-sm">Completed</span>
              </div>
              <p className="text-3xl font-bold">{stats.completedOnramp + stats.completedOfframp}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Clock size={16} />
                <span className="text-sm">Pending</span>
              </div>
              <p className="text-3xl font-bold">
                {stats.totalOnramp + stats.totalOfframp - stats.completedOnramp - stats.completedOfframp}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Transactions */}
      {(
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Your latest transaction activity</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : recentTransactions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No transactions yet</p>
                <p className="text-sm mt-1">Start by buying or selling crypto</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer group"
                    onClick={() => {
                      setSelectedTransaction(tx);
                      setShowDetails(true);
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        tx.type === "onramp" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                      }`}>
                        {tx.type === "onramp" ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                      </div>
                      <div>
                        <p className="font-semibold">
                          {tx.type === "onramp" ? "Buy Crypto" : "Sell Crypto"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {tx.destinationAddress ? truncateAddress(tx.destinationAddress) : tx.accountNumber || tx.reference}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(tx.amount)}</p>
                        <div className="flex items-center gap-2 justify-end mt-1">
                          <StatusBadge status={tx.status} />
                        </div>
                      </div>
                      <button className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-muted rounded">
                        <Eye size={18} className="text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Transaction Details Dialog */}
      {selectedTransaction && (
        <TransactionDetailsDialog
          transaction={selectedTransaction}
          open={showDetails}
          onOpenChange={setShowDetails}
        />
      )}
    </div>
  );
}
