/**
 * What needs an admin's attention right now, as a short ordered list. Pure: the page feeds it counts, this decides what shows up,
 * in what order, and how urgent it looks. Items with a zero count never appear, so an empty list means "all clear".
 * Stuck / failed transactions and unmatched webhooks join this list when the tracker ships.
 */
export type AttentionTone = "warn" | "danger" | "neutral";

export interface AttentionItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  count: number;
  tone: AttentionTone;
}

export interface AttentionInput {
  pendingMerchants?: number;
  failedTransactions?: number;
  stuckTransactions?: number;
  unmatchedWebhooks?: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export function buildAttentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  const add = (id: string, count: number | undefined, make: (n: number) => Omit<AttentionItem, "id" | "count">) => {
    if (typeof count === "number" && Number.isFinite(count) && count > 0) items.push({ id, count, ...make(count) });
  };

  // Money problems first: they are the ones a customer is waiting on.
  add("failed", input.failedTransactions, (n) => ({
    title: `${plural(n, "failed transaction")}`,
    detail: "A payment did not complete. Open it to see which step failed.",
    href: "/admin/transactions?tab=failed",
    tone: "danger",
  }));
  add("stuck", input.stuckTransactions, (n) => ({
    title: `${plural(n, "stuck transaction")}`,
    detail: "No progress for longer than expected.",
    href: "/admin/transactions?tab=stuck",
    tone: "warn",
  }));
  add("unmatched", input.unmatchedWebhooks, (n) => ({
    title: `${plural(n, "webhook")} not matched to a transaction`,
    detail: "A provider sent an event we could not tie to anything.",
    href: "/admin/webhooks?tab=unmatched",
    tone: "warn",
  }));
  add("merchants", input.pendingMerchants, (n) => ({
    title: `${plural(n, "merchant")} waiting for review`,
    detail: "Business verification (KYB) is submitted and not yet decided.",
    href: "/admin/merchants",
    tone: "neutral",
  }));

  return items;
}
