"use client";

import { useOtcStatus } from "@/lib/hooks";
import { useAuthStore, useIsAuthenticated } from "@/lib/store";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { OtcSidebar } from "@/components/otc/layout/OtcSidebar";
import { cn } from "@/lib/utils";

export default function OtcLayout({ children }: { children: React.ReactNode }) {
    const isAuthenticated = useIsAuthenticated();
    const { _hasHydrated } = useAuthStore();
    const router = useRouter();
    const pathname = usePathname();
    const { isOTCEnabled, isOnboarded, isLoading: isOtcLoading } = useOtcStatus();

    useEffect(() => {
        if (!_hasHydrated || isOtcLoading) return;

        if (!isAuthenticated) {
            router.push("/auth/login");
            return;
        }

        if (!isOTCEnabled) {
            router.push("/");
            return;
        }

        // Logic Table redirections
        if (isOnboarded && pathname === "/otc/onboarding") {
            router.push("/otc/dashboard");
        } else if (!isOnboarded && pathname !== "/otc/onboarding") {
            router.push("/otc/onboarding");
        }
    }, [_hasHydrated, isAuthenticated, isOtcLoading, isOTCEnabled, isOnboarded, router, pathname]);

    if (!_hasHydrated || isOtcLoading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
            </div>
        );
    }

    if (!isAuthenticated || !isOTCEnabled) {
        return null;
    }

    // Double check specific route access to avoid flicker
    if (isOnboarded && pathname === "/otc/onboarding") return null;
    if (!isOnboarded && pathname !== "/otc/onboarding") return null;

    const showSidebar = pathname !== "/otc/onboarding";

    return (
        <div className="flex min-h-screen bg-black/30">
            {showSidebar && <OtcSidebar />}
            <main className={cn(
                "flex-1 transition-all duration-300",
                showSidebar ? "lg:ml-64 p-6 lg:p-10" : "w-full"
            )}>
                <div className={cn("mx-auto", showSidebar ? "max-w-7xl" : "")}>
                    {children}
                </div>
            </main>
        </div>
    );
}
