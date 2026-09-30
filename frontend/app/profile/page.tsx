"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { useAuthStore, useIsAuthenticated } from "@/lib/store";
import { useProfile } from "@/lib/hooks/use-user";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Mail, Phone, Wallet } from "lucide-react";

/**
 * Profile Page
 * 
 * Displays user profile information including email, phone number, and wallet address.
 */
export default function ProfilePage() {
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const { _hasHydrated, user: storeUser } = useAuthStore();
  const { data: profile, isLoading } = useProfile();

  // Redirect to home if not authenticated (after hydration)
  useEffect(() => {
    if (_hasHydrated && !isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, _hasHydrated, router]);

  // Show loading while hydrating or checking auth
  if (!_hasHydrated || !isAuthenticated) {
    return null;
  }

  // Use profile data if available, otherwise fall back to store user
  const user = profile || storeUser;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="pt-32 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Profile</h1>
            <p className="text-white/60">Manage your account information</p>
          </div>

          <div className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
            {isLoading ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24 bg-white/10" />
                  <Skeleton className="h-12 w-full bg-white/10" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24 bg-white/10" />
                  <Skeleton className="h-12 w-full bg-white/10" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24 bg-white/10" />
                  <Skeleton className="h-12 w-full bg-white/10" />
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Email */}
                <div className="space-y-2">
                  <label className="text-sm text-white/70 flex items-center gap-2">
                    <Mail size={16} />
                    Email Address
                  </label>
                  <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white">
                    {user?.email || "—"}
                  </div>
                </div>

                {/* Phone Number */}
                <div className="space-y-2">
                  <label className="text-sm text-white/70 flex items-center gap-2">
                    <Phone size={16} />
                    Phone Number
                  </label>
                  <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white">
                    {user?.phoneNumber || "Not provided"}
                  </div>
                </div>

                {/* Wallet Address */}
                <div className="space-y-2">
                  <label className="text-sm text-white/70 flex items-center gap-2">
                    <Wallet size={16} />
                    Wallet Address
                  </label>
                  <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-sm break-all">
                    {user?.walletAddress || "Not connected"}
                  </div>
                </div>

                {/* User ID (for debugging/admin purposes) */}
                {user?.id && (
                  <div className="space-y-2">
                    <label className="text-sm text-white/70 flex items-center gap-2">
                      <User size={16} />
                      User ID
                    </label>
                    <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-sm">
                      {user.id}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

