import { cn } from "@/lib/utils";
import { formatMoney, type FormatMoneyOptions } from "./money";

/**
 * An amount with tabular numerals so columns line up. `direction` is for statements: "out" shows a minus, "in" a plus.
 * The value is formatted from its string form; nothing goes through floating point.
 */
export function Money({
  value,
  currency,
  direction,
  className,
  ...opts
}: {
  value: string | number | null | undefined;
  currency?: string | null;
  direction?: "in" | "out";
  className?: string;
} & FormatMoneyOptions) {
  const raw = value === null || value === undefined ? "" : String(value);
  const magnitude = direction && raw.startsWith("-") ? raw.slice(1) : raw;
  const text = formatMoney(direction === "out" && magnitude && !magnitude.startsWith("-") ? `-${magnitude}` : magnitude, currency, {
    ...opts,
    signed: direction === "in" || opts.signed,
  });
  return <span className={cn("tabular-nums whitespace-nowrap", className)}>{text}</span>;
}
