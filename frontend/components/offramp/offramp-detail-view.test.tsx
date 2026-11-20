import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { OfframpDetailView } from "./offramp-detail-view";
import type { OfframpView } from "@/lib/offramp-status";
import { computeSettlement } from "@/lib/offramp-status";

const HASH = "db2b46e83dcade2e1be63bce99eb2a7f9f0f2b43102a6821d7b8b0ad35cc837c";
const T0 = "2026-11-10T10:00:00.000Z";

const make = (over: Partial<OfframpView>): OfframpView => ({
  reference: "off_test_1",
  status: "AWAITING_DEPOSIT",
  statusLabel: "Awaiting deposit",
  statusMessage: "Send the exact USDC amount to the funding address before the window closes.",
  successful: false,
  sourceAsset: "USDC",
  depositAmount: "5.0000000",
  expectedPayout: { amount: "8000", currency: "NGN" },
  actualPayout: { amount: null, currency: "NGN" },
  conversion: { rate: 1600, from: "USDC", to: "NGN" },
  settlement: computeSettlement("5", "0"),
  failureReason: null,
  failureDetail: null,
  stellarTxHash: null,
  reversal: null,
  timestamps: { createdAt: T0, updatedAt: T0, completedAt: null },
  statusHistory: [{ from: "INITIATED", to: "AWAITING_DEPOSIT", at: T0, reason: "Funding instructions issued", actor: "system", inferred: false }],
  auditLog: [],
  reconciliation: null,
  ...over,
});

describe("OfframpDetailView", () => {
  it("shows a completed cash-out with payout, conversion, hash link and history", () => {
    render(
      <OfframpDetailView
        view={make({
          status: "COMPLETED",
          statusLabel: "Completed",
          statusMessage: "Your payout was completed.",
          successful: true,
          settlement: computeSettlement("5", "5"),
          actualPayout: { amount: "8000", currency: "NGN" },
          stellarTxHash: HASH,
          timestamps: { createdAt: T0, updatedAt: T0, completedAt: T0 },
          statusHistory: [
            { from: "INITIATED", to: "AWAITING_DEPOSIT", at: T0, reason: null, actor: "system", inferred: false },
            { from: "AWAITING_DEPOSIT", to: "COMPLETED", at: T0, reason: "settled", actor: "bitnob-webhook", inferred: false },
          ],
        })}
      />,
    );
    expect(screen.getByTestId("status-label")).toHaveTextContent("Completed");
    expect(screen.queryByText("not paid out")).toBeNull();
    expect(screen.getByTestId("field-actual-payout")).toHaveTextContent("₦8,000");
    expect(screen.getByTestId("field-conversion")).toHaveTextContent("1 USDC ≈ 1,600 NGN");
    expect(screen.getByRole("link", { name: HASH })).toHaveAttribute("href", expect.stringContaining(`stellar.expert/explorer/`) as unknown as string);
    expect(screen.getByRole("link", { name: HASH }).getAttribute("href")).toContain(HASH);
    expect(screen.getAllByTestId("history-entry")).toHaveLength(2);
  });

  it("timeout: shows EXPIRED, never as successful, with reason, window and support guidance", () => {
    render(
      <OfframpDetailView
        view={make({
          status: "EXPIRED",
          statusLabel: "Expired",
          statusMessage: "This cash-out timed out before it completed. If you already sent USDC, contact support with your reference and transaction hash.",
          failureReason: "timeout",
          failureDetail: { stateWhenExpired: "AWAITING_DEPOSIT", windowMs: 1800000, since: T0, message: "USDC deposit not received before the payout funding window closed" },
        })}
      />,
    );
    expect(screen.getByTestId("offramp-detail")).toHaveAttribute("data-status", "EXPIRED");
    expect(screen.getByTestId("status-label")).toHaveTextContent("Expired");
    expect(screen.getByText("not paid out")).toBeInTheDocument();
    expect(screen.getByTestId("status-message").textContent!.toLowerCase()).toContain("support");
    expect(screen.getByTestId("failure-reason")).toHaveTextContent("Timed out");
    expect(screen.getByTestId("failure-detail")).toHaveTextContent("30 min");
    expect(screen.getByTestId("field-actual-payout")).toHaveTextContent("—");
  });

  it("partial settlement: shows expected, received and outstanding amounts", () => {
    render(
      <OfframpDetailView
        view={make({
          status: "PARTIALLY_SETTLED",
          statusLabel: "Partially settled",
          statusMessage: "Only part of the expected amount was received. contact support",
          settlement: computeSettlement("5", "2.5"),
          failureReason: "partial_settlement",
          stellarTxHash: HASH,
        })}
      />,
    );
    const box = within(screen.getByTestId("settlement"));
    expect(box.getByTestId("settlement-expected")).toHaveTextContent("5 USDC");
    expect(box.getByTestId("settlement-received")).toHaveTextContent("2.5 USDC");
    expect(box.getByTestId("settlement-outstanding")).toHaveTextContent("2.5 USDC");
    expect(screen.getByTestId("failure-reason")).toHaveTextContent("Partial settlement");
  });

  it("rejected payout: shows the rejection reason and provider response, not as completed", () => {
    render(
      <OfframpDetailView
        view={make({
          status: "REJECTED",
          statusLabel: "Payout rejected",
          statusMessage: "The payout was rejected. contact support",
          failureReason: "rejected",
          failureDetail: { providerResponse: { code: "ACCOUNT_RESTRICTED", message: "Beneficiary account restricted" } },
          stellarTxHash: HASH,
        })}
      />,
    );
    expect(screen.getByTestId("status-label")).toHaveTextContent("Payout rejected");
    expect(screen.getByTestId("status-label")).not.toHaveTextContent("Completed");
    expect(screen.getByTestId("offramp-detail")).toHaveAttribute("data-status", "REJECTED");
    expect(screen.getByText("not paid out")).toBeInTheDocument();
    expect(screen.getByTestId("ts-completed")).toHaveTextContent("—"); // no completion time
    expect(screen.getByTestId("failure-detail")).toHaveTextContent("ACCOUNT_RESTRICTED");
    expect(screen.getByTestId("failure-detail")).toHaveTextContent("Beneficiary account restricted");
    expect(screen.getByTestId("field-stellar-hash")).toHaveTextContent(HASH); // original deposit preserved
  });

  it("reversal: shows the linked reversal with amount, reason and original state", () => {
    render(
      <OfframpDetailView
        view={make({
          status: "REVERSED",
          statusLabel: "Reversed",
          statusMessage: "This payout was reversed. contact support",
          failureReason: "reversal",
          reversal: { amount: "3.7500000", reason: "Interbank clearing reversal", at: T0, originalStatus: "COMPLETED" },
        })}
      />,
    );
    const r = within(screen.getByTestId("reversal"));
    expect(r.getByText(/3\.75 USDC/)).toBeInTheDocument();
    expect(r.getByText("Interbank clearing reversal")).toBeInTheDocument();
    expect(r.getByText("Completed")).toBeInTheDocument(); // what it was before the reversal
  });

  it("insufficient liquidity: shows required, available and shortfall", () => {
    render(
      <OfframpDetailView
        view={make({
          status: "INSUFFICIENT_LIQUIDITY",
          statusLabel: "Insufficient liquidity",
          statusMessage: "not enough payout liquidity. contact support",
          failureReason: "insufficient_liquidity",
          failureDetail: { required: "5.0000000", available: "3.0000000", shortfall: "2.0000000" },
        })}
      />,
    );
    const d = screen.getByTestId("failure-detail");
    expect(d).toHaveTextContent("Required5 USDC");
    expect(d).toHaveTextContent("Available3 USDC");
    expect(d).toHaveTextContent("Shortfall2 USDC");
  });

  it("compact hides the reconciliation record; the full view shows it", () => {
    const view = make({
      status: "COMPLETED",
      statusLabel: "Completed",
      successful: true,
      reconciliation: {
        internalTransactionId: "tx-1",
        externalReference: "bitnob-1",
        reference: "off_test_1",
        stellarTxHash: HASH,
        asset: "USDC",
        amount: "5",
        expectedSettlement: "5",
        actualSettlement: "5",
        outstandingAmount: "0.0000000",
        status: "COMPLETED",
        failureReason: null,
        failureDetail: null,
        reconciliationResult: "MATCHED",
        createdAt: T0,
        updatedAt: T0,
        settledAt: T0,
      },
    });
    const { unmount } = render(<OfframpDetailView view={view} compact />);
    expect(screen.queryByTestId("reconciliation")).toBeNull();
    unmount();
    render(<OfframpDetailView view={view} />);
    expect(screen.getByTestId("reconciliation")).toHaveTextContent("MATCHED");
    expect(screen.getByTestId("reconciliation")).toHaveTextContent("bitnob-1");
  });

  it("lists rejected transitions and duplicate events in the audit log (full view)", () => {
    render(
      <OfframpDetailView
        view={make({
          auditLog: [
            { action: "transition_rejected", at: T0, from: "COMPLETED", to: "PROCESSING", description: "COMPLETED -> PROCESSING is not an allowed transition" },
            { action: "duplicate_event_ignored", at: T0, from: "COMPLETED", to: "COMPLETED", description: "Duplicate event bitnob:p1:payout.settled ignored" },
          ],
        })}
      />,
    );
    const log = screen.getByTestId("audit-log");
    expect(log).toHaveTextContent("transition rejected");
    expect(log).toHaveTextContent("not an allowed transition");
    expect(log).toHaveTextContent("duplicate event ignored");
  });
});
