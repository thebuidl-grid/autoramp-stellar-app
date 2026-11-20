"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ChevronsLeft, ChevronsRight, LogOut, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store";
import { ADMIN_NAV, isNavActive, resolveNavPath } from "./nav";

export interface AdminSidebarProps {
  /** Desktop: full width with labels (true) or the icon rail (false). */
  expanded?: boolean;
  onToggleExpanded?: () => void;
  /** Mobile: the slide-over drawer. */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

/**
 * Left navigation for the admin console: grouped sections, a collapsible icon rail on desktop, a slide-over drawer on phones.
 * The active page gets aria-current="page" and a teal marker (teal = "you are here / live", per the brand rule).
 */
export function AdminSidebar({ expanded = true, onToggleExpanded, mobileOpen = false, onCloseMobile }: AdminSidebarProps) {
  const pathname = resolveNavPath(usePathname());
  const { logout } = useAuthStore();

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseMobile?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      <aside
        data-open={mobileOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-(--c-line) bg-(--c-panel) transition-transform duration-200 motion-reduce:transition-none",
          expanded ? "lg:w-56" : "lg:w-14",
          "lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className={cn("flex h-12 items-center border-b border-(--c-line) px-3", expanded ? "justify-between" : "justify-center lg:px-0")}>
          <span className={cn("font-semibold tracking-tight", !expanded && "lg:sr-only")}>
            AutoRamp <span className="text-(--c-muted)">admin</span>
          </span>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="rounded p-1 text-(--c-muted) hover:text-(--c-text) focus-visible:outline-2 focus-visible:outline-(--c-signal) lg:hidden"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <nav aria-label="Admin" className="flex-1 overflow-y-auto px-2 py-3">
          {ADMIN_NAV.map((section, i) => (
            <div key={section.title} className={cn(i > 0 && "mt-4")}>
              <p className={cn("px-2 pb-1 text-xs font-medium text-(--c-muted)", !expanded && "lg:sr-only")}>{section.title}</p>
              {!expanded && i > 0 ? <div aria-hidden className="mx-2 mb-1 hidden border-t border-(--c-line) lg:block" /> : null}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isNavActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={expanded ? undefined : item.name}
                        aria-current={active ? "page" : undefined}
                        onClick={onCloseMobile}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-(--c-radius) px-2 py-1.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-(--c-signal)",
                          !expanded && "lg:justify-center",
                          active ? "bg-(--c-field) text-(--c-text)" : "text-(--c-muted) hover:bg-(--c-field) hover:text-(--c-text)",
                        )}
                      >
                        {active ? <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-(--c-signal)" /> : null}
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        <span className={cn(!expanded && "lg:sr-only")}>{item.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-(--c-line) p-2">
          {onToggleExpanded ? (
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
              aria-pressed={!expanded}
              className="mb-1 hidden w-full items-center gap-2.5 rounded-(--c-radius) px-2 py-1.5 text-(--c-muted) transition-colors hover:bg-(--c-field) hover:text-(--c-text) focus-visible:outline-2 focus-visible:outline-(--c-signal) lg:flex lg:justify-start"
            >
              {expanded ? <ChevronsLeft className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronsRight className="mx-auto h-4 w-4 shrink-0" aria-hidden />}
              <span className={cn(!expanded && "sr-only")}>Collapse</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => logout()}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-(--c-radius) px-2 py-1.5 text-(--c-muted) transition-colors hover:bg-[color-mix(in_oklab,var(--c-danger)_14%,transparent)] hover:text-(--c-danger) focus-visible:outline-2 focus-visible:outline-(--c-signal)",
              !expanded && "lg:justify-center",
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            <span className={cn(!expanded && "lg:sr-only")}>Log out</span>
          </button>
        </div>
      </aside>

      {mobileOpen ? <div aria-hidden className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={onCloseMobile} /> : null}
    </>
  );
}
