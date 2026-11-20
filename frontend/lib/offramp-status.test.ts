import { describe, expect, it } from "vitest";
import {
  OFFRAMP_STATUSES,
  STATUS_META,
  computeSettlement,
  normalizeOfframpStatus,
  reasonLabel,
  sellProgress,
  statusMeta,
  viewFromLegacy,
} from "./offramp-status";

describe("offramp status model", () => {
  it("has metadata for all 13 states", () => {
    expect(OFFRAMP_STATUSES).toHaveLength(13);
    for (const s of OFFRAMP_STATUSES) {
      expect(STATUS_META[s].label.length).toBeGreaterThan(2);
      expect(STATUS_META[s].message.length).toBeGreaterThan(10);
    }
  });

  it("marks only COMPLETED as success", () => {
    for (const s of OFFRAMP_STATUSES) expect(STATUS_META[s].tone === "success").toBe(s === "COMPLETED");
  });

  it("tones failure outcomes as error/warning and gives support guidance", () => {
    for (const s of ["FAILED", "REJECTED", "REVERSED", "EXPIRED"] as const) expect(STATUS_META[s].tone).toBe("error");
    for (const s of ["PARTIALLY_SETTLED", "INSUFFICIENT_LIQUIDITY"] as const) expect(STATUS_META[s].tone).toBe("warning");
    for (const s of ["EXPIRED", "REJECTED", "FAILED", "INSUFFICIENT_LIQUIDITY", "PARTIALLY_SETTLED"] as const) {
      expect(STATUS_META[s].message.toLowerCase()).toContain("support");
    }
  });

  it("maps legacy statuses and degrades gracefully for unknown ones", () => {
    expect(normalizeOfframpStatus("PENDING")).toBe("AWAITING_DEPOSIT");
    expect(normalizeOfframpStatus("PARTIAL")).toBe("PARTIALLY_SETTLED");
    expect(normalizeOfframpStatus("processing")).toBe("PROCESSING");
    expect(normalizeOfframpStatus("WAT")).toBeNull();
    expect(statusMeta("SOME_NEW_STATE").label).toBe("Some new state");
    expect(statusMeta(undefined).label).toBe("Unknown");
  });

  it("labels failure reasons", () => {
    expect(reasonLabel("insufficient_liquidity")).toBe("Insufficient liquidity");
    expect(reasonLabel("timeout")).toBe("Timed out");
    expect(reasonLabel("some_new_reason")).toBe("some new reason");
    expect(reasonLabel(null)).toBeNull();
  });
});

describe("computeSettlement", () => {
  it("expected 5 USDC, received 2.5 USDC -> 2.5 outstanding", () => {
    expect(computeSettlement("5", "2.5")).toMatchObject({ expected: "5.0000000", received: "2.5000000", outstanding: "2.5000000", kind: "PARTIAL" });
  });
  it("is exact to 7 decimals and classifies full / over / none", () => {
    expect(computeSettlement("0.3000000", "0.1000000").outstanding).toBe("0.2000000");
    expect(computeSettlement("3.125", "3.1250000").kind).toBe("FULL");
    expect(computeSettlement("1", "1.5")).toMatchObject({ kind: "OVERPAID", excess: "0.5000000" });
    expect(computeSettlement("1", null).kind).toBe("NONE");
  });
});

describe("viewFromLegacy (older backend response)", () => {
  const completed = {
    id: "tx-1",
    reference: "off_1",
    status: "COMPLETED",
    fiatAmount: "5000",
    currency: "NGN",
    createdAt: "2026-11-02T04:45:00.000Z",
    updatedAt: "2026-11-02T04:47:15.000Z",
    completedAt: "2026-11-02T04:47:15.000Z",
    providerOrder: { expectedAmount: "3.125", receivedAmount: "3.125", depositTxHash: "db2b46e8", failureReason: null },
  };

  it("builds a successful view with conversion info and the Stellar hash", () => {
    const v = viewFromLegacy(completed, [
      { action: "created", oldStatus: null, newStatus: "PENDING", description: "created", createdAt: "2026-11-02T04:45:00.000Z" },
      { action: "status_changed", oldStatus: "PENDING", newStatus: "COMPLETED", description: "settled", createdAt: "2026-11-02T04:47:15.000Z" },
    ]);
    expect(v).toMatchObject({ status: "COMPLETED", successful: true, stellarTxHash: "db2b46e8", depositAmount: "3.1250000" });
    expect(v.conversion).toEqual({ rate: 1600, from: "USDC", to: "NGN" });
    expect(v.statusHistory.map((h) => h.to)).toEqual(["PENDING", "COMPLETED"]);
  });

  it("shows the actual payout for COMPLETED legacy records only", () => {
    expect(viewFromLegacy(completed).actualPayout.amount).toBe("5000");
    expect(viewFromLegacy({ ...completed, status: "PENDING" }).actualPayout.amount).toBeNull();
    expect(viewFromLegacy({ ...completed, status: "EXPIRED" }).actualPayout.amount).toBeNull();
  });

  it("never reports a non-completed legacy status as successful", () => {
    for (const status of ["PENDING", "PROCESSING", "PARTIAL", "REJECTED", "REVERSED", "EXPIRED", "FAILED"]) {
      expect(viewFromLegacy({ ...completed, status }).successful).toBe(false);
    }
    expect(viewFromLegacy({ ...completed, status: "PENDING" }).status).toBe("AWAITING_DEPOSIT");
  });

  it("hides audit-only log rows from the status history", () => {
    const v = viewFromLegacy(completed, [
      { action: "transition_rejected", oldStatus: "COMPLETED", newStatus: "PROCESSING", createdAt: "x" },
      { action: "duplicate_event_ignored", oldStatus: "COMPLETED", newStatus: "COMPLETED", createdAt: "x" },
    ]);
    expect(v.statusHistory).toHaveLength(0);
  });
});

describe("sellProgress", () => {
  it("keeps the screen's own wording while still waiting for the deposit", () => {
    expect(sellProgress("AWAITING_DEPOSIT")).toBeNull();
    expect(sellProgress("INITIATED")).toBeNull();
    expect(sellProgress(undefined)).toBeNull();
  });
  it("reports progress after the deposit lands", () => {
    expect(sellProgress("DEPOSIT_DETECTED")?.phase).toBe("progress");
    expect(sellProgress("PAYOUT_PENDING")?.title).toBe("Sending your payout");
  });
  it("reports a finished payout", () => {
    expect(sellProgress("COMPLETED")?.phase).toBe("done");
  });
  it("says plainly when it did not pay out", () => {
    for (const s of ["FAILED", "REJECTED", "REVERSED", "EXPIRED", "PARTIALLY_SETTLED", "INSUFFICIENT_LIQUIDITY"]) {
      expect(sellProgress(s)?.phase).toBe("failed");
    }
    expect(sellProgress("EXPIRED")?.subtitle).toMatch(/contact support/i);
    // Older backends use legacy names.
    expect(sellProgress("CANCELLED")?.phase).toBe("failed");
  });
});
