import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState } from "./states";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string;
  /** Screen-reader name for the table. */
  caption: string;
  isLoading?: boolean;
  /** A failed load: shown instead of the rows, with a retry. */
  error?: { message?: string } | null;
  errorTitle?: string;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyHint?: ReactNode;
  onRowClick?: (row: T) => void;
  footer?: ReactNode;
  skeletonRows?: number;
  className?: string;
}

/**
 * The one table for admin and merchant. It always renders one of four honest states: loading skeleton, error with retry,
 * empty with a hint, or the rows. Rows that open something are real keyboard targets (Tab, Enter/Space).
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  caption,
  isLoading,
  error,
  errorTitle = "Couldn't load this list",
  onRetry,
  emptyTitle = "Nothing to show",
  emptyHint,
  onRowClick,
  footer,
  skeletonRows = 6,
  className,
}: DataTableProps<T>) {
  const align = (c: Column<T>) => (c.align === "right" ? "text-right" : "text-left");
  const onKey = (e: KeyboardEvent, row: T) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRowClick?.(row);
    }
  };

  let body: ReactNode;
  if (error) {
    body = <ErrorState title={errorTitle} message={error.message} onRetry={onRetry} />;
  } else if (isLoading && !rows) {
    body = (
      <div role="status" aria-label="Loading" className="divide-y divide-(--c-line)">
        {Array.from({ length: skeletonRows }, (_, i) => (
          <div key={i} className="px-(--c-pad)" style={{ height: "var(--c-row)" }}>
            <div className="h-full animate-pulse py-3 motion-reduce:animate-none">
              <div className="h-full rounded bg-(--c-field)" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (!rows || rows.length === 0) {
    body = <EmptyState title={emptyTitle} hint={emptyHint} />;
  } else {
    body = (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-(--c-panel)">
            <tr className="border-b border-(--c-line) text-(--c-muted)">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-(--c-pad) py-2 font-medium whitespace-nowrap", align(c), c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-(--c-line)">
            {rows.map((row) => (
              <tr
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => onKey(e, row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(
                  "transition-colors",
                  onRowClick && "cursor-pointer hover:bg-(--c-field) focus-visible:bg-(--c-field) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--c-signal)",
                )}
                style={{ height: "var(--c-row)" }}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-(--c-pad) py-1.5 align-middle", align(c), c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-(--c-radius) border border-(--c-line) bg-(--c-panel)", className)}>
      {body}
      {footer && !error ? <div className="flex items-center justify-between gap-3 border-t border-(--c-line) px-(--c-pad) py-2 text-(--c-muted)">{footer}</div> : null}
    </div>
  );
}
