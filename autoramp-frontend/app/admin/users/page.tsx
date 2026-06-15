"use client";

import { useState, useEffect } from "react";
import {
    Users,
    Search,
    UserPlus,
    Mail,
    Phone,
    Wallet,
    MoreHorizontal,
    ChevronLeft,
    ChevronRight,
    XCircle,
    CheckCircle2,
    Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { useDebounce } from "@/lib/hooks";
import { format } from "date-fns";

import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminUsersPage() {
    const router = useRouter();
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [roleFilter, setRoleFilter] = useState<string>("all");
    const debouncedSearchQuery = useDebounce(searchQuery, 500);
    const limit = 10;

    const { data: usersResponse, isLoading, isFetching } = useQuery({
        queryKey: ["admin-users", page, debouncedSearchQuery, statusFilter, roleFilter],
        queryFn: async () => {
            const status = statusFilter === "all" ? undefined : statusFilter;
            const role = roleFilter === "all" ? undefined : roleFilter;
            const { data } = await adminApi.getUsers(page, limit, debouncedSearchQuery, status, role);
            return data;
        },
    });

    // Reset to page 1 when search or filter changes
    useEffect(() => {
        setPage(1);
    }, [debouncedSearchQuery, statusFilter, roleFilter]);

    const filteredUsers = (usersResponse?.users || [])
        .filter(user => {
            if (statusFilter === "active") return !user.suspended;
            if (statusFilter === "suspended") return !!user.suspended;
            return true;
        })
        .filter(user => {
            if (roleFilter === "admin") return user.role?.toLowerCase() === "admin";
            if (roleFilter === "user") return user.role?.toLowerCase() !== "admin";
            return true;
        });

    const serverIgnoredRoleFilter = roleFilter !== "all" && (usersResponse?.users || []).some(user => {
        if (roleFilter === "admin") return user.role?.toLowerCase() !== "admin";
        if (roleFilter === "user") return user.role?.toLowerCase() === "admin";
        return false;
    });

    const displayTotal = serverIgnoredRoleFilter ? filteredUsers.length : usersResponse?.pagination.total || 0;
    const displayTotalPages = serverIgnoredRoleFilter ? 1 : usersResponse?.pagination.totalPages || 1;
    
    // Using filteredUsers.length check to ensure when 0 users are found, we say 0 to 0 instead of 1 to 0
    const startIndex = filteredUsers.length > 0 ? (serverIgnoredRoleFilter ? 1 : ((page - 1) * limit) + 1) : 0;
    const endIndex = serverIgnoredRoleFilter ? filteredUsers.length : Math.min(page * limit, displayTotal);

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
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <CardTitle>All Users</CardTitle>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex bg-muted p-1 rounded-md text-xs font-medium">
                                <button 
                                    onClick={() => setStatusFilter("all")}
                                    className={`px-3 py-1.5 rounded-sm transition-colors ${statusFilter === "all" ? "bg-background shadow-sm" : "hover:text-foreground"}`}
                                >
                                    All
                                </button>
                                <button 
                                    onClick={() => setStatusFilter("active")}
                                    className={`px-3 py-1.5 rounded-sm transition-colors ${statusFilter === "active" ? "bg-background shadow-sm text-green-500" : "hover:text-foreground"}`}
                                >
                                    Active
                                </button>
                                <button 
                                    onClick={() => setStatusFilter("suspended")}
                                    className={`px-3 py-1.5 rounded-sm transition-colors ${statusFilter === "suspended" ? "bg-background shadow-sm text-red-500" : "hover:text-foreground"}`}
                                >
                                    Suspended
                                </button>
                            </div>
                            <div className="flex bg-muted p-1 rounded-md text-xs font-medium">
                                <button 
                                    onClick={() => setRoleFilter("all")}
                                    className={`px-3 py-1.5 rounded-sm transition-colors ${roleFilter === "all" ? "bg-background shadow-sm" : "hover:text-foreground"}`}
                                >
                                    All Roles
                                </button>
                                <button 
                                    onClick={() => setRoleFilter("admin")}
                                    className={`px-3 py-1.5 rounded-sm transition-colors ${roleFilter === "admin" ? "bg-background shadow-sm text-primary" : "hover:text-foreground"}`}
                                >
                                    Admins
                                </button>
                                <button 
                                    onClick={() => setRoleFilter("user")}
                                    className={`px-3 py-1.5 rounded-sm transition-colors ${roleFilter === "user" ? "bg-background shadow-sm text-foreground" : "hover:text-foreground"}`}
                                >
                                    Users
                                </button>
                            </div>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="search"
                                    placeholder="Search users..."
                                    className="w-[200px] lg:w-[250px] pl-8 pr-8 h-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                {isFetching && (
                                    <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground animate-spin" />
                                )}
                            </div>
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
                                     <th className="p-4 text-left font-medium">Status</th>
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
                                    filteredUsers.map((user) => (
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
                                                 <Badge variant={user.role?.toLowerCase() === "admin" ? "default" : "secondary"}>
                                                     {user.role}
                                                 </Badge>
                                             </td>
                                             <td className="p-4 align-middle">
                                                 {user.suspended ? (
                                                     <div className="flex items-center gap-1.5 text-red-500 font-medium text-xs">
                                                         <XCircle className="h-3.5 w-3.5" />
                                                         Suspended
                                                     </div>
                                                 ) : (
                                                     <div className="flex items-center gap-1.5 text-green-500 font-medium text-xs">
                                                         <CheckCircle2 className="h-3.5 w-3.5" />
                                                         Active
                                                     </div>
                                                 )}
                                             </td>
                                             <td className="p-4 align-middle text-muted-foreground text-xs">
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
                                Showing {startIndex} to {endIndex} of {displayTotal} users
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
                                    {serverIgnoredRoleFilter ? 1 : page} / {displayTotalPages}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(p => Math.min(displayTotalPages, p + 1))}
                                    disabled={page === displayTotalPages || isLoading || serverIgnoredRoleFilter}
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
