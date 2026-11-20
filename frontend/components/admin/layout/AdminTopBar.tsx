"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { FreshnessLabel } from "@/components/ui-shared";
import { useLastUpdated } from "@/lib/hooks/use-last-updated";
import { traceUrl } from "@/lib/tracker";

/** Where "Trace a reference" goes: the trace page. If the reference is not exact it offers a search instead. */
export function traceHref(reference: string): string {
  return traceUrl(reference);
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * Top bar: Trace search (press / or Ctrl/Cmd+K from anywhere), the network this app is pointed at, and how old the data is.
 * On phones it also holds the menu button for the sidebar drawer.
 */
export function AdminTopBar({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const updatedAt = useLastUpdated();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target);
      const palette = e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey);
      if (slash || palette) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const ref = query.trim();
    if (!ref) return;
    router.push(traceHref(ref));
  };

  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-(--c-line) bg-(--c-bg)/90 px-3 backdrop-blur sm:px-4">
      {onOpenMenu ? (
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="rounded p-1.5 text-(--c-muted) hover:text-(--c-text) focus-visible:outline-2 focus-visible:outline-(--c-signal) lg:hidden"
        >
          <Menu className="h-4 w-4" aria-hidden />
        </button>
      ) : null}

      <form onSubmit={submit} role="search" aria-label="Trace a transaction" className="relative min-w-0 max-w-md flex-1">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-(--c-muted)" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Trace a reference"
          aria-label="Trace a reference"
          autoComplete="off"
          spellCheck={false}
          className="h-8 w-full rounded-(--c-radius) border border-(--c-line) bg-(--c-field) pr-8 pl-8 font-mono text-[0.92em] text-(--c-text) placeholder:font-sans placeholder:text-(--c-muted) focus-visible:border-(--c-signal) focus-visible:outline-none"
        />
        <kbd aria-hidden className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-(--c-line) px-1 text-[10px] text-(--c-muted) sm:block">
          /
        </kbd>
      </form>

      <div className="ml-auto flex items-center gap-3 text-xs text-(--c-muted)">
        <FreshnessLabel updatedAt={updatedAt} className="hidden sm:inline" />
      </div>
    </header>
  );
}
