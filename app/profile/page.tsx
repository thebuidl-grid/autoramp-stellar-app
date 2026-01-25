"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { useAuthStore, useIsAuthenticated } from "@/lib/store";
import { useProfile } from "@/lib/hooks/use-user";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Mail, Phone, Wallet, Building2, CreditCard } from "lucide-react";
import { SavedAccountsManager } from "@/components/profile/SavedAccountsManager";
import { SavedWalletsManager } from "@/components/profile/SavedWalletsManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Profile Page
 * 
 * Displays user profile information and manages saved accounts and wallets.
 */
export default function ProfilePage() {
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const { _hasHydrated, user: storeUser } = useAuthStore();
  const { data: profile, isLoading } = useProfile();
  const [activeTab, setActiveTab] = useState("profile");

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
        <div className="max-w-6xl mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Account Settings</h1>
            <p className="text-white/60">Manage your profile and saved payment methods</p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-zinc-900 border border-zinc-800">
              <TabsTrigger value="profile" className="data-[state=active]:bg-zinc-800">
                <User className="w-4 h-4 mr-2" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="accounts" className="data-[state=active]:bg-zinc-800">
                <Building2 className="w-4 h-4 mr-2" />
                Saved Accounts
              </TabsTrigger>
              <TabsTrigger value="wallets" className="data-[state=active]:bg-zinc-800">
                <CreditCard className="w-4 h-4 mr-2" />
                Saved Wallets
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-4">
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
            </TabsContent>

            <TabsContent value="accounts">
              <div className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
                <SavedAccountsManager />
              </div>
            </TabsContent>

            <TabsContent value="wallets">
              <div className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
                <SavedWalletsManager />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

