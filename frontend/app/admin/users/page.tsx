"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { useAllUsers } from "@/lib/hooks";
import { formatDate } from "@/lib/utils";
import { Users, Search, User } from "lucide-react";

export default function AdminUsersPage() {
  const { data, isLoading } = useAllUsers(1, 100);
  const allUsers = data?.users || [];
  const [search, setSearch] = useState("");

  const filteredUsers = allUsers.filter(
    (user) =>
      user.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in">
      <Header 
        title="User Management"
        description="View and manage all registered users"
      />

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users size={20} />
            All Users
          </CardTitle>
          <CardDescription>
            {filteredUsers.length} users found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="mx-auto mb-4 text-muted-foreground" size={48} />
              <h3 className="font-semibold mb-1">No Users Found</h3>
              <p className="text-sm text-muted-foreground">
                {search ? "Try a different search term" : "No users have registered yet"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold text-sm">User</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Email</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Role</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-border hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                            <User size={16} className="text-muted-foreground" />
                          </div>
                          <span className="font-medium">{user.email}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm capitalize">{user.role?.toLowerCase()}</span>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

