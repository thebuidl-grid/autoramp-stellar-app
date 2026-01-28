"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Key, BarChart3, Settings, Menu, X, LogOut } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

const sidebarLinks = [
    { name: "Dashboard", href: "/merchant/dashboard", icon: LayoutDashboard },
    { name: "API Keys", href: "/merchant/dashboard/api-keys", icon: Key },
    { name: "Transactions", href: "/merchant/dashboard/transactions", icon: BarChart3 },
    { name: "Settings", href: "/merchant/dashboard/settings", icon: Settings },
];

export function MerchantSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    const handleLogout = () => {
        if (typeof window !== "undefined") {
            localStorage.removeItem("token");
            localStorage.removeItem("auth-storage");
        }
        router.push("/merchant/login");
    };

    return (
        <>
            {/* Mobile Menu Button */}
            <div className="lg:hidden fixed top-4 left-4 z-50">
                <Button variant="outline" size="icon" onClick={() => setIsMobileOpen(!isMobileOpen)}>
                    {isMobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                </Button>
            </div>

            {/* Sidebar */}
            <div className={cn(
                "fixed inset-y-0 left-0 z-40 w-64 bg-card border-r transition-transform duration-300 transform lg:translate-x-0",
                isMobileOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="flex flex-col h-full p-6">
                    <div className="flex items-center gap-2 mb-10 px-2">
                        <div className="h-8 w-8 rounded-full bg-black text-white flex items-center justify-center font-bold">M</div>
                        <span className="font-bold text-xl tracking-tight">
                            Auto<span className="text-secondary">Merchant</span>
                        </span>
                    </div>

                    <nav className="flex-1 space-y-2">
                        {sidebarLinks.map((link) => {
                            const Icon = link.icon;
                            const isActive = pathname === link.href;
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium",
                                        isActive
                                            ? "bg-primary text-primary-foreground shadow-sm"
                                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                    )}
                                    onClick={() => setIsMobileOpen(false)}
                                >
                                    <Icon className="h-4 w-4" />
                                    {link.name}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="mt-auto pt-6 border-t">
                        <Button
                            variant="ghost"
                            className="w-full justify-start text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                            onClick={handleLogout}
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            Logout
                        </Button>
                    </div>
                </div>
            </div>

            {/* Overlay for mobile */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}
        </>
    );
}
