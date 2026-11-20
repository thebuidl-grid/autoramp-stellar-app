/**
 * Money is formatted from its string form. Amounts come from the API as decimal strings (Bitnob, Prisma Decimal) and must never
 * go through binary floats, so rounding is done on the digits themselves (half up).
 */
const FRACTION: Record<string, number> = { NGN: 2, KES: 2, UGX: 2, GHS: 2, USD: 2, USDC: 2, USDT: 2, BTC: 8 };
const SYMBOL: Record<string, string> = { NGN: "₦", KES: "KSh ", UGX: "USh ", GHS: "GH₵", USD: "$" };
const MINUS = "−";

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

function toPlainString(value: string | number): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    return value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
  }
  return value.trim();
}

export interface FormatAmountOptions {
  /** Most fraction digits to show (rounded half up). Default 2. */
  maxFraction?: number;
  /** Fewest fraction digits to show (zero padded). Default: same as maxFraction. */
  minFraction?: number;
}

/** "1234567.891" -> "1,234,567.89". Returns "—" for empty values and the input unchanged if it is not a plain decimal. */
export function formatAmount(value: string | number | null | undefined, opts: FormatAmountOptions = {}): string {
  if (value === null || value === undefined || value === "") return "—";
  const raw = toPlainString(value);
  const match = DECIMAL.exec(raw);
  if (!match) return raw;

  const max = Math.max(0, opts.maxFraction ?? 2);
  const min = Math.min(max, Math.max(0, opts.minFraction ?? max));
  const [, neg, intPart, fracPart = ""] = match;

  let digits = BigInt(intPart + fracPart.slice(0, max).padEnd(max, "0"));
  if (fracPart.length > max && fracPart.charCodeAt(max) >= 53 /* '5' */) digits += 1n;

  const s = digits.toString().padStart(max + 1, "0");
  let int = max ? s.slice(0, -max) : s;
  let frac = max ? s.slice(-max) : "";
  while (frac.length > min && frac.endsWith("0")) frac = frac.slice(0, -1);

  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const isZero = /^0*$/.test(int.replace(/,/g, "") + frac);
  return `${neg && !isZero ? "-" : ""}${int}${frac ? "." + frac : ""}`;
}

export interface FormatMoneyOptions extends FormatAmountOptions {
  /** Show an explicit + or − (credits and debits in a statement). */
  signed?: boolean;
}

/** Fiat gets its symbol in front (₦1,200.00), crypto gets its code after (100.00 USDC). */
export function formatMoney(value: string | number | null | undefined, currency?: string | null, opts: FormatMoneyOptions = {}): string {
  const code = String(currency ?? "").trim().toUpperCase();
  const maxFraction = opts.maxFraction ?? FRACTION[code] ?? 8;
  const minFraction = opts.minFraction ?? (FRACTION[code] !== undefined ? maxFraction : 0);
  const formatted = formatAmount(value, { maxFraction, minFraction });
  if (formatted === "—") return formatted;

  const negative = formatted.startsWith("-");
  const body = negative ? formatted.slice(1) : formatted;
  const sign = negative ? MINUS : opts.signed ? "+" : "";
  if (!code) return `${sign}${body}`;
  if (SYMBOL[code]) return `${sign}${SYMBOL[code]}${body}`;
  return `${sign}${body} ${code}`;
}
