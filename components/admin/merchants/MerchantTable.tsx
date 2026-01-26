"use client";

import {
    Building2,
    Mail,
    Globe,
    ExternalLink,
    MoreHorizontal,
    CheckCircle2,
    Clock,
    XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { MerchantUser } from "@/lib/api";
import Link from "next/link";

interface MerchantTableProps {
    merchants: MerchantUser[];
    isLoading: boolean;
}

export function MerchantTable({ merchants, isLoading }: MerchantTableProps) {
    const getStatusBadge = (status: string) => {
        switch (status) {
            case "APPROVED":
                return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500 border border-green-500/20">
                        <CheckCircle2 className="h-3 w-3" /> Approved
                    </span>
                );
            case "PENDING":
                return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500 border border-amber-500/20">
                        <Clock className="h-3 w-3" /> Pending
                    </span>
                );
            case "REJECTED":
                return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500 border border-red-500/20">
                        <XCircle className="h-3 w-3" /> Rejected
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-500 border border-zinc-500/20">
                        No KYB
                    </span>
                );
        }
    };

    return (
        <div className="rounded-md border border-white/10 bg-black/20 backdrop-blur-sm overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-white/5 border-b border-white/10 text-zinc-400">
                    <tr>
                        <th className="p-4 text-left font-medium">Merchant</th>
                        <th className="p-4 text-left font-medium">Business Info</th>
                        <th className="p-4 text-left font-medium">KYB Status</th>
                        <th className="p-4 text-left font-medium">Joined</th>
                        <th className="p-4 text-right font-medium">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {isLoading ? (
                        <tr>
                            <td colSpan={5} className="p-12 text-center text-zinc-500 italic">
                                Loading merchants...
                            </td>
                        </tr>
                    ) : merchants.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="p-12 text-center text-zinc-500 italic">
                                No merchants found.
                            </td>
                        </tr>
                    ) : (
                        merchants.map((merchant) => (
                            <tr key={merchant.id} className="transition-colors hover:bg-white/5">
                                <td className="p-4 align-middle">
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-white">
                                            {merchant.kyb?.businessName || "Unknown Business"}
                                        </span>
                                        <span className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                                            <Mail className="h-3 w-3" /> {merchant.email}
                                        </span>
                                    </div>
                                </td>
                                <td className="p-4 align-middle">
                                    <div className="flex flex-col text-xs gap-1">
                                        {merchant.kyb?.websiteUrl && (
                                            <a
                                                href={merchant.kyb.websiteUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-primary hover:underline flex items-center gap-1"
                                            >
                                                <Globe className="h-3 w-3" /> Website <ExternalLink className="h-2 w-2" />
                                            </a>
                                        )}
                                        <span className="text-zinc-400 flex items-center gap-1">
                                            <Building2 className="h-3 w-3" /> {merchant.kyb?.natureOfBusiness || "N/A"}
                                        </span>
                                    </div>
                                </td>
                                <td className="p-4 align-middle">
                                    {getStatusBadge(merchant.kyb?.status || "")}
                                </td>
                                <td className="p-4 align-middle text-zinc-500">
                                    {format(new Date(merchant.createdAt), "MMM d, yyyy")}
                                </td>
                                <td className="p-4 align-middle text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0 text-zinc-400 hover:text-white">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10 text-zinc-300">
                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                            <DropdownMenuItem asChild>
                                                <Link href={`/admin/merchants/${merchant.id}`}>
                                                    View KYB Details
                                                </Link>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem>Send Message</DropdownMenuItem>
                                            <DropdownMenuSeparator className="bg-white/5" />
                                            <DropdownMenuItem className="text-red-500">Suspend Merchant</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
