import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function to merge Tailwind CSS classes
 * Combines clsx for conditional classes and tailwind-merge for deduplication
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency with symbol
 */
export function formatCurrency(
  amount: number,
  currency: string = "NGN",
): string {
  const formatter = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  });
  return formatter.format(amount);
}

/**
 * Format date to readable string
 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

/**
 * Truncate wallet address
 */
export function truncateAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get status color class
 */
export function getStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    PENDING: "text-warning",
    PROCESSING: "text-warning",
    COMPLETED: "text-success",
    FAILED: "text-destructive",
    CANCELLED: "text-muted-foreground",
    VERIFIED: "text-success",
    REJECTED: "text-destructive",
  };
  return statusColors[status] || "text-muted-foreground";
}

/**
 * Get status badge classes
 */
export function getStatusBadge(status: string): string {
  const baseClasses = "px-2 py-1 text-xs font-medium rounded-full";
  const statusClasses: Record<string, string> = {
    PENDING: "bg-warning/10 text-warning",
    PROCESSING: "bg-warning/10 text-warning",
    COMPLETED: "bg-success/10 text-success",
    FAILED: "bg-destructive/10 text-destructive",
    CANCELLED: "bg-muted text-muted-foreground",
    VERIFIED: "bg-success/10 text-success",
    REJECTED: "bg-destructive/10 text-destructive",
  };
  return `${baseClasses} ${statusClasses[status] || "bg-muted text-muted-foreground"}`;
}

export function formatNumber(value: string): string {
  const numericValue = value.replace(/[^\d.]/g, "");

  const parts = numericValue.split(".");
  const integerPart = parts[0];
  const decimalPart = parts[1];

  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return decimalPart !== undefined
    ? `${formattedInteger}.${decimalPart}`
    : formattedInteger;
}

export function parseFormattedNumber(value: string): number {
  const numericValue = value.replace(/,/g, "");
  return parseFloat(numericValue) || 0;
}

/**
 * Safe BigInt conversion: handles decimal strings by truncating them.
 * Useful for 0x API responses which may return gas or amounts as decimals.
 */
export function safeBigInt(val: string | number | undefined | null): bigint {
  if (val === undefined || val === null || val === "") return 0n;
  const str = val.toString();
  return BigInt(str.includes(".") ? str.split(".")[0] : str);
}
