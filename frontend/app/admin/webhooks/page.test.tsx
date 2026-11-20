import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import { useAuthStore } from "@/lib/store";
import AdminWebhooksPage from "./page";

const API = "http://localhost/api";
const ev = (over: Record<string, unknown> = {}) => ({ id: "11111111-1111-1111-1111-111111111111", provider: "safehaven", eventType: "virtualAccount.transfer", status: "Completed", reference: "0902672602", transactionType: "onramp", transactionId: "t-ghost", processed: true, errorMessage: null, legId: null, inboundWebhookId: null, createdAt: "2026-11-20T10:00:00.000Z", matched: false, ...over });
const detail = (over: Record<string, unknown> = {}) => ({ ...ev(), processedAt: "2026-11-20T10:00:01.000Z", payload: { amount: 5000 }, inbound: { id: "in1", endpoint: "/webhook/sh", status: "completed", error: null, receivedAt: "2026-11-20T09:59:59.000Z", payload: { raw: true } }, ...over });

let seen: URLSearchParams[] = [];
function mock(items: unknown[], total = items.length) {
  seen = [];
  server.use(http.get(`${API}/admin/webhooks`, ({ request }) => { seen.push(new URL(request.url).searchParams); return HttpResponse.json({ total, limit: 10, offset: 0, items }); }));
}

beforeEach(() => useAuthStore.setState({ token: "admin-jwt" }));

describe("AdminWebhooksPage", () => {
  it("lists events with provider, event, status and whether they matched a transaction", async () => {
    mock([ev(), ev({ id: "22222222-2222-2222-2222-222222222222", provider: "bitnob", eventType: "payout.settled", matched: true, reference: "off_1" })]);
    renderWithClient(<AdminWebhooksPage />);
    const table = await screen.findByRole("table", { name: "Webhook events" });
    const unmatched = within(table).getByText("virtualAccount.transfer").closest("tr") as HTMLElement;
    expect(within(unmatched).getByText("Safehaven")).toBeInTheDocument();
    expect(within(unmatched).getByText("Not matched")).toBeInTheDocument();
    const matched = within(table).getByText("payout.settled").closest("tr") as HTMLElement;
    expect(within(matched).getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("1–2 of 2")).toBeInTheDocument();
  });

  it("asks only for unmatched events on the Not matched tab, and for unprocessed ones on the other", async () => {
    mock([ev()]);
    renderWithClient(<AdminWebhooksPage />);
    await screen.findByRole("table", { name: "Webhook events" });
    expect(seen.at(-1)!.has("matched")).toBe(false);
    await userEvent.click(screen.getByRole("tab", { name: "Not matched" }));
    await vi_waitFor(() => seen.at(-1)!.get("matched") === "false");
    await userEvent.click(screen.getByRole("tab", { name: "Not processed" }));
    await vi_waitFor(() => seen.at(-1)!.get("processed") === "false");
    expect(seen.at(-1)!.has("matched")).toBe(false);
  });

  it("filters by provider and starts again from the first page", async () => {
    mock([ev()], 40);
    renderWithClient(<AdminWebhooksPage />);
    await screen.findByRole("table", { name: "Webhook events" });
    await userEvent.click(screen.getByRole("button", { name: "Page 2" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Provider" }), "bitnob");
    await vi_waitFor(() => seen.at(-1)!.get("provider") === "bitnob");
    expect(seen.at(-1)!.get("offset")).toBe("0");
  });

  it("opens an event with its payload and raw receipt", async () => {
    mock([ev()]);
    server.use(http.get(`${API}/admin/webhooks/:id`, () => HttpResponse.json(detail())));
    renderWithClient(<AdminWebhooksPage />);
    await userEvent.click(await screen.findByText("virtualAccount.transfer"));
    const panel = await screen.findByRole("dialog", { name: "virtualAccount.transfer" });
    expect(await within(panel).findByText(/No — it points at nothing we know/)).toBeInTheDocument();
    expect(within(panel).getByText("Stored payload")).toBeInTheDocument();
    expect(within(panel).getByText(/"amount": 5000/)).toBeInTheDocument();
    expect(within(panel).getByText("Raw receipt")).toBeInTheDocument();
    expect(within(panel).getByText(/"raw": true/)).toBeInTheDocument();
    expect(within(panel).queryByRole("link", { name: "Trace this transaction" })).not.toBeInTheDocument(); // a Safehaven reference is not ours
  });

  it("links an event that carries one of our references to its trace", async () => {
    mock([ev({ reference: "off_abc", provider: "bitnob" })]);
    server.use(http.get(`${API}/admin/webhooks/:id`, () => HttpResponse.json(detail({ reference: "off_abc", matched: true }))));
    renderWithClient(<AdminWebhooksPage />);
    await userEvent.click(await screen.findByText("virtualAccount.transfer"));
    expect(await screen.findByRole("link", { name: "Trace this transaction" })).toHaveAttribute("href", "/admin/transactions/off_abc");
  });

  it("explains an empty list and a failed load", async () => {
    mock([]);
    const { unmount } = renderWithClient(<AdminWebhooksPage />);
    expect(await screen.findByText("No webhook events yet")).toBeInTheDocument();
    unmount();
    server.use(http.get(`${API}/admin/webhooks`, () => HttpResponse.json({ message: "down" }, { status: 500 })));
    renderWithClient(<AdminWebhooksPage />);
    expect(await screen.findByText("Couldn't load webhook events")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

async function vi_waitFor(check: () => boolean) {
  const { waitFor } = await import("@testing-library/react");
  await waitFor(() => expect(check()).toBe(true));
}
