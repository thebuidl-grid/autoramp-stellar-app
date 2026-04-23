"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { userApi } from "@/lib/api";

/**
 * Auth Provider Component
 * 
 * Handles authentication state hydration and token validation on app load.
 * This ensures users stay logged in after page refresh.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, user, setAuth, logout, _hasHydrated, setHasHydrated } = useAuthStore();
  const lastFetchedToken = useRef<string | null>(null);

  useEffect(() => {
    // Mark as hydrated once component mounts
    if (!_hasHydrated) {
      setHasHydrated(true);
    }
  }, [_hasHydrated, setHasHydrated]);

  useEffect(() => {
    // Only run after hydration
    if (!_hasHydrated) return;

    // If no token, clear memory and redirect if needed
    if (!token) {
      lastFetchedToken.current = null;
      if (!pathname?.startsWith("/auth") && !pathname?.startsWith("/admin") && !pathname?.startsWith("/merchant") && !pathname?.startsWith("/docs") && pathname !== "/") {
        router.push("/");
      }
      return;
    }

    // SKIP profile fetch if we are in onboarding/KYB flow
    const isOnboardingRoute = pathname?.startsWith("/merchant/kyb") || pathname?.startsWith("/merchant/onboarding");
    if (isOnboardingRoute) {
      return;
    }

    // If we've already fetched for this token, don't fetch again on navigation
    if (lastFetchedToken.current === token) {
      return;
    }

    // Fetch latest profile on startup or login
    userApi
      .getProfile()
      .then((response) => {
        lastFetchedToken.current = token;
        setAuth(
          {
            id: response.data.id,
            email: response.data.email,
            role: response.data.role,
            phoneNumber: (response.data as any).phoneNumber,
            walletAddress: (response.data as any).walletAddress,
            isMerchant: response.data.isMerchant,
          } as any,
          token
        );
      })
      .catch(() => {
        // Token is invalid, clear auth
        lastFetchedToken.current = null;
        logout();
        if (!pathname?.startsWith("/auth")) {
          router.push("/");
        }
      });
  }, [token, _hasHydrated, setAuth, logout, router, pathname]);

  return <>{children}</>;
}

