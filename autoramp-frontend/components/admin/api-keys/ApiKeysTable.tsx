"use client";

import { format } from "date-fns";
import { Trash2, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiKey } from "@/lib/api";

interface ApiKeysTableProps {
    apiKeys: ApiKey[];
    onRevoke: (id: string) => void;
}

export function ApiKeysTable({ apiKeys, onRevoke }: ApiKeysTableProps) {
    return (
        <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[150px]">
                            Key (Prefix)
                        </th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                            Owner / Business
                        </th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                            Usage
                        </th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[100px]">
                            Status
                        </th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[120px]">
                            Created
                        </th>
                        <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground w-[80px]">
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                    {apiKeys.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                No API keys found.
                            </td>
                        </tr>
                    ) : (
                        apiKeys.map((key) => (
                            <tr
                                key={key.id}
                                className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                            >
                                <td className="p-4 align-middle font-mono font-medium">
                                    {key.keyPrefix}...
                                </td>
                                <td className="p-4 align-middle">
                                    <div className="flex flex-col">
                                        <span className="font-medium">{key.name || "Default Key"}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {key.user?.email || "Unknown User"}
                                        </span>
                                        {(key as any).metadata?.businessName && (
                                            <span className="text-xs text-blue-600 dark:text-blue-400">
                                                Business: {(key as any).metadata.businessName}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4 align-middle">
                                    <div className="flex flex-col text-xs">
                                        <span>Last used: {key.lastUsedAt ? format(new Date(key.lastUsedAt), "MMM d, HH:mm") : "Never"}</span>
                                        {(key as any).metadata?.trafficEstimate && (
                                            <span className="text-muted-foreground">Est. Traffic: {(key as any).metadata.trafficEstimate}</span>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4 align-middle">
                                    <Badge variant={key.isActive ? "success" : "default"}>
                                        {key.isActive ? "Active" : "Revoked"}
                                    </Badge>
                                </td>
                                <td className="p-4 align-middle text-muted-foreground">
                                    {format(new Date(key.createdAt), "MMM d, yyyy")}
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
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                className="text-red-600 focus:text-red-600 cursor-pointer"
                                                onClick={() => onRevoke(key.id)}
                                                disabled={!key.isActive}
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Revoke Key
                                            </DropdownMenuItem>
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
