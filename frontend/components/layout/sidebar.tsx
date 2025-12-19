"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore, useUIStore } from "@/lib/store";
import {
  LayoutDashboard,
  ArrowUpRight,
  ArrowDownLeft,
  Key,
  User,
  Settings,
  LogOut,
  Shield,
  Users,
  Menu,
  X,
} from "lucide-react";

const userNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/onramp", label: "Buy Crypto", icon: ArrowDownLeft },
  { href: "/dashboard/offramp", label: "Sell Crypto", icon: ArrowUpRight },
];

const adminNavItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/api-keys", label: "API Keys", icon: Key },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuthStore();
  const { isSidebarOpen, toggleSidebar } = useUIStore();

  const navItems = isAdmin ? adminNavItems : userNavItems;

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={toggleSidebar}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-background border border-border"
      >
        {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen w-64 bg-background border-r border-border transition-transform duration-300 ease-in-out",
          "lg:translate-x-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-6 border-b border-border">
            <div className="w-10 h-10 rounded-lg bg-foreground flex items-center justify-center">
              <span className="text-background font-black text-lg">A</span>
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight">AutoRamp</h1>
              <p className="text-xs text-muted-foreground">
                {isAdmin ? "Admin Panel" : "Dashboard"}
              </p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    if (window.innerWidth < 1024) toggleSidebar();
                  }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User info & Logout */}
          <div className="px-4 py-4 border-t border-border">
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted mb-3">
              <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center">
                <span className="text-background text-sm font-bold">
                  {user?.email?.[0]?.toUpperCase() || "U"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.email}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {user?.role?.toLowerCase()}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                window.location.href = "/auth/signin";
              }}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

