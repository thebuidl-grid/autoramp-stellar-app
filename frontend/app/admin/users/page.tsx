"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    ChevronLeft,
    ChevronRight,
    MoreHorizontal,
    Search,
    User as UserIcon
} from "lucide-react";
import { format } from "date-fns";
import { adminApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function UsersPage() {
    const [page, setPage] = useState(1);
    const limit = 10;

    const { data, isLoading, error } = useQuery({
        queryKey: ["adminUsers", page],
        queryFn: () => adminApi.getUsers(page, limit),
    });

    const users = data?.data.users || [];
    const pagination = data?.data.pagination;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Users</h2>
                    <p className="text-muted-foreground">
                        Manage user accounts and view details.
                    </p>
                </div>
                {/* Placeholder for search/filter if needed later */}
                <div className="flex w-full max-w-sm items-center space-x-2">
                    <Input type="email" placeholder="Search users (coming soon)..." disabled />
                    <Button type="submit" disabled>
                        <Search className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>All Users</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-2">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                            ))}
                        </div>
                    ) : error ? (
                        <div className="text-red-500">Error loading users.</div>
                    ) : (
                        <>
                            <div className="relative w-full overflow-auto">
                                <table className="w-full caption-bottom text-sm">
                                    <thead className="[&_tr]:border-b">
                                        <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                                                User
                                            </th>
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                                                Role
                                            </th>
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                                                Email
                                            </th>
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                                                Joined
                                            </th>
                                            <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="[&_tr:last-child]:border-0">
                                        {users.map((user) => (
                                            <tr
                                                key={user.id}
                                                className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                                            >
                                                <td className="p-4 align-middle font-medium">
                                                    <div className="flex items-center space-x-2">
                                                        <div className="bg-blue-100 dark:bg-blue-900 rounded-full p-2">
                                                            <UserIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                        </div>
                                                        <span className="truncate max-w-[150px]" title={user.id}>
                                                            {user.id.substring(0, 8)}...
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-4 align-middle">
                                                    <Badge variant={user.role === "ADMIN" ? "destructive" : "secondary"}>
                                                        {user.role}
                                                    </Badge>
                                                </td>
                                                <td className="p-4 align-middle">{user.email}</td>
                                                <td className="p-4 align-middle">
                                                    {format(new Date(user.createdAt), "MMM d, yyyy")}
                                                </td>
                                                <td className="p-4 align-middle text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <span className="sr-only">Open menu</span>
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                            <DropdownMenuItem
                                                                onClick={() => navigator.clipboard.writeText(user.id)}
                                                            >
                                                                Copy User ID
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem disabled>View Details</DropdownMenuItem>
                                                            <DropdownMenuItem disabled>Manage API Keys</DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className="flex items-center justify-end space-x-2 py-4">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    Previous
                                </Button>
                                <div className="text-sm font-medium">
                                    Page {pagination?.page} of {pagination?.totalPages}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.min(pagination?.totalPages || 1, p + 1))}
                                    disabled={page >= (pagination?.totalPages || 1)}
                                >
                                    Next
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
