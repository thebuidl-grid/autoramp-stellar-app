import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/ui-shared";
import { cn } from "@/lib/utils";
import type { AttentionItem, AttentionTone } from "./attention";

const DOT: Record<AttentionTone, string> = {
  danger: "bg-(--c-danger)",
  warn: "bg-(--c-warn)",
  neutral: "bg-(--c-neutral)",
};

/** The first thing an admin sees: what to do next, most urgent first. An empty list is a good thing and says so. */
export function NeedsAttention({ items, isLoading, error, onRetry }: { items: AttentionItem[]; isLoading?: boolean; error?: { message?: string } | null; onRetry?: () => void }) {
  return (
    <section aria-labelledby="needs-attention" className="overflow-hidden rounded-(--c-radius) border border-(--c-line) bg-(--c-panel)">
      <h2 id="needs-attention" className="border-b border-(--c-line) px-(--c-pad) py-2 font-medium">
        Needs attention
      </h2>
      {error ? (
        <ErrorState title="Couldn't check what needs attention" message={error.message} onRetry={onRetry} className="py-8" />
      ) : isLoading ? (
        <div role="status" aria-label="Loading" className="space-y-2 p-(--c-pad)">
          {[0, 1].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded bg-(--c-field) motion-reduce:animate-none" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="Nothing needs your attention" hint="Failed or stuck payments, unmatched provider events and merchants waiting for review will show up here." className="py-8" />
      ) : (
        <ul className="divide-y divide-(--c-line)">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group flex items-center gap-3 px-(--c-pad) py-2.5 transition-colors hover:bg-(--c-field) focus-visible:bg-(--c-field) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--c-signal)"
              >
                <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", DOT[item.tone])} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{item.title}</span>
                  <span className="block truncate text-(--c-muted)">{item.detail}</span>
                </span>
                <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-(--c-muted) transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
