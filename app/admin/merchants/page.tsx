"use client";

import { useState } from "react";
import {
    Building2,
    Search,
    Filter,
    Users,
    Clock,
    CheckCircle2,
    TrendingUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { MerchantTable } from "@/components/admin/merchants/MerchantTable";

export default function AdminMerchantsPage() {
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const limit = 10;

    const [searchTerm, setSearchTerm] = useState("");

    const { data: merchants = [], isLoading } = useQuery({
        // queryKey: ["admin-merchants", statusFilter],
        queryKey: ["admin-merchants"],
        queryFn: async () => {
            // Fetch all merchants
            const { data } = await adminApi.getMerchants();
            return data;
        },
    });

    // Client-side filtering
    const filteredMerchants = merchants.filter(merchant =>
        (statusFilter ? merchant.status === statusFilter : true) &&
        (searchTerm ?
            merchant.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            merchant.user?.email?.toLowerCase().includes(searchTerm.toLowerCase())
            : true)
    );

    // Client-side pagination
    const totalPages = Math.ceil(filteredMerchants.length / limit);
    const paginatedMerchants = filteredMerchants.slice((page - 1) * limit, page * limit);

    const stats = [
        {
            title: "Total Merchants",
            value: merchants.length,
            icon: Users,
            color: "text-blue-500",
            bg: "bg-blue-500/10"
        },
        {
            title: "Pending KYB",
            value: merchants.filter(m => m.status === "PENDING").length,
            icon: Clock,
            color: "text-amber-500",
            bg: "bg-amber-500/10"
        },
        {
            title: "Approved",
            value: merchants.filter(m => m.status === "APPROVED").length,
            icon: CheckCircle2,
            color: "text-green-500",
            bg: "bg-green-500/10"
        },
        {
            title: "Growth",
            value: "+12%",
            icon: TrendingUp,
            color: "text-primary",
            bg: "bg-primary/10"
        }
    ];


    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-white">Merchant Management</h1>
                <p className="text-zinc-400">
                    Review and manage business onboarding and KYB applications.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat, i) => (
                    <Card key={i} className="bg-white/5 border-white/10 backdrop-blur-md">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-zinc-400">{stat.title}</CardTitle>
                            <div className={`${stat.bg} p-2 rounded-full`}>
                                <stat.icon className={`h-4 w-4 ${stat.color}`} />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-white">{stat.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <CardTitle className="text-white">All Merchants</CardTitle>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                                <Input
                                    type="search"
                                    placeholder="Search business..."
                                    className="w-[200px] lg:w-[300px] pl-8 h-9 bg-black/20 border-white/10 text-white"
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setPage(1);
                                    }}
                                />
                            </div>
                            <Button variant="outline" size="sm" className="h-9 gap-2 border-white/10 text-zinc-400 hover:text-white">
                                <Filter className="h-4 w-4" />
                                Filter
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <MerchantTable
                        merchants={paginatedMerchants}
                        isLoading={isLoading}
                    />

                    {/* Simple Pagination */}
                    <div className="flex items-center justify-between mt-6">
                        <p className="text-sm text-zinc-500">
                            Showing page {page} of {totalPages || 1}
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1 || isLoading}
                                className="border-white/10 text-zinc-400 hover:text-white disabled:opacity-30"
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages || totalPages === 0 || isLoading}
                                className="border-white/10 text-zinc-400 hover:text-white disabled:opacity-30"
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div >
    );
}
