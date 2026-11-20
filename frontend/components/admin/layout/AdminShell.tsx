"use client";

import { useState, type ReactNode } from "react";
import { usePersistedFlag } from "@/lib/hooks/use-persisted-flag";
import { cn } from "@/lib/utils";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopBar } from "./AdminTopBar";

/** The admin frame: themed `.console` scope, sidebar (rail or full), top bar, and the page. */
export function AdminShell({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = usePersistedFlag("admin-nav-expanded", true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggle = () => setExpanded((prev) => !prev);

  return (
    <div className="console min-h-screen">
      <AdminSidebar expanded={expanded} onToggleExpanded={toggle} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className={cn("flex min-h-screen min-w-0 flex-col transition-[padding] duration-200 motion-reduce:transition-none", expanded ? "lg:pl-56" : "lg:pl-14")}>
        <AdminTopBar onOpenMenu={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
