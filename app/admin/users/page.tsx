"use client";

import { useState } from "react";
import {
    Users,
    Search,
    UserPlus,
    Mail,
    Phone,
    Wallet,
    MoreHorizontal,
    ChevronLeft,
    ChevronRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { format } from "date-fns";

import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminUsersPage() {
    const router = useRouter();
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState("");
    const limit = 10;

    const { data: usersResponse, isLoading } = useQuery({
        queryKey: ["admin-users", page, searchQuery],
        queryFn: async () => {
            const { data } = await adminApi.getUsers(page, limit, searchQuery);
            return data;
        },
    });

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
                    <p className="text-muted-foreground">
                        Manage all registered users and their permissions.
                    </p>
                </div>
                <Button className="gap-2">
                    <UserPlus className="h-4 w-4" />
                    Add User
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>All Users</CardTitle>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search users by email..."
                                className="w-[200px] lg:w-[300px] pl-8 h-9"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 border-b">
                                <tr>
                                    <th className="p-4 text-left font-medium">User</th>
                                    <th className="p-4 text-left font-medium">Contact</th>
                                    <th className="p-4 text-left font-medium">Role</th>
                                    <th className="p-4 text-left font-medium">Joined</th>
                                    <th className="p-4 text-right font-medium"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
                                            Loading users...
                                        </td>
                                    </tr>
                                ) : (
                                    (usersResponse?.users || []).map((user) => (
                                        <tr key={user.id} className="border-b transition-colors hover:bg-muted/50">
                                            <td className="p-4 align-middle font-medium">
                                                {user.email}
                                            </td>
                                            <td className="p-4 align-middle">
                                                <div className="flex flex-col text-xs gap-1">
                                                    <span className="flex items-center gap-1">
                                                        <Mail className="h-3 w-3" /> {user.email}
                                                    </span>
                                                    {user.phoneNumber && (
                                                        <span className="flex items-center gap-1">
                                                            <Phone className="h-3 w-3" /> {user.phoneNumber}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 align-middle capitalize">
                                                <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                                                    {user.role}
                                                </Badge>
                                            </td>
                                            <td className="p-4 align-middle text-muted-foreground">
                                                {format(new Date(user.createdAt), "MMM d, yyyy")}
                                            </td>
                                             <td className="p-4 align-middle text-right">
                                                 <Button 
                                                     variant="outline" 
                                                     size="sm" 
                                                     className="h-8 px-4 text-xs font-medium"
                                                     asChild
                                                 >
                                                     <Link href={`/admin/users/${user.id}`}>
                                                         View
                                                     </Link>
                                                 </Button>
                                             </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {usersResponse?.pagination && (
                        <div className="flex items-center justify-between px-2 py-4 border-t mt-4">
                            <div className="text-sm text-muted-foreground">
                                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, usersResponse.pagination.total)} of {usersResponse.pagination.total} users
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1 || isLoading}
                                    className="gap-1"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    Previous
                                </Button>
                                <div className="flex items-center justify-center min-w-[32px] text-sm font-medium">
                                    {page} / {usersResponse.pagination.totalPages}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(p => Math.min(usersResponse.pagination.totalPages, p + 1))}
                                    disabled={page === usersResponse.pagination.totalPages || isLoading}
                                    className="gap-1"
                                >
                                    Next
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

function Badge({ children, variant }: { children: React.ReactNode, variant?: "default" | "secondary" }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${variant === "default" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}>
            {children}
        </span>
    );
}
