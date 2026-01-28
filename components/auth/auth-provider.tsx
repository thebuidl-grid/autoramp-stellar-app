"use client";

import { useEffect } from "react";
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

  useEffect(() => {
    // Mark as hydrated once component mounts
    if (!_hasHydrated) {
      setHasHydrated(true);
    }
  }, [_hasHydrated, setHasHydrated]);

  useEffect(() => {
    // Only run after hydration
    if (!_hasHydrated) return;

    // Check if we have a token (page refresh scenario)
    if (token) {
      // SKIP profile fetch if we are in onboarding/KYB flow
      // This prevents 401 from clearing the session for merchants with restricted onboarding tokens
      const isOnboardingRoute = pathname?.startsWith("/merchant/kyb") || pathname?.startsWith("/merchant/onboarding");

      if (isOnboardingRoute) {
        return;
      }

      // Always fetch latest profile on startup to ensure state (like isMerchant) is fresh
      userApi
        .getProfile()
        .then((response) => {
          // restored or refreshed auth state
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
          logout();
          if (!pathname?.startsWith("/auth")) {
            router.push("/");
          }
        });
    } else if (!pathname?.startsWith("/auth") && !pathname?.startsWith("/admin") && !pathname?.startsWith("/merchant") && !pathname?.startsWith("/docs") && pathname !== "/") {
      // No token and not on auth page or admin page or merchant page or docs, redirect to home
      router.push("/");
    }
  }, [token, _hasHydrated, setAuth, logout, router, pathname]); // Removed user from deps to avoid infinite loop if user object changes slightly

  return <>{children}</>;
}

