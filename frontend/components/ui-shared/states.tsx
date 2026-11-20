import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Nothing here yet: say what would appear and how to get it. */
export function EmptyState({ title, hint, action, className }: { title: string; hint?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-12 text-center", className)}>
      <p className="font-medium text-(--c-text)">{title}</p>
      {hint ? <p className="max-w-sm text-(--c-muted)">{hint}</p> : null}
      {action}
    </div>
  );
}

/** Something failed: say what happened and what the person can do about it. Never a bare error code. */
export function ErrorState({ title, message, onRetry, className }: { title: string; message?: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-2 px-6 py-12 text-center", className)}>
      <p className="font-medium text-(--c-danger)">{title}</p>
      {message ? <p className="max-w-md text-(--c-muted)">{message}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-(--c-radius) border border-(--c-line) bg-(--c-field) px-3 py-1.5 font-medium text-(--c-text) transition-colors hover:bg-(--c-raised) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--c-signal)"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
