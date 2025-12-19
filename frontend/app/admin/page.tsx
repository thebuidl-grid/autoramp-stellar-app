"use client";

import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAllUsers } from "@/lib/hooks";
import { Users, Key } from "lucide-react";

export default function AdminDashboardPage() {
  const { data, isLoading: loadingUsers } = useAllUsers(1, 1);
  const totalUsers = data?.pagination?.total || 0;

  return (
    <div className="animate-fade-in">
      <Header 
        title="Admin Dashboard"
        description="Manage users and API keys"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-foreground text-background flex items-center justify-center">
                <Users size={24} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-3xl font-bold">
                  {loadingUsers ? "-" : totalUsers}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/admin/users">
          <Card className="hover:border-foreground/50 transition-colors cursor-pointer group">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-foreground text-background flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <Users size={24} />
              </div>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                View and manage all registered users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {loadingUsers ? "Loading..." : `${totalUsers} total users`}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/api-keys">
          <Card className="hover:border-foreground/50 transition-colors cursor-pointer group">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-foreground text-background flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <Key size={24} />
              </div>
              <CardTitle>API Key Management</CardTitle>
              <CardDescription>
                Create and manage API keys for users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Manage all API keys
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

