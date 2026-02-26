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

    useEffect(() => {
        if (_hasHydrated && !isAuthenticated) {
            router.push("/auth/login");
        }
    }, [isAuthenticated, _hasHydrated, router]);

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

    if (!_hasHydrated || !isAuthenticated) {
        return null;
    }

    return (
        <div className="min-h-screen bg-black text-white">
            <Header />
            
            {/* Background Decor */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[20%] right-[-5%] w-[30%] h-[30%] bg-primary/5 rounded-full blur-[100px]" />
                <div className="absolute bottom-[10%] left-[-5%] w-[30%] h-[30%] bg-secondary/5 rounded-full blur-[100px]" />
            </div>

            <main className="relative z-10 container mx-auto px-4 pt-32 pb-20">
                <div className="max-w-5xl mx-auto space-y-8">
                    {/* Page Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/20 rounded-xl">
                                    <History className="w-6 h-6 text-primary" />
                                </div>
                                <h1 className="text-3xl font-black tracking-tighter">OTC History</h1>
                            </div>
                            <p className="text-zinc-400">Manage and track your private OTC trades</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button asChild variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10">
                                <Link href="/otc/trade">New Trade</Link>
                            </Button>
                            <Button 
                                variant="outline" 
                                className="bg-white/5 border-white/10 hover:bg-white/10"
                                onClick={() => refetch()}
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                )}
                                Refresh
                            </Button>
                        </div>
                    </div>

                    {/* Filters & Search */}
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <Input 
                                placeholder="Search by reference, token or network..." 
                                className="pl-10 bg-white/5 border-white/10 focus:border-primary/50 transition-colors h-12 rounded-xl"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Button variant="outline" className="bg-white/5 border-white/10 h-12 px-6 rounded-xl hover:bg-white/10">
                            <Filter className="w-4 h-4 mr-2" />
                            Filter
                        </Button>
                    </div>

                    {/* Transactions List */}
                    {isLoading ? (
                        <div className="space-y-4">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-24 w-full bg-white/5 rounded-2xl animate-pulse" />
                            ))}
                        </div>
                    ) : filteredTransactions.length === 0 ? (
                        <div className="text-center py-24 bg-white/5 border border-dashed border-white/10 rounded-3xl space-y-4">
                            <div className="p-4 bg-white/5 rounded-full inline-block">
                                <Search className="w-8 h-8 text-zinc-500" />
                            </div>
                            <div className="space-y-2">
                                <p className="text-xl font-bold">No transactions found</p>
                                <p className="text-zinc-400">
                                    {searchQuery ? "Try adjusting your search terms" : "You haven't made any OTC trades yet"}
                                </p>
                            </div>
                            {!searchQuery && (
                                <Button asChild className="h-12 px-8 rounded-xl font-bold">
                                    <Link href="/otc/trade">Start Trading</Link>
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {filteredTransactions.map((tx) => (
                                <Card key={tx.id} className="border-none bg-white/5 backdrop-blur-md ring-1 ring-white/10 hover:ring-primary/50 transition-all duration-300 group overflow-hidden">
                                    <CardContent className="p-0">
                                        <div className="flex flex-col md:flex-row md:items-center">
                                            {/* Status Highlight */}
                                            <div className="w-full md:w-2 h-2 md:h-auto shrink-0 bg-primary/20 group-hover:bg-primary transition-colors" />
                                            
                                            <div className="flex-1 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                                                {/* Tx Info */}
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center shrink-0">
                                                        <History className="w-6 h-6 text-zinc-400" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-mono text-sm text-zinc-400">{tx.reference}</p>
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    handleCopy(tx.reference, "Reference");
                                                                }}
                                                                className="hover:text-primary transition-colors"
                                                            >
                                                                <Copy className="w-3 h-3 text-zinc-500" />
                                                            </button>
                                                        </div>
                                                        <p className="text-lg font-black tracking-tight">
                                                            {tx.quantity} <span className="text-zinc-500">{tx.token}</span>
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Network & Date */}
                                                <div className="grid grid-cols-2 md:grid-cols-1 gap-4 text-left md:text-right">
                                                    <div>
                                                        <p className="text-sm text-zinc-500 uppercase tracking-widest font-bold">Network</p>
                                                        <p className="text-white font-medium capitalize">{tx.network}</p>
                                                    </div>
                                                    <div className="md:hidden">
                                                        <p className="text-sm text-zinc-500 uppercase tracking-widest font-bold">Status</p>
                                                        <StatusBadge status={tx.status} />
                                                    </div>
                                                </div>

                                                <div className="hidden md:block text-right">
                                                    <p className="text-sm text-zinc-500 uppercase tracking-widest font-bold">Created At</p>
                                                    <p className="text-white">{formatDate(tx.createdAt)}</p>
                                                </div>

                                                <div className="hidden md:block">
                                                    <StatusBadge status={tx.status} />
                                                </div>

                                                {/* Action */}
                                                <Button asChild variant="ghost" className="p-2 hover:bg-white/10 rounded-2xl group/btn h-12 w-12 shrink-0">
                                                    <Link href={`/otc/status/${tx.reference}`}>
                                                        <ArrowRightCircle className="w-8 h-8 text-zinc-500 group-hover/btn:text-primary group-hover/btn:scale-110 transition-all" />
                                                    </Link>
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}

                    {/* Footer Warning */}
                    <div className="p-6 rounded-3xl bg-white/5 border border-white/10 flex items-center gap-4">
                        <div className="p-3 bg-white/5 rounded-2xl">
                            <ExternalLink className="w-6 h-6 text-zinc-400" />
                        </div>
                        <p className="text-sm text-zinc-400">
                            OTC transactions are processed manually by our agents. If a transaction remains "PENDING" for more than 4 hours, please contact our support team.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}
