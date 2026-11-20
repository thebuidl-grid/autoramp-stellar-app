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
import { Menu, User } from "lucide-react";
import { NetworkSwitch } from "@/components/layout/network-switch";

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
    ? isOnboarded
      ? "/otc/dashboard"
      : "/otc/onboarding"
    : null;

  // Sync merchant status to store when fetched
  useEffect(() => {
    if (merchantStatus) {
      const isVerifiedMerchant =
        (merchantStatus as any).onboardingStaus === "VERIFIED";
      if (user && user.isMerchant !== isVerifiedMerchant) {
        updateUser({
          isMerchant: isVerifiedMerchant,
        });
      }
    }
  }, [merchantStatus, user?.id, user?.isMerchant, updateUser]);

  // One source of truth for the desktop nav and the mobile menu.
  const navLinks: { label: string; href: string; external?: boolean }[] = [
    ...(isAuthenticated ? [{ label: "History", href: "/history" }] : []),
    ...(isAuthenticated && otcLink ? [{ label: "OTC", href: otcLink }] : []),
    ...(isAuthenticated && user?.isMerchant
      ? [{ label: "Merchant Dashboard", href: "/merchant/dashboard" }]
      : []),
    { label: "Guide", href: "/guide" },
    { label: "API Docs", href: "/docs" },
    { label: "Support", href: "mailto:dev@thebuidlgrid.org", external: true },
  ];

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
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-white/5">
      <div className="mx-3 sm:mx-6">
        <div className="max-w-4xl mx-auto py-2 sm:py-3 lg:py-4">
          <div className="flex items-center justify-between">
            <Link href="/" aria-label="AutoRamp home" className="shrink-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <Image src="/logo.png" alt="AutoRamp" width={32} height={32} />
                <span className="hidden sm:inline font-bold text-xl tracking-tight">
                  Auto<span className="text-secondary">Ramp</span>
                </span>
              </div>
            </Link>
            <nav className="hidden md:flex items-center gap-8 border border-white/10 bg-background/60 backdrop-blur-lg py-3 px-6 rounded-full">
              {navLinks.map((l) =>
                l.external ? (
                  <a
                    key={l.href}
                    href={l.href}
                    className="text-sm text-white/60 hover:text-secondary transition-colors duration-300"
                  >
                    {l.label}
                  </a>
                ) : (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="text-sm text-white/60 hover:text-secondary transition-colors duration-300"
                  >
                    {l.label}
                  </Link>
                ),
              )}
            </nav>
            <div className="flex items-center gap-2 sm:gap-3">
              <NetworkSwitch />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Open menu"
                    className="md:hidden flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-black/5 hover:bg-white/20 border border-white/10 transition-colors"
                  >
                    <Menu size={18} className="text-white" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 md:hidden">
                  {navLinks.map((l) => (
                    <DropdownMenuItem key={l.href} asChild>
                      {l.external ? (
                        <a href={l.href} className="cursor-pointer py-2.5">
                          {l.label}
                        </a>
                      ) : (
                        <Link href={l.href} className="cursor-pointer py-2.5">
                          {l.label}
                        </Link>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-black/5 hover:bg-white/20 border border-white/10 transition-colors"
                      aria-label="Account menu"
                    >
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
                            OTC {isOnboarded ? "Dashboard" : "Onboarding"}
                          </Link>
                        </DropdownMenuItem>
                        {isOnboarded && (
                          <>
                            <DropdownMenuItem asChild>
                              <Link
                                href="/otc/trade"
                                className="cursor-pointer"
                              >
                                OTC Trade
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link
                                href="/otc/history"
                                className="cursor-pointer"
                              >
                                OTC History
                              </Link>
                            </DropdownMenuItem>
                          </>
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
                        <Link
                          href="/merchant/dashboard"
                          className="cursor-pointer"
                        >
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
                <Button
                  asChild
                  size="sm"
                  className="h-10 px-4 sm:px-6 text-sm font-normal rounded-full whitespace-nowrap"
                >
                  <Link href="/auth/signup" onClick={handleGetStarted}>
                    <span className="sm:hidden">Log in</span>
                    <span className="hidden sm:inline">Login/Sign up</span>
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
