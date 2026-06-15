"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { otcApi, OtcTransaction } from "@/lib/api";
import { useAuthStore, useIsAuthenticated } from "@/lib/store";
import { Header } from "@/components/layout/header";
import { 
    RefreshCw, 
    Loader2, 
    ArrowLeft, 
    History, 
    Search,
    Filter,
    ArrowRightCircle,
    Copy,
    ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate, copyToClipboard } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import Link from "next/link";

export default function OtcHistoryPage() {
    const router = useRouter();
    const { toast } = useToast();
    const isAuthenticated = useIsAuthenticated();
    const { _hasHydrated } = useAuthStore();
    const [searchQuery, setSearchQuery] = useState("");

    const { data: transactions, isLoading, refetch } = useQuery({
        queryKey: ["otc-history"],
        queryFn: async () => {
            const response = await otcApi.getTransactions();
            return response.data;
        },
        enabled: isAuthenticated,
    });


    const handleCopy = async (text: string, label: string) => {
        const success = await copyToClipboard(text);
        if (success) {
            toast({
                title: "Copied!",
                description: `${label} copied to clipboard`,
                variant: "success",
            });
        }
    };

    const filteredTransactions = transactions?.filter(tx => 
        tx.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.token.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.network.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <History className="w-6 h-6 text-primary" />
                        <h1 className="text-3xl font-bold tracking-tight">OTC History</h1>
                    </div>
                    <p className="text-muted-foreground">Manage and track your private OTC trades</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button asChild variant="outline">
                        <Link href="/otc/trade">New Trade</Link>
                    </Button>
                    <Button 
                        variant="outline" 
                        onClick={() => refetch()}
                        disabled={isLoading}
                        className="gap-2"
                    >
                        {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <RefreshCw className="w-4 h-4" />
                        )}
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Filters & Search */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search by reference, token or network..." 
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <Button variant="outline" className="gap-2">
                    <Filter className="w-4 h-4" />
                    Filter
                </Button>
            </div>

            {/* Transactions List */}
            {isLoading ? (
                <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-24 w-full bg-muted rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : filteredTransactions.length === 0 ? (
                <Card className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="p-4 bg-muted rounded-full">
                        <Search className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <div className="space-y-2 px-4">
                        <p className="text-xl font-bold">No transactions found</p>
                        <p className="text-muted-foreground">
                            {searchQuery ? "Try adjusting your search terms" : "You haven't made any OTC trades yet"}
                        </p>
                    </div>
                    {!searchQuery && (
                        <Button asChild className="font-bold">
                            <Link href="/otc/trade">Start Trading</Link>
                        </Button>
                    )}
                </Card>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {filteredTransactions.map((tx) => (
                        <Link 
                            key={tx.id} 
                            href={`/otc/status/${tx.reference}`}
                            className="group"
                        >
                            <Card className="hover:bg-muted/50 transition-colors border-transparent hover:border-border">
                                <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                            <History className="w-5 h-5 text-primary" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-mono text-xs text-muted-foreground">{tx.reference.slice(0, 16)}...</p>
                                                <button 
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleCopy(tx.reference, "Reference");
                                                    }}
                                                    className="hover:text-primary transition-colors"
                                                >
                                                    <Copy className="w-3 h-3" />
                                                </button>
                                            </div>
                                            <p className="text-lg font-bold">
                                                {tx.quantity} <span className="text-sm font-normal text-muted-foreground uppercase">{tx.token}</span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6">
                                        <div className="text-right hidden sm:block">
                                            <p className="text-xs font-medium">{formatDate(tx.createdAt)}</p>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{tx.network}</p>
                                        </div>
                                        <StatusBadge status={tx.status} />
                                        <ArrowRightCircle className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}

            {/* Footer Tip */}
            <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 flex items-center gap-4">
                    <ExternalLink className="w-5 h-5 text-primary shrink-0" />
                    <p className="text-xs text-muted-foreground">
                        OTC transactions are processed manually by our agents within 4 hours. Status updates will be visible here.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
