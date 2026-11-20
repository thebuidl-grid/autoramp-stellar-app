import { describe, expect, it } from "vitest";
import { buildAttentionItems } from "./attention";

describe("buildAttentionItems", () => {
  it("is empty when nothing needs attention, including missing or zero counts", () => {
    expect(buildAttentionItems({})).toEqual([]);
    expect(buildAttentionItems({ pendingMerchants: 0, failedTransactions: 0, stuckTransactions: 0, unmatchedWebhooks: 0 })).toEqual([]);
    expect(buildAttentionItems({ pendingMerchants: Number.NaN, failedTransactions: -2 })).toEqual([]);
  });

  it("puts money problems ahead of reviews, most urgent first", () => {
    const items = buildAttentionItems({ pendingMerchants: 2, unmatchedWebhooks: 438, stuckTransactions: 3, failedTransactions: 5 });
    expect(items.map((i) => i.id)).toEqual(["failed", "stuck", "unmatched", "merchants"]);
    expect(items.map((i) => i.tone)).toEqual(["danger", "warn", "warn", "neutral"]);
  });

  it("writes plain, correctly pluralised titles with grouped numbers", () => {
    const [one] = buildAttentionItems({ failedTransactions: 1 });
    expect(one.title).toBe("1 failed transaction");
    const [many] = buildAttentionItems({ unmatchedWebhooks: 1234 });
    expect(many.title).toBe("1,234 webhooks not matched to a transaction");
    const [merchant] = buildAttentionItems({ pendingMerchants: 1 });
    expect(merchant.title).toBe("1 merchant waiting for review");
  });

  it("links each item to where the admin can act on it", () => {
    const items = Object.fromEntries(buildAttentionItems({ failedTransactions: 1, stuckTransactions: 1, unmatchedWebhooks: 1, pendingMerchants: 1 }).map((i) => [i.id, i.href]));
    expect(items).toEqual({
      failed: "/admin/transactions?tab=failed",
      stuck: "/admin/transactions?tab=stuck",
      unmatched: "/admin/webhooks?tab=unmatched",
      merchants: "/admin/merchants",
    });
  });
});
