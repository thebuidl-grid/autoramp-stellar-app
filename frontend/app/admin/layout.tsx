"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
    LayoutDashboard,
    Users,
    Key,
    ArrowRightLeft,
    LogOut,
    Menu,
    X
} from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, _hasHydrated, logout } = useAuthStore();
    const { toast } = useToast();
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // Auth Protection
    useEffect(() => {
        if (_hasHydrated) {
            if (!user || user.role !== "ADMIN") {
                toast({
                    title: "Access Denied",
                    description: "You must be an admin to access this area.",
                    variant: "destructive",
                });
                router.push("/");
            }
        }
    }, [user, _hasHydrated, router, toast]);

    if (!_hasHydrated) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
        );
    }

    if (!user || user.role !== "ADMIN") {
        return null; // Will redirect via useEffect
    }

    const navItems = [
        {
            name: "Dashboard",
            href: "/admin",
            icon: LayoutDashboard,
        },
        {
            name: "Users",
            href: "/admin/users",
            icon: Users,
        },
        {
            name: "API Keys",
            href: "/admin/api-keys",
            icon: Key,
        },
        {
            name: "Transactions",
            href: "/admin/transactions",
            icon: ArrowRightLeft,
        },
    ];

    const handleLogout = () => {
        logout();
        router.push("/auth/admin/login");
    };

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex">
            {/* Mobile Sidebar Toggle */}
            <div className="md:hidden fixed top-4 left-4 z-50">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                >
                    {isSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                </Button>
            </div>

            {/* Sidebar */}
            <aside
                className={`
          fixed md:sticky top-0 left-0 z-40
          h-screen w-64 bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800
          transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
            >
                <div className="flex flex-col h-full p-4">
                    <div className="flex items-center justify-center h-16 mb-6">
                        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                            Admin Portal
                        </h1>
                    </div>

                    <nav className="flex-1 space-y-2">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = pathname === item.href;
                            return (
                                <Link key={item.href} href={item.href}>
                                    <div
                                        className={`
                      flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors
                      ${isActive
                                                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                                            }
                    `}
                                    >
                                        <Icon className="h-5 w-5" />
                                        <span className="font-medium">{item.name}</span>
                                    </div>
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
                        <Button
                            variant="ghost"
                            className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10"
                            onClick={handleLogout}
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            Sign Out
                        </Button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-8 md:p-8 pt-20 md:pt-8 min-h-screen overflow-y-auto">
                <div className="max-w-7xl mx-auto space-y-6">
                    {children}
                </div>
            </main>
        </div>
    );
}
