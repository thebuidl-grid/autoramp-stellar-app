"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuthStore, useIsAuthenticated } from "@/lib/store";
import { useMerchantStatus, useOtcStatus } from "@/lib/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User } from "lucide-react";

interface HeaderProps {
  onOpenAuthModal?: () => void;
}

export function Header({ onOpenAuthModal }: HeaderProps) {
  const isAuthenticated = useIsAuthenticated();
  const { user, logout, updateUser } = useAuthStore();
  const router = useRouter();


  const { data: merchantStatus } = useMerchantStatus();
  const { data: otcStatus, isOTCEnabled, isOnboarded } = useOtcStatus();

  const otcLink = isOTCEnabled 
    ? (isOnboarded ? "/otc/trade" : "/otc/onboarding")
    : null;


  // Sync merchant status to store when fetched
  useEffect(() => {
    if (merchantStatus) {
      const isVerifiedMerchant = (merchantStatus as any).onboardingStaus === "VERIFIED";
      if (user && user.isMerchant !== isVerifiedMerchant) {
        updateUser({
          isMerchant: isVerifiedMerchant,
        });
      }
    }
  }, [merchantStatus, user?.id, user?.isMerchant, updateUser]);

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const handleGetStarted = (e: React.MouseEvent) => {
    if (onOpenAuthModal) {
      e.preventDefault();
      onOpenAuthModal();
    }
  };


  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="mx-6 mt-2 lg:mt-6">
        <div className="max-w-4xl mx-auto py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <div className="flex items-center gap-3">
                <Image src="/logo.png" alt="AutoRamp" width={32} height={32} />
                <span className="font-bold text-xl tracking-tight">
                  Auto<span className="text-secondary">Ramp</span>
                </span>
              </div>
            </Link>
            <nav className="hidden md:flex items-center gap-8 border border-white/10 backdrop-blur-lg py-4 px-6 rounded-full">
              {isAuthenticated && (
                <Link
                  href="/history"
                  className="text-sm text-white/60 hover:text-secondary transition-colors duration-300"
                >
                  History
                </Link>
              )}
              {isAuthenticated && otcLink && (
                <Link
                  href={otcLink}
                  className="text-sm text-white/60 hover:text-secondary transition-colors duration-300"
                >
                  OTC
                </Link>
              )}
              {isAuthenticated && user?.isMerchant && (
                <Link
                  href="/merchant/dashboard"
                  className="text-sm text-white/60 hover:text-secondary transition-colors duration-300"
                >
                  Merchant Dashboard
                </Link>
              )}
              <Link
                href="/docs"
                className="text-sm text-white/60 hover:text-secondary transition-colors duration-300"
              >
                API Docs
              </Link>
              <a
                href="mailto:dev@thebuidlgrid.org"
                className="text-sm text-white/60 hover:text-secondary transition-colors duration-300"
              >
                Support
              </a>
            </nav>
            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center justify-center w-10 h-10 rounded-full bg-black/5 hover:bg-white/20 border border-white/10 transition-colors">
                      <User size={18} className="text-white" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem asChild>
                      <Link href="/history" className="cursor-pointer">
                        History
                      </Link>
                    </DropdownMenuItem>
                    {otcLink && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href={otcLink} className="cursor-pointer">
                            OTC {isOnboarded ? "Trade" : "Onboarding"}
                          </Link>
                        </DropdownMenuItem>
                        {isOnboarded && (
                          <DropdownMenuItem asChild>
                            <Link href="/otc/history" className="cursor-pointer">
                              OTC History
                            </Link>
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                    <DropdownMenuItem asChild>
                      <Link href="/profile" className="cursor-pointer">
                        Profile
                      </Link>
                    </DropdownMenuItem>
                    {user?.isMerchant && (
                      <DropdownMenuItem asChild>
                        <Link href="/merchant/dashboard" className="cursor-pointer">
                          Merchant Dashboard
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="cursor-pointer text-red-400 focus:text-red-400"
                    >
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Link href="/auth/signup" onClick={handleGetStarted}>
                  <Button
                    size="sm"
                    className="py-6 px-6 text-base font-light rounded-full"
                  >
                    Login/Sign up
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
