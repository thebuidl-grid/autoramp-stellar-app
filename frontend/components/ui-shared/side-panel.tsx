"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A pull-out panel from the right edge: open a row's details without leaving the list. Built on Radix Dialog, so focus is trapped,
 * Escape and the overlay close it, and focus returns to the row that opened it.
 *
 * Radix renders in a portal outside the themed page, so the panel carries the theme class itself; without it the colour tokens
 * would not resolve. Motion is a short slide and is dropped for people who prefer reduced motion.
 */
export function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  theme = "console",
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  theme?: "console" | "counter";
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <Dialog.Content
          className={cn(
            theme,
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-(--c-line) shadow-2xl outline-none",
            "data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-200 motion-reduce:animate-none",
            className,
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b border-(--c-line) px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold text-(--c-text)">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-0.5 text-(--c-muted)">{description}</Dialog.Description> : <Dialog.Description className="sr-only">Details</Dialog.Description>}
            </div>
            <Dialog.Close
              aria-label="Close panel"
              className="rounded p-1 text-(--c-muted) transition-colors hover:text-(--c-text) focus-visible:outline-2 focus-visible:outline-(--c-signal)"
            >
              <X className="h-4 w-4" aria-hidden />
            </Dialog.Close>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
          {footer ? <footer className="border-t border-(--c-line) px-4 py-3">{footer}</footer> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A label/value list for the panel body. Values wrap instead of overflowing; pass a node for ids, badges or money. */
export function DetailList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="divide-y divide-(--c-line)">
      {items.map((item) => (
        <div key={item.label} className="flex items-start justify-between gap-4 py-2.5">
          <dt className="shrink-0 text-(--c-muted)">{item.label}</dt>
          <dd className="min-w-0 text-right break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
