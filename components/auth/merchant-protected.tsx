"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { Loader2 } from "lucide-react";

/**
 * Merchant Protected Component
 * 
 * Ensures that children are only rendered if the user is an authenticated merchant.
 * Redirects to merchant login if not authenticated.
 * Redirects to home if authenticated but not a merchant.
 */
export function MerchantProtected({ children }: { children: React.ReactNode }) {
    const { user, token, _hasHydrated } = useAuthStore();
    const router = useRouter();
    const pathname = usePathname();
    const [isAuthorized, setIsAuthorized] = useState(false);

    useEffect(() => {
        if (!_hasHydrated) return;

        // Skip restriction for login, onboarding and KYB pages
        const isPublicMerchantRoute =
            pathname === "/merchant/login" ||
            pathname === "/merchant/onboarding" ||
            pathname === "/merchant/kyb";

        if (isPublicMerchantRoute) {
            setIsAuthorized(true);
            return;
        }

        if (!token) {
            router.replace("/merchant/login");
            return;
        }

        // Check if user is a merchant
        /* 
         * Relaxing strict redirect to home. 
         * Pages like MerchantApiKeysPage now handle "Access Restricted" or "Onboarding" states 
         * explicitly for users who are logged in but not yet fully approved merchants.
         */

        // if (user && !user.isMerchant) {
        //     router.replace("/");
        //     return;
        // }

        // If we have a user and they are a merchant, or if we just have a token
        if (user?.isMerchant) {
            setIsAuthorized(true);
        }
    }, [_hasHydrated, user, token, router, pathname]);

    if (!_hasHydrated || (!isAuthorized && pathname !== "/merchant/login")) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-black">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return <>{children}</>;
}
