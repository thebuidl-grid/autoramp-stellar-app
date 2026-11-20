"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** "off_9f2c4a1b7d3e" -> "off_9f2c…7d3e". Short values are left alone. */
export function shortenId(value: string, head = 8, tail = 4): string {
  return value.length > head + tail + 2 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}

/** A reference, hash or id that people copy a lot: shortened for scanning, full value on hover/copy, optional link out. */
export function CopyableId({ value, label = "value", href, className }: { value: string | null | undefined; label?: string; href?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!value) return <span className="text-(--c-muted)">—</span>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions); the full value stays visible in the title.
    }
  };
  const text = <span title={value}>{shortenId(value)}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-[0.92em]", className)}>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
          {text}
        </a>
      ) : (
        text
      )}
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
        className="rounded p-0.5 text-(--c-muted) transition-colors hover:text-(--c-text) focus-visible:outline-2 focus-visible:outline-(--c-signal)"
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      </button>
    </span>
  );
}
