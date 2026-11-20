"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

/** A panel that slides in from the right edge (full width on a phone). */
export function RampSheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ramp-sheet-overlay fixed inset-0 z-50 bg-black/60" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="ramp-sheet fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-(--r-line) bg-(--r-panel) text-(--r-text) shadow-2xl outline-none"
        >
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full text-(--r-muted) transition-colors hover:bg-(--r-raised) hover:text-(--r-text)"
            >
              <X size={18} />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-5">{children}</div>
          {footer && <div className="border-t border-(--r-line) p-4">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
