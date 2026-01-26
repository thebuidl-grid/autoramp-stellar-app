"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";

export default function MerchantRootPage() {
    const router = useRouter();
    const { user, token, _hasHydrated } = useAuthStore();

    useEffect(() => {
        if (!_hasHydrated) return;

        if (!user || !token) {
            router.replace("/merchant/login");
        } else if (!user.isOnboarded) {
            router.replace("/merchant/onboarding");
        } else {
            router.replace("/merchant/dashboard");
        }
    }, [user, token, _hasHydrated, router]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-black">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        </div>
    );
}
