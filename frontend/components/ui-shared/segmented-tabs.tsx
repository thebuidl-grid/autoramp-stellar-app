"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
  /** A count shown next to the label. Left out when unknown (not shown as a misleading 0). */
  count?: number | null;
}

/**
 * Tabs for switching a list between views. Real tablist semantics: arrow keys / Home / End move between tabs, only the selected
 * tab is in the tab order, and the panel is announced as labelled by its tab. Render the panel content with `<TabPanel>`.
 */
export function SegmentedTabs({ tabs, value, onChange, label, idPrefix = "tabs", className }: { tabs: TabItem[]; value: string; onChange: (value: string) => void; label: string; idPrefix?: string; className?: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.value === value);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].value);
    refs.current[tabs[next].value]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn("flex flex-wrap gap-1 border-b border-(--c-line)", className)}>
      {tabs.map((t) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[t.value] = el;
            }}
            id={`${idPrefix}-tab-${t.value}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${t.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--c-signal)",
              selected ? "border-(--c-signal) text-(--c-text)" : "border-transparent text-(--c-muted) hover:text-(--c-text)",
            )}
          >
            {t.label}
            {t.count != null ? <span className="rounded-full bg-(--c-field) px-1.5 text-xs tabular-nums text-(--c-muted)">{t.count.toLocaleString("en-US")}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ value, current, idPrefix = "tabs", children }: { value: string; current: string; idPrefix?: string; children: ReactNode }) {
  if (value !== current) return null;
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${value}`} aria-labelledby={`${idPrefix}-tab-${value}`} tabIndex={-1}>
      {children}
    </div>
  );
}
