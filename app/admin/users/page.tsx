"use client";

import React, { useState, useEffect } from "react";
import {
    Users,
    Search,
    UserPlus,
    Mail,
    Phone,
    Wallet,
    MoreHorizontal
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog";
import { format } from "date-fns";

export default function AdminUsersPage() {
    const [page, setPage] = useState(1);
    const limit = 10;

    const { data: usersResponse, isLoading } = useQuery({
        queryKey: ["admin-users", page],
        queryFn: async () => {
            const { data } = await adminApi.getUsers(page, limit);
            return data;
        },
    });

    const queryClient = useQueryClient();

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [viewUserId, setViewUserId] = useState<string | null>(null);

    const createUserMutation = useMutation((body: any) => adminApi.createUser(body), {
        onSuccess: () => {
            queryClient.invalidateQueries(["admin-users"]);
            setIsAddOpen(false);
        },
    });

    const updateProfileMutation = useMutation(({ id, data }: { id: string; data: any }) => adminApi.updateUserProfile(id, data), {
        onSuccess: () => queryClient.invalidateQueries(["admin-users"]),
    });

    const suspendMutation = useMutation(({ id, suspended }: { id: string; suspended: boolean }) => adminApi.suspendUser(id, { suspended }), {
        onSuccess: () => queryClient.invalidateQueries(["admin-users"]),
    });

    const flagsMutation = useMutation(({ id, data }: { id: string; data: any }) => adminApi.updateUserFlags(id, data), {
        onSuccess: () => queryClient.invalidateQueries(["admin-users"]),
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
                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2">
                            <UserPlus className="h-4 w-4" />
                            Add User
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add New User</DialogTitle>
                            <DialogDescription>Create a new user account</DialogDescription>
                        </DialogHeader>
                        <AddUserForm
                            onSubmit={(payload) => createUserMutation.mutate(payload)}
                            isLoading={createUserMutation.isLoading}
                        />
                        <DialogFooter>
                            <DialogClose />
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>All Users</CardTitle>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search users..."
                                className="w-[200px] lg:w-[300px] pl-8 h-9"
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
                                    <th className="p-4 text-right font-medium">Actions</th>
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
                                    usersResponse?.users.map((user: any) => (
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
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                    <DropdownMenuItem onClick={() => setViewUserId(user.id)}>View</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => setViewUserId(user.id)}>Edit</DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                                    <DropdownMenuItem className="text-red-500" onClick={() => suspendMutation.mutate({ id: user.id, suspended: true })}>Suspend</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
            <ViewUserDialog userId={viewUserId} onClose={() => setViewUserId(null)} />
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

function AddUserForm({ onSubmit, isLoading }: { onSubmit: (p: any) => void; isLoading?: boolean }) {
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [wallet, setWallet] = useState("");
    const [contactName, setContactName] = useState("");
    const [isMerchant, setIsMerchant] = useState(false);
    const [isApiAccessApproved, setIsApiAccessApproved] = useState(false);

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit({
                    email,
                    phone_number: phone || undefined,
                    wallet_address: wallet || undefined,
                    is_merchant: isMerchant,
                    is_api_access_approved: isApiAccessApproved,
                    contact_name: contactName || undefined,
                });
            }}
            className="grid gap-3 pt-2"
        >
            <div className="grid gap-1">
                <label className="text-sm">Email</label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
            </div>
            <div className="grid gap-1">
                <label className="text-sm">Phone number</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="grid gap-1">
                <label className="text-sm">Wallet address</label>
                <Input value={wallet} onChange={(e) => setWallet(e.target.value)} />
            </div>
            <div className="grid gap-1">
                <label className="text-sm">Contact name</label>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div className="flex items-center gap-4 py-2">
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={isMerchant} onChange={(e) => setIsMerchant(e.target.checked)} />
                    <span>Is Merchant</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={isApiAccessApproved} onChange={(e) => setIsApiAccessApproved(e.target.checked)} />
                    <span>API Access Approved</span>
                </label>
            </div>
            <div className="pt-2 flex justify-end">
                <Button type="submit" disabled={isLoading}>{isLoading ? "Creating..." : "Create"}</Button>
            </div>
        </form>
    );
}

function ViewUserDialog({ userId, onClose }: { userId: string | null; onClose: () => void }) {
    const enabled = Boolean(userId);
    const { data: userResponse, isLoading } = useQuery({
        queryKey: ["admin-user", userId],
        queryFn: async () => {
            if (!userId) return null;
            const { data } = await adminApi.getUserById(userId);
            return data;
        },
        enabled,
    });

    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [wallet, setWallet] = useState("");
    const [contactName, setContactName] = useState("");
    const [isMerchant, setIsMerchant] = useState(false);
    const [isApiAccessApproved, setIsApiAccessApproved] = useState(false);

    const queryClient = useQueryClient();

    const updateProfile = useMutation(({ id, data }: any) => adminApi.updateUserProfile(id, data), {
        onSuccess: () => queryClient.invalidateQueries(["admin-users"]),
    });

    const suspendUser = useMutation(({ id, suspended }: any) => adminApi.suspendUser(id, { suspended }), {
        onSuccess: () => queryClient.invalidateQueries(["admin-users"]),
    });

    const updateFlags = useMutation(({ id, data }: any) => adminApi.updateUserFlags(id, data), {
        onSuccess: () => queryClient.invalidateQueries(["admin-users"]),
    });

    // populate local state when userResponse loads
    useEffect(() => {
        if (userResponse) {
            setEmail(userResponse.email || "");
            setPhone((userResponse as any).phoneNumber || "");
            setWallet((userResponse as any).walletAddress || "");
            setContactName((userResponse as any).contactName || "");
            setIsMerchant(!!(userResponse as any).isMerchant || !!(userResponse as any).is_merchant);
            setIsApiAccessApproved(!!(userResponse as any).isApiAccessApproved || !!(userResponse as any).is_api_access_approved);
        }
    }, [userResponse]);

    return (
        <Dialog open={Boolean(userId)} onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>User details</DialogTitle>
                    <DialogDescription>View and manage user profile and flags</DialogDescription>
                </DialogHeader>

                {isLoading || !userResponse ? (
                    <div className="p-4">Loading...</div>
                ) : (
                    <div className="grid gap-3">
                        <div className="grid gap-1">
                            <label className="text-sm">Email</label>
                            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                        <div className="grid gap-1">
                            <label className="text-sm">Phone</label>
                            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                        </div>
                        <div className="grid gap-1">
                            <label className="text-sm">Wallet</label>
                            <Input value={wallet} onChange={(e) => setWallet(e.target.value)} />
                        </div>
                        <div className="grid gap-1">
                            <label className="text-sm">Contact name</label>
                            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
                        </div>
                        <div className="text-sm text-muted-foreground">Created: {format(new Date((userResponse as any).createdAt), "PPpp")}</div>
                        <div className="text-sm text-muted-foreground">Updated: {format(new Date((userResponse as any).updatedAt), "PPpp")}</div>

                        <div className="flex items-center gap-4 py-2">
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={isMerchant} onChange={(e) => setIsMerchant(e.target.checked)} />
                                <span>Is Merchant</span>
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={isApiAccessApproved} onChange={(e) => setIsApiAccessApproved(e.target.checked)} />
                                <span>API Access Approved</span>
                            </label>
                        </div>

                        <div className="flex gap-2 justify-end">
                            <Button onClick={() => updateProfile.mutate({ id: userId, data: { email, phone_number: phone || undefined, wallet_address: wallet || undefined, contact_name: contactName || undefined } })}>Save profile</Button>
                            <Button onClick={() => updateFlags.mutate({ id: userId, data: { is_merchant: isMerchant, is_api_access_approved: isApiAccessApproved } })}>Update flags</Button>
                            <Button variant="destructive" onClick={() => suspendUser.mutate({ id: userId, suspended: true })}>Suspend</Button>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <DialogClose>Close</DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

