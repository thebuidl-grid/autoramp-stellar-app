"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store";
import { MERCHANT_NAV, MERCHANT_SETTINGS, isMerchantNavActive } from "./nav";

/** The counter theme's calm default is light. Flip to "dark" for the dark variant (the palette and shared components follow it). */
const THEME: "light" | "dark" = "light";

/**
 * The merchant dashboard frame: a top navigation bar, not a sidebar, so it reads as a different product from the admin console.
 * Calm light surface (`.counter`), money first. Settings and sign-out sit in the account menu on the right.
 */
export function MerchantShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { logout, user } = useAuthStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const signOut = () => {
    logout();
    router.push("/merchant/login");
  };
  const initial = (user?.email ?? "M").charAt(0).toUpperCase();

  const links = MERCHANT_NAV.flatMap((g) => g.items);

  return (
    <div className="counter min-h-screen" data-theme={THEME}>
      <header className="sticky top-0 z-30 border-b border-(--c-line) bg-(--c-panel)">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/merchant/dashboard" className="text-lg font-semibold tracking-tight">
            AutoRamp
          </Link>

          <nav aria-label="Merchant" className="hidden flex-1 items-center gap-1 md:flex">
            {MERCHANT_NAV.map((group, gi) => (
              <div key={group.title} className={cn("flex items-center gap-1", gi > 0 && "ml-3 border-l border-(--c-line) pl-4")}>
                {group.items.map((item) => {
                  const active = isMerchantNavActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "rounded-full px-3 py-1.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-(--c-signal-text)",
                        active ? "bg-(--c-field) text-(--c-text)" : "text-(--c-muted) hover:text-(--c-text)",
                      )}
                    >
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Link
              href={MERCHANT_SETTINGS.href}
              aria-label="Account settings"
              title="Settings"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-(--c-field) text-sm font-semibold hover:bg-(--c-line) focus-visible:outline-2 focus-visible:outline-(--c-signal-text)"
            >
              {initial}
            </Link>
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
              className="hidden h-9 w-9 items-center justify-center rounded-full text-(--c-muted) hover:text-(--c-danger) focus-visible:outline-2 focus-visible:outline-(--c-signal-text) md:flex"
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              className="flex h-9 w-9 items-center justify-center rounded-full text-(--c-muted) focus-visible:outline-2 focus-visible:outline-(--c-signal-text) md:hidden"
            >
              {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
            </button>
          </div>
        </div>

        {open ? (
          <nav aria-label="Merchant menu" className="border-t border-(--c-line) px-4 py-3 md:hidden">
            <ul className="space-y-1">
              {[...links, MERCHANT_SETTINGS].map((item) => {
                const active = isMerchantNavActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={cn("flex items-center gap-3 rounded-(--c-radius) px-3 py-2.5 font-medium", active ? "bg-(--c-field)" : "text-(--c-muted)")}
                    >
                      <item.icon className="h-4 w-4" aria-hidden />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
              <li>
                <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-(--c-radius) px-3 py-2.5 font-medium text-(--c-danger)">
                  <LogOut className="h-4 w-4" aria-hidden />
                  Sign out
                </button>
              </li>
            </ul>
          </nav>
        ) : null}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
