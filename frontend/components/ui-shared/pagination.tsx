import { cn } from "@/lib/utils";
import { SelectField } from "./select-field";

/**
 * Page numbers to show: always the first and last page, the current page with `siblings` on each side, and a gap marker where pages
 * are skipped. A gap that would hide only one page shows that page instead, so the row never lies about what is missing.
 * pageWindow(10, 20) -> [1, "gap", 9, 10, 11, "gap", 20]
 */
export function pageWindow(page: number, totalPages: number, siblings = 1): Array<number | "gap"> {
  const last = Math.max(1, Math.floor(totalPages));
  const current = Math.min(Math.max(1, Math.floor(page)), last);
  const keep = new Set<number>([1, last]);
  for (let p = current - siblings; p <= current + siblings; p++) if (p >= 1 && p <= last) keep.add(p);

  const sorted = [...keep].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev === 2) out.push(prev + 1);
    else if (prev !== undefined && p - prev > 2) out.push("gap");
    out.push(p);
  });
  return out;
}

/** "26–50 of 381", "0 results". */
export function rangeLabel(page: number, pageSize: number, total: number): string {
  if (!total || total < 1) return "0 results";
  const start = (Math.max(1, page) - 1) * pageSize + 1;
  const end = Math.min(total, start + pageSize - 1);
  return `${start.toLocaleString("en-US")}–${end.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`;
}

export const PAGE_SIZES = [10, 25, 50];

const BTN =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-(--c-radius) border px-2 font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-(--c-signal) disabled:cursor-not-allowed disabled:opacity-40";

function PageSize({ value, options, onChange }: { value: number; options: number[]; onChange?: (n: number) => void }) {
  if (!onChange) return null;
  return (
    <SelectField label="Rows per page" value={String(value)} onChange={(e) => onChange(Number(e.target.value))} options={options.map((n) => ({ value: String(n), label: `${n} per page` }))} />
  );
}

/**
 * Numbered pagination for lists the server pages by number (page + total). Shows the range, page buttons with gaps, previous/next,
 * and an optional rows-per-page picker. Buttons are real buttons with names; the current page is aria-current.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZES,
  disabled,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  /** Disable the controls while a page is loading. */
  disabled?: boolean;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);

  return (
    <nav aria-label="Pagination" className={cn("flex w-full flex-wrap items-center justify-between gap-3", className)}>
      <span aria-live="polite">{rangeLabel(current, pageSize, total)}</span>
      <div className="flex flex-wrap items-center gap-2">
        <PageSize value={pageSize} options={pageSizeOptions} onChange={onPageSizeChange} />
        {totalPages > 1 ? (
          <ul className="flex items-center gap-1">
            <li>
              <button type="button" aria-label="Previous page" disabled={disabled || current === 1} onClick={() => onPageChange(current - 1)} className={cn(BTN, "border-(--c-line) text-(--c-text) hover:bg-(--c-field)")}>
                Previous
              </button>
            </li>
            {pageWindow(current, totalPages).map((p, i) =>
              p === "gap" ? (
                <li key={`gap-${i}`} aria-hidden className="px-1 text-(--c-muted)">
                  …
                </li>
              ) : (
                <li key={p}>
                  <button
                    type="button"
                    aria-label={`Page ${p}`}
                    aria-current={p === current ? "page" : undefined}
                    disabled={disabled}
                    onClick={() => onPageChange(p)}
                    className={cn(BTN, p === current ? "border-(--c-signal) bg-(--c-field) text-(--c-text)" : "border-transparent text-(--c-muted) hover:bg-(--c-field) hover:text-(--c-text)")}
                  >
                    {p}
                  </button>
                </li>
              ),
            )}
            <li>
              <button type="button" aria-label="Next page" disabled={disabled || current === totalPages} onClick={() => onPageChange(current + 1)} className={cn(BTN, "border-(--c-line) text-(--c-text) hover:bg-(--c-field)")}>
                Next
              </button>
            </li>
          </ul>
        ) : null}
      </div>
    </nav>
  );
}

/**
 * Pagination for lists the server pages with a cursor (Bitnob): you can only go to the next or previous page, not jump. It still
 * says where you are ("Page 3 of 16") when the total is known.
 */
export function CursorPagination({
  pageIndex,
  pageSize,
  total,
  hasNewer,
  hasOlder,
  onNewer,
  onOlder,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZES,
  disabled,
  className,
}: {
  /** 1-based number of the page on screen. */
  pageIndex: number;
  pageSize: number;
  total?: number;
  hasNewer: boolean;
  hasOlder: boolean;
  onNewer: () => void;
  onOlder: () => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  disabled?: boolean;
  className?: string;
}) {
  const totalPages = total != null && total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : undefined;
  return (
    <nav aria-label="Pagination" className={cn("flex w-full flex-wrap items-center justify-between gap-3", className)}>
      <span aria-live="polite">{total != null ? rangeLabel(pageIndex, pageSize, total) : `Page ${pageIndex}`}</span>
      <div className="flex flex-wrap items-center gap-2">
        <PageSize value={pageSize} options={pageSizeOptions} onChange={onPageSizeChange} />
        {totalPages ? <span className="tabular-nums">{`Page ${pageIndex} of ${totalPages}`}</span> : null}
        <button type="button" disabled={disabled || !hasNewer} onClick={onNewer} className={cn(BTN, "border-(--c-line) text-(--c-text) hover:bg-(--c-field)")}>
          Newer
        </button>
        <button type="button" disabled={disabled || !hasOlder} onClick={onOlder} className={cn(BTN, "border-(--c-line) text-(--c-text) hover:bg-(--c-field)")}>
          Older
        </button>
      </div>
    </nav>
  );
}
