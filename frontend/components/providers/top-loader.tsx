"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Thin progress bar at the top of the page while navigating.
 *
 * Starts when an internal link is clicked, finishes when the path changes (or after a safety timeout). It never
 * calls router.refresh(): the previous library (next-top-loader) did on every page load and navigation, and on a
 * 404 URL that refresh gets a 404 back, which Next answers with a full reload of the same URL, forever.
 */
export function TopLoader() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
  };

  const start = () => {
    clearTimers();
    setVisible(true);
    setProgress(20);
    ticker.current = setInterval(() => setProgress((p) => Math.min(p + 5, 80)), 400);
    // Never leave the bar hanging if the URL does not change (same-page links, errors).
    timers.current.push(setTimeout(finish, 8000));
  };

  const finish = () => {
    clearTimers();
    setProgress(100);
    timers.current.push(setTimeout(() => setVisible(false), 250));
    timers.current.push(setTimeout(() => setProgress(0), 500));
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || /^(mailto:|tel:)/.test(href)) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      start();
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The URL changed: the navigation finished.
  useEffect(() => {
    if (visible) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div className="pointer-events-none fixed left-0 right-0 top-0" style={{ zIndex: 1600 }} aria-hidden>
      <div
        data-testid="top-loader-bar"
        className="h-[3px] transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
          backgroundColor: "#00F9C7",
          boxShadow: "0 0 8px rgba(0,249,199,0.4)",
        }}
      />
    </div>
  );
}
