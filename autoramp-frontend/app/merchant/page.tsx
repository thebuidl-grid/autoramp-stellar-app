"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { useIsOnboarded } from "@/lib/hooks/use-auth";

export default function MerchantRootPage() {
    const router = useRouter();
    const { user, token, _hasHydrated } = useAuthStore();
    const { data: onboardedStatus, isLoading: isOnboardingCheckLoading } = useIsOnboarded();

    useEffect(() => {
        if (!_hasHydrated) return;

        // Wait for onboarding check if we have a user
        if (user && isOnboardingCheckLoading) return;

        if (!user || !token) {
            router.replace("/merchant/login");
        } else if (!user.isMerchant) {
            router.replace("/");
        } else if (onboardedStatus?.isOnboarded === false) {
            router.replace("/merchant/onboarding");
        } else {
            if (onboardedStatus?.isOnboarded) {
                router.replace("/merchant/dashboard");
            }
        }
    }, [user, token, _hasHydrated, router, onboardedStatus, isOnboardingCheckLoading]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-black">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        </div>
    );
}
