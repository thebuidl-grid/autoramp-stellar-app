"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { adminApi } from "@/lib/api";
import { Loader2 } from "lucide-react";

/**
 * Admin Protected Component
 * 
 * Ensures that children are only rendered if the user is an authenticated administrator.
 * Redirects to home page or login if not authorized.
 */
export function AdminProtected({ children }: { children: React.ReactNode }) {
    const { user, token, _hasHydrated, setAuth, logout } = useAuthStore();
    const router = useRouter();
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);

    useEffect(() => {
        if (!_hasHydrated) return;

        if (!token) {
            router.push("/auth/admin/login");
            return;
        }

        // If we have a user and they are NOT an admin, get them out of here immediately
        if (user && user.role !== "ADMIN") {
            router.push("/");
            return;
        }

        // If already authorized, no need to verify again during this component's lifecycle
        if (isAuthorized) return;

        // If we have a user and they ARE an admin, or we have a token but no user yet
        // (the latter happens if AuthProvider hasn't restored the user yet),
        // we should verify with the admin-specific endpoint.
        if ((!user || user.role === "ADMIN") && !isVerifying) {
            setIsVerifying(true);
            adminApi.getMe()
                .then((response) => {
                    const adminUser = {
                        id: response.data.id,
                        email: response.data.email,
                        role: "ADMIN",
                        firstName: (response.data as any).firstName,
                        lastName: (response.data as any).lastName,
                    };
                    setAuth(adminUser as any, token);
                    setIsAuthorized(true);
                })
                .catch(() => {
                    // If the admin/me check fails, they are not a valid admin session
                    logout();
                    router.push("/auth/admin/login");
                })
                .finally(() => {
                    setIsVerifying(false);
                });
        }
    }, [_hasHydrated, user, token, router, setAuth, isAuthorized, isVerifying, logout]);

    if (!_hasHydrated || isVerifying || (!isAuthorized && (token && user?.role === "ADMIN"))) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!isAuthorized) {
        return null;
    }

    return <>{children}</>;
}
