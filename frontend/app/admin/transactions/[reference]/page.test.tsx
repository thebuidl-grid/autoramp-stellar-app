import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import { useAuthStore } from "@/lib/store";
import AdminTracePage from "./page";

let reference = "txn_ref_X";
vi.mock("next/navigation", () => ({ useParams: () => ({ reference }) }));

const API = "http://localhost/api";
const half = (over: Record<string, unknown> = {}) => ({
  transaction: { id: "of-1", type: "offramp", scope: "USER", reference: "txn_ref_X", status: "PAYOUT_PENDING", amount: "98", currency: "USDC", ownerId: "u-1", createdAt: "2026-11-20T09:01:00.000Z", updatedAt: "2026-11-20T09:40:00.000Z" },
  relatedId: "sw-1",
  hasParentRow: true,
  legs: [
    { id: "g1", role: "BRIDGE", provider: "CCTP", providerReference: "0xburn", status: "PENDING", expectedAmount: null, receivedAmount: null, outstandingAmount: null, fundingAddress: null, depositTxHash: "0xdeadbeef", failedStep: null, failureReason: null, lastEventAt: "2026-11-20T09:10:00.000Z", createdAt: "2026-11-20T09:02:00.000Z" },
    { id: "g2", role: "PAYOUT", provider: "BITNOB", providerReference: "q1", status: "payout.created", expectedAmount: "98", receivedAmount: "98", outstandingAmount: "0", fundingAddress: "GFUND", depositTxHash: null, failedStep: null, failureReason: null, lastEventAt: "2026-11-20T09:20:00.000Z", createdAt: "2026-11-20T09:03:00.000Z" },
  ],
  timeline: [
    { at: "2026-11-20T09:01:00.000Z", kind: "created", title: "Created" },
    { at: "2026-11-20T09:03:00.000Z", kind: "log", title: "Initiated → Awaiting deposit", from: "INITIATED", to: "AWAITING_DEPOSIT", description: "Funding instructions issued" },
    { at: "2026-11-20T09:06:20.000Z", kind: "webhook", title: "Bitnob: payout.created", provider: "bitnob", to: "created", processed: true, webhookEventId: "w1", detail: { event: "payout.created" } },
  ],
  failedAt: null,
  ...over,
});
const swap = { ...half(), transaction: { id: "sw-1", type: "swap", scope: "USER", reference: "txn_ref_X", status: "COMPLETED", amount: "100", currency: "USDC", ownerId: "u-1", createdAt: "2026-11-20T09:00:00.000Z", updatedAt: "2026-11-20T09:30:00.000Z" }, legs: [], timeline: [{ at: "2026-11-20T09:00:00.000Z", kind: "created", title: "Created" }], relatedId: "of-1" };

function mock(body: unknown, status = 200) {
  server.use(http.get(`${API}/admin/transactions/:reference/trace`, () => HttpResponse.json(body as never, { status })));
}

beforeEach(() => {
  reference = "txn_ref_X";
  useAuthStore.setState({ token: "admin-jwt" });
});

describe("AdminTracePage", () => {
  it("shows the network it ran on, and links to the same transaction on our Bitnob and Safehaven pages", async () => {
    mock({
      reference: "txn_ref_X",
      transactions: [
        half({
          transaction: { ...half().transaction, chainNetwork: "testnet" },
          legs: [
            { id: "l1", role: "PAYOUT", provider: "BITNOB", providerReference: "q1", status: "PENDING", expectedAmount: null, receivedAmount: null, outstandingAmount: null, fundingAddress: null, depositTxHash: null, failedStep: null, failureReason: null, lastEventAt: null, createdAt: "2026-11-20T09:00:00.000Z" },
          ],
          virtualAccount: { accountNumber: "6012214785", accountName: "N", bankName: "B", bankCode: null, status: null, expectedAmount: null, expiresAt: null, reference: null, externalReference: null, createdAt: null, activity: [] },
        }),
      ],
      unlinkedWebhooks: [],
    });
    renderWithClient(<AdminTracePage />);
    expect(await screen.findAllByText("Testnet")).not.toHaveLength(0);
    expect(screen.getByRole("link", { name: "See on the Bitnob page" })).toHaveAttribute("href", "/admin/bitnob?reference=txn_ref_X");
    expect(screen.getByRole("link", { name: "See the virtual account on the Safehaven page" })).toHaveAttribute("href", "/admin/safehaven?q=6012214785");
  });

  it("shows who handled it, the provider details and what happened, in order", async () => {
    mock({ reference: "txn_ref_X", transactions: [half()], unlinkedWebhooks: [] });
    renderWithClient(<AdminTracePage />);

    expect(await screen.findByRole("list", { name: "Provider legs, in the order money moves" })).toBeInTheDocument();
    const legs = within(screen.getByRole("list", { name: "Provider legs, in the order money moves" })).getAllByRole("listitem");
    expect(legs.map((l) => l.textContent)).toEqual([expect.stringContaining("CCTP"), expect.stringContaining("Bitnob")]); // bridge before payout
    expect(screen.getAllByText("98.00 USDC").length).toBeGreaterThan(0); // header, and expected / received on the Bitnob leg

    const bitnob = screen.getByRole("region", { name: "BITNOB PAYOUT" });
    expect(within(bitnob).getByText("Expected")).toBeInTheDocument();
    expect(within(bitnob).getByTitle("GFUND")).toBeInTheDocument();

    const timeline = screen.getByRole("list", { name: "What happened, oldest first" });
    const entries = within(timeline).getAllByRole("listitem");
    expect(entries.map((e) => e.textContent)).toEqual([expect.stringContaining("Created"), expect.stringContaining("Initiated → Awaiting deposit"), expect.stringContaining("Bitnob: payout.created")]);
    expect(entries[2]).toHaveTextContent("+3m 20s"); // gap since the previous step
  });

  it("draws the step nodes for where the transaction is", async () => {
    mock({ reference: "txn_ref_X", transactions: [half()], unlinkedWebhooks: [] });
    renderWithClient(<AdminTracePage />);
    expect(await screen.findByRole("list", { name: "Step 5 of 6: Paying out" })).toBeInTheDocument();
  });

  it("says where it failed and why, in an alert, and marks that leg", async () => {
    const failed = half({
      transaction: { ...half().transaction, status: "FAILED" },
      legs: [{ ...half().legs[0], failedStep: "attestation", failureReason: "Circle attestation timed out" }],
      failedAt: { step: "attestation", provider: "CCTP", reason: "Circle attestation timed out" },
    });
    mock({ reference: "txn_ref_X", transactions: [failed], unlinkedWebhooks: [] });
    renderWithClient(<AdminTracePage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Failed at attestation (CCTP)");
    expect(alert).toHaveTextContent("Circle attestation timed out");
    expect(within(screen.getByRole("list", { name: "Provider legs, in the order money moves" })).getByText(/Failed at attestation/)).toBeInTheDocument();
  });

  it("gives a swap and its off-ramp one tab each, because they share a reference", async () => {
    mock({ reference: "txn_ref_X", transactions: [swap, half()], unlinkedWebhooks: [] });
    renderWithClient(<AdminTracePage />);
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Swap", "Off-ramp"]);
    expect(screen.getByRole("tab", { name: "Swap" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("100.00 USDC")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Off-ramp" }));
    expect(await screen.findByRole("list", { name: "Provider legs, in the order money moves" })).toBeInTheDocument();
    expect(screen.getAllByText("98.00 USDC").length).toBeGreaterThan(0);
  });

  it("explains an unknown reference and offers a search instead of an error", async () => {
    reference = "off_missing";
    mock({ message: "No transaction found" }, 404);
    renderWithClient(<AdminTracePage />);
    expect(await screen.findByText("Nothing found for off_missing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Search transactions for/ })).toHaveAttribute("href", "/admin/transactions?q=off_missing");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers a retry when the server fails", async () => {
    mock({ message: "boom" }, 500);
    renderWithClient(<AdminTracePage />);
    expect(await screen.findByText("Couldn't load this trace")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("lists webhook events that carry the reference but match no transaction", async () => {
    mock({ reference: "txn_ref_X", transactions: [half()], unlinkedWebhooks: [{ id: "orphan-1", provider: "safehaven", eventType: "virtualAccount.transfer", status: "Completed", at: "2026-11-20T10:00:00.000Z", transactionId: "ghost" }] });
    renderWithClient(<AdminTracePage />);
    const section = await screen.findByRole("region", { name: "Webhook events not linked to this transaction" });
    expect(within(section).getByText("virtualAccount.transfer")).toBeInTheDocument();
  });

  it("decodes an encoded reference from the address", async () => {
    reference = "off_a%2Fb";
    let asked = "";
    server.use(http.get(`${API}/admin/transactions/:reference/trace`, ({ params }) => { asked = String(params.reference); return HttpResponse.json({ reference: "off_a/b", transactions: [half()], unlinkedWebhooks: [] }); }));
    renderWithClient(<AdminTracePage />);
    await screen.findByRole("list", { name: "Provider legs, in the order money moves" });
    expect(decodeURIComponent(asked)).toBe("off_a/b");
  });

  it("shows a calm message when no provider has handled it yet", async () => {
    mock({ reference: "txn_ref_X", transactions: [{ ...half(), legs: [] }], unlinkedWebhooks: [] });
    renderWithClient(<AdminTracePage />);
    expect(await screen.findByText("No provider has been recorded for this transaction yet.")).toBeInTheDocument();
  });
});
