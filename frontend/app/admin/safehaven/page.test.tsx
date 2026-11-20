import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import { useAuthStore } from "@/lib/store";
import AdminSafehavenPage from "./page";

let search = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));

const API = "http://localhost/api";
const acct = (o: Record<string, unknown> = {}) => ({ kind: "user_deposit", accountNumber: "6012214785", accountName: "Thebuidlgrid Checkout", bankName: "Safehaven MFB", bankCode: "090286", status: null, userId: "u1", userEmail: "ada@x.co", merchantId: null, merchantName: null, transactionId: "t1", transactionType: "onramp", expiresAt: null, createdAt: "2026-11-18T20:05:00.000Z", events: 2, lastEventAt: "2026-11-20T10:00:00.000Z", unmatched: 1, ...o });
const tx = (o: Record<string, unknown> = {}) => ({ id: "e1", eventType: "account.credit", status: "Completed", processed: true, errorMessage: null, createdAt: "2026-11-20T10:00:00.000Z", transactionId: "t1", reference: "100033", amount: "15000", creditAccountNumber: "5012518213", creditAccountName: "THEBUIDLGRID / OLU", debitAccountNumber: "0006991241", debitAccountName: "IKPE JESSE", sessionId: "s1", paymentReference: "p1", externalReference: "off_abc", ourReference: "off_abc", transactionType: "onramp", ...o });

let seen: URLSearchParams[] = [];
function mock(over: { accounts?: unknown[]; txs?: unknown[]; accountsStatus?: number } = {}) {
  seen = [];
  server.use(
    http.get(`${API}/admin/safehaven/accounts`, ({ request }) => {
      seen.push(new URL(request.url).searchParams);
      return over.accountsStatus ? HttpResponse.json({ message: "x" }, { status: over.accountsStatus }) : HttpResponse.json({ total: (over.accounts ?? [acct()]).length, limit: 10, offset: 0, items: over.accounts ?? [acct()] });
    }),
    http.get(`${API}/admin/safehaven/accounts/:n`, () => HttpResponse.json({ account: acct(), events: [tx({ id: "e2", reference: "off_abc" }), tx({ id: "e3", creditAccountNumber: "x", debitAccountNumber: "6012214785", transactionId: null, ourReference: null, reference: null, amount: "500", processed: false })] })),
    http.get(`${API}/admin/safehaven/transactions`, ({ request }) => {
      seen.push(new URL(request.url).searchParams);
      return HttpResponse.json({ total: (over.txs ?? [tx()]).length, limit: 10, offset: 0, items: over.txs ?? [tx()] });
    }),
  );
}

beforeEach(() => {
  search = "";
  useAuthStore.setState({ token: "admin-jwt" });
});

describe("AdminSafehavenPage", () => {
  it("lists customer accounts with who they belong to and how much has happened on them", async () => {
    mock();
    renderWithClient(<AdminSafehavenPage />);
    const table = await screen.findByRole("table", { name: "Customer accounts" });
    const row = within(table).getByText("6012214785").closest("tr") as HTMLElement;
    expect(within(row).getByText("ada@x.co")).toBeInTheDocument();
    expect(within(row).getByText("Customer deposit account")).toBeInTheDocument();
    expect(within(row).getByText(/1 not matched/)).toBeInTheDocument();
    expect(seen.at(-1)!.get("kind")).toBe("customer");
  });

  it("opens an account with the money in and out and marks the unmatched ones", async () => {
    mock();
    renderWithClient(<AdminSafehavenPage />);
    await userEvent.click(await screen.findByText("6012214785"));
    const panel = await screen.findByRole("dialog", { name: "Thebuidlgrid Checkout" });
    expect(await within(panel).findAllByText(/Money (in|out)/)).toHaveLength(2);
    expect(within(panel).getByText(/not matched to a transaction/)).toBeInTheDocument();
    expect(within(panel).getByText(/not processed/)).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "ada@x.co" })).toHaveAttribute("href", "/admin/users/u1");
    expect(within(panel).getByRole("link", { name: "Trace off_abc" })).toBeInTheDocument();
  });

  it("the Merchant accounts tab asks for sub-accounts first and can switch to main accounts", async () => {
    mock({ accounts: [acct({ kind: "merchant_sub", userId: null, userEmail: null, merchantId: "m1", merchantName: "MihasPay", accountNumber: "5012518213" })] });
    renderWithClient(<AdminSafehavenPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Merchant accounts" }));
    const table = await screen.findByRole("table", { name: "Merchant accounts" });
    expect(within(table).getByText("MihasPay")).toBeInTheDocument();
    expect(seen.at(-1)!.get("kind")).toBe("merchant_sub");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Type" }), "merchant_main");
    await vi_waitFor(() => seen.at(-1)!.get("kind") === "merchant_main");
  });

  it("the Transactions tab ties each event to our transaction, flags the ones it could not, and filters by that", async () => {
    mock({ txs: [tx(), tx({ id: "e9", ourReference: null, transactionId: null })] });
    renderWithClient(<AdminSafehavenPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Transactions" }));
    const table = await screen.findByRole("table", { name: "Safehaven transactions" });
    expect(within(table).getByText("off_abc")).toBeInTheDocument();
    expect(within(table).getByText("Not matched")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Match" }), "unmatched");
    await vi_waitFor(() => seen.at(-1)!.get("matched") === "false");
  });

  it("opens a transaction with both sides, the references and a link to its trace", async () => {
    mock();
    renderWithClient(<AdminSafehavenPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Transactions" }));
    await userEvent.click(await screen.findByText("off_abc"));
    const panel = await screen.findByRole("dialog", { name: "account.credit" });
    expect(within(panel).getByText("₦15,000.00")).toBeInTheDocument();
    expect(within(panel).getByText(/IKPE JESSE 0006991241/)).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Trace this transaction" })).toHaveAttribute("href", "/admin/transactions/off_abc");
  });

  it("opens on the tab and search from the link (the trace page links here)", async () => {
    mock();
    search = "tab=transactions&q=SH-9";
    renderWithClient(<AdminSafehavenPage />);
    expect(await screen.findByRole("table", { name: "Safehaven transactions" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Transactions" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByDisplayValue("SH-9")).toBeInTheDocument();
    await vi.waitFor(() => expect(seen.at(-1)!.get("q")).toBe("SH-9"));
  });

  it("explains an empty list and a failed load", async () => {
    mock({ accounts: [] });
    const { unmount } = renderWithClient(<AdminSafehavenPage />);
    expect(await screen.findByText("No accounts here yet")).toBeInTheDocument();
    unmount();
    mock({ accountsStatus: 500 });
    renderWithClient(<AdminSafehavenPage />);
    expect(await screen.findByText("Couldn't load accounts")).toBeInTheDocument();
  });
});

async function vi_waitFor(check: () => boolean) {
  const { waitFor } = await import("@testing-library/react");
  await waitFor(() => expect(check()).toBe(true));
}
