import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import { useAuthStore } from "@/lib/store";
import MerchantDashboardPage from "./page";

const API = "http://localhost/api";
const account = { accountId: "a1", accountNumber: "0123456789", bankCode: "058", accountBalance: 4812300, bookBalance: 4932300, accountName: "Acme Ltd", status: "ACTIVE" };

function mock(over: { status?: unknown; account?: unknown | null; keys?: unknown[]; txs?: unknown[]; accountStatus?: number; txStatus?: number } = {}) {
  server.use(
    http.get(`${API}/merchants/status`, () => HttpResponse.json(over.status ?? { onboardingStaus: "VERIFIED", hasMerchantRecord: true, merchantId: "m1" })),
    http.get(`${API}/merchants/bank/account`, () =>
      over.accountStatus ? HttpResponse.json({ message: "x" }, { status: over.accountStatus }) : over.account === null ? HttpResponse.json(null) : HttpResponse.json(over.account ?? account),
    ),
    http.get(`${API}/merchants/api-keys`, () => HttpResponse.json(over.keys ?? [{ id: "k" }])),
    http.get(`${API}/merchants/m1/transactions`, () =>
      over.txStatus ? HttpResponse.json({ message: "x" }, { status: over.txStatus }) : HttpResponse.json({ data: over.txs ?? [], meta: { total: 0, page: 1, limit: 6, totalPages: 1 } }),
    ),
    http.get(`${API}/otc/isEnabled`, () => HttpResponse.json({ isOTCEnabled: false, isOnboarded: false })),
  );
}

beforeEach(() => useAuthStore.setState({ token: "t", user: { id: "u1", email: "a@b.co" } as never }));

describe("MerchantDashboardPage (the counter home)", () => {
  it("leads with the balance: available now, and what is still clearing", async () => {
    mock();
    renderWithClient(<MerchantDashboardPage />);
    expect(await screen.findByText("₦4,812,300.00")).toBeInTheDocument();
    expect(screen.getByText(/₦120,000\.00/)).toBeInTheDocument();
    expect(screen.getByText(/still clearing/)).toBeInTheDocument();
    expect(screen.getByText(/Acme Ltd · 0123456789/)).toBeInTheDocument();
  });

  it("no longer shows the API-key stat cards", async () => {
    mock();
    renderWithClient(<MerchantDashboardPage />);
    await screen.findByText("₦4,812,300.00");
    for (const gone of ["Total API Keys", "Active Keys", "Total Requests", "Merchant Dashboard"]) expect(screen.queryByText(gone)).not.toBeInTheDocument();
  });

  it("lists recent activity with a plain name, detail, amount and status", async () => {
    mock({ txs: [{ id: "t1", type: "bank_transfer", amount: 149700, status: "COMPLETED", createdAt: "2026-11-20T10:00:00.000Z", reference: "r1", details: { narration: "Invoice 12" } }] });
    renderWithClient(<MerchantDashboardPage />);
    const item = (await screen.findByText("Bank transfer")).closest("li") as HTMLElement;
    expect(within(item).getByText("₦149,700.00")).toBeInTheDocument();
    expect(within(item).getByText("Completed")).toBeInTheDocument();
    expect(item).toHaveTextContent("Invoice 12");
  });

  it("shows the reference on each row and opens every id and the fees in a panel", async () => {
    mock({ txs: [{ id: "t1", type: "bank_transfer", amount: 149700, status: "COMPLETED", createdAt: "2026-11-20T10:00:00.000Z", reference: "txn_ref_ABC", details: { narration: "Invoice 12", providerReference: "SH-998877" }, fees: [{ type: "provider_fee", amount: "50.00", currency: "NGN" }, { type: "vat", amount: "3.75", currency: "NGN" }] }] });
    renderWithClient(<MerchantDashboardPage />);
    const row = (await screen.findByText("txn_ref_ABC")).closest("button") as HTMLElement;
    await userEvent.click(row);
    const panel = await screen.findByRole("dialog", { name: "Bank transfer" });
    expect(within(panel).getByText("Provider reference")).toBeInTheDocument();
    expect(within(panel).getByText("SH-998877")).toBeInTheDocument();
    expect(within(panel).getByText("Provider fee")).toBeInTheDocument();
    expect(within(panel).getByText("Fees in total").closest("div")).toHaveTextContent("₦53.75");
    expect(within(panel).getByText("After fees").closest("div")).toHaveTextContent("₦149,646.25");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("says so when there is no activity yet, and when it cannot be loaded", async () => {
    mock();
    const { unmount } = renderWithClient(<MerchantDashboardPage />);
    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
    unmount();
    mock({ txStatus: 500 });
    renderWithClient(<MerchantDashboardPage />);
    expect(await screen.findByText("Couldn't load your activity")).toBeInTheDocument();
  });

  it("shows the setup checklist only while something is left, and hides it when done", async () => {
    mock({ status: { onboardingStaus: "PENDING", hasMerchantRecord: true, merchantId: "m1" }, keys: [] });
    const { unmount } = renderWithClient(<MerchantDashboardPage />);
    expect(await screen.findByText("Finish setting up")).toBeInTheDocument();
    expect(screen.getByText(/Under review/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create an API key/ })).toHaveAttribute("href", "/merchant/dashboard/api-keys");
    unmount();
    mock();
    renderWithClient(<MerchantDashboardPage />);
    await screen.findByText("₦4,812,300.00");
    expect(screen.queryByText("Finish setting up")).not.toBeInTheDocument();
  });

  it("invites the merchant to open an account when they have none", async () => {
    mock({ account: null });
    renderWithClient(<MerchantDashboardPage />);
    expect(await screen.findByText("No business account yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open your account" })).toHaveAttribute("href", "/merchant/dashboard/bank");
  });

  it("explains a balance that failed to load instead of showing zero", async () => {
    mock({ accountStatus: 500 });
    renderWithClient(<MerchantDashboardPage />);
    expect(await screen.findByText("Couldn't load your balance")).toBeInTheDocument();
    expect(screen.queryByText("₦0.00")).not.toBeInTheDocument();
  });
});
