"use client";

import { useEffect, useState } from "react";

/** "just now" / "12s ago" / "4m ago" / "3h ago" / "2d ago". Pure, so it can be tested without timers. */
export function relativeAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Shows how old the data on screen is, so a stale dashboard can't pass for a live one. Pass react-query's `dataUpdatedAt`. */
export function FreshnessLabel({ updatedAt, className }: { updatedAt: number | Date | undefined | null; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const at = updatedAt instanceof Date ? updatedAt.getTime() : updatedAt;
  if (!at) return <span className={className}>Not loaded yet</span>;
  return (
    <time className={className} dateTime={new Date(at).toISOString()}>
      Updated {relativeAge(now - at)}
    </time>
  );
}
