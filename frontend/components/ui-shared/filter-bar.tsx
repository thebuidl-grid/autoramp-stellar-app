import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The row of filters above a table: search, selects, date range, plus actions pushed to the right. */
export function FilterBar({ children, actions, label = "Filters", className }: { children: ReactNode; actions?: ReactNode; label?: string; className?: string }) {
  return (
    <div role="search" aria-label={label} className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
