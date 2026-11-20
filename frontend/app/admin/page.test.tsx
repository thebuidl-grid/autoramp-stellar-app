import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import { useAuthStore } from "@/lib/store";
import { dailyVolumeSeries } from "@/lib/hooks/use-admin-overview";
import AdminOverviewPage from "./page";

const API = "http://localhost/api";

const summary = { totalVolume: 12345678, totalCount: 1204, successRate: 97.6 };
const day = (date: string, v: number) => ({
  date,
  onrampVolume: v, onrampCount: 1, offrampVolume: v, offrampCount: 1, swapVolume: 0, swapCount: 0,
  bankTransferVolume: 0, bankTransferCount: 0, vasVolume: 0, vasCount: 0, otcVolume: 0, otcCount: 0,
  totalVolume: v * 2, totalCount: 2, totalFees: 0,
});
const merchants = (pending: number) => [
  ...Array.from({ length: pending }, (_, i) => ({ id: `p${i}`, status: "PENDING" })),
  { id: "v1", status: "VERIFIED" },
  { id: "r1", status: "REJECTED" },
];
const balances = { data: { accounts: [{ account_id: "a", currency: "USDT", available_balance_formatted: "2350", ledger_balance_formatted: "2500" }, { account_id: "b", currency: "BTC", available_balance_formatted: "0.145", ledger_balance_formatted: "0.15" }] } };

function mockApi(over: { merchants?: any; summary?: any; balances?: any; attention?: any } = {}) {
  server.use(
    http.get(`${API}/admin/transactions/summary`, () => over.summary ?? HttpResponse.json(summary)),
    http.get(`${API}/admin/transactions/analytics`, () => HttpResponse.json([day("2026-11-02", 10), day("2026-11-01", 5)])),
    http.get(`${API}/merchants/onboarding`, () => over.merchants ?? HttpResponse.json(merchants(2))),
    http.get(`${API}/admin/transactions/attention`, () => over.attention ?? HttpResponse.json({ failed: 0, stuck: 0, unmatchedWebhooks: 0 })),
    http.get(`${API}/admin/bitnob/balances`, () => over.balances ?? HttpResponse.json(balances)),
  );
}

beforeEach(() => useAuthStore.setState({ token: "admin-jwt" }));

describe("<AdminOverviewPage />", () => {
  it("leads with what needs attention, then the money numbers", async () => {
    mockApi();
    renderWithClient(<AdminOverviewPage />);

    const attention = await screen.findByRole("region", { name: "Needs attention" });
    const link = await within(attention).findByRole("link", { name: /2 merchants waiting for review/ });
    expect(link).toHaveAttribute("href", "/admin/merchants");

    const money = screen.getByRole("region", { name: "Money, last 30 days" });
    expect(await within(money).findByText("₦12,345,678")).toBeInTheDocument();
    expect(within(money).getByText("1,204")).toBeInTheDocument();
    expect(within(money).getByText("98%")).toBeInTheDocument();
    expect(await within(money).findByText("2,350 USDT")).toBeInTheDocument();
    expect(within(money).getByText("0.145 BTC")).toBeInTheDocument();
    expect(within(money).getByRole("img", { name: "Daily volume trend" })).toBeInTheDocument();
  });

  it("lists failed, stuck and unmatched items from the tracker, most urgent first, each linking to where to act", async () => {
    mockApi({ attention: HttpResponse.json({ failed: 5, stuck: 3, unmatchedWebhooks: 438 }) });
    renderWithClient(<AdminOverviewPage />);
    const attention = await screen.findByRole("region", { name: "Needs attention" });
    const links = await within(attention).findAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining("5 failed transactions"),
      expect.stringContaining("3 stuck transactions"),
      expect.stringContaining("438 webhooks not matched to a transaction"),
      expect.stringContaining("2 merchants waiting for review"),
    ]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/admin/transactions?tab=failed", "/admin/transactions?tab=stuck", "/admin/webhooks?tab=unmatched", "/admin/merchants"]);
  });

  it("offers a retry if the tracker counts fail, instead of pretending all is well", async () => {
    mockApi({ attention: HttpResponse.json({ message: "down" }, { status: 500 }) });
    renderWithClient(<AdminOverviewPage />);
    expect(await screen.findByText("Couldn't check what needs attention")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("Nothing needs your attention")).not.toBeInTheDocument();
  });

  it("says all is well when nothing needs attention, instead of showing an empty box", async () => {
    mockApi({ merchants: HttpResponse.json(merchants(0)) });
    renderWithClient(<AdminOverviewPage />);
    expect(await screen.findByText("Nothing needs your attention")).toBeInTheDocument();
  });

  it("shows Unavailable, not a zero, when the money summary fails — and still shows the rest", async () => {
    mockApi({ summary: HttpResponse.json({ message: "boom" }, { status: 500 }) });
    renderWithClient(<AdminOverviewPage />);
    const money = screen.getByRole("region", { name: "Money, last 30 days" });
    expect(await within(money).findAllByText("Unavailable")).not.toHaveLength(0);
    expect(within(money).queryByText("₦0")).not.toBeInTheDocument();
    expect(within(money).queryByText("0%")).not.toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /merchants waiting for review/ })).toBeInTheDocument();
  });

  it("shows Bitnob as unavailable (with the reason on hover) when its balances fail, keeping the other numbers", async () => {
    mockApi({ balances: HttpResponse.json({ detail: "IP address not whitelisted" }, { status: 403 }) });
    renderWithClient(<AdminOverviewPage />);
    const money = screen.getByRole("region", { name: "Money, last 30 days" });
    expect(await within(money).findByText("₦12,345,678")).toBeInTheDocument();
    expect(await within(money).findByTitle("IP address not whitelisted")).toHaveTextContent("Unavailable");
  });

  it("offers a retry when the attention check fails", async () => {
    mockApi({ merchants: HttpResponse.json({ message: "down" }, { status: 500 }) });
    renderWithClient(<AdminOverviewPage />);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByText("Couldn't check what needs attention")).toBeInTheDocument();
  });

  it("no longer shows the made-up 'All systems go' status", async () => {
    mockApi();
    renderWithClient(<AdminOverviewPage />);
    await screen.findByRole("region", { name: "Needs attention" });
    expect(screen.queryByText(/all systems go/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Operational")).not.toBeInTheDocument();
  });
});

describe("dailyVolumeSeries", () => {
  it("adds every type per day, oldest first, ignoring bad numbers", () => {
    expect(dailyVolumeSeries([day("2026-11-02", 10), day("2026-11-01", 5), { ...day("2026-11-03", 1), swapVolume: Number.NaN }])).toEqual([10, 20, 2]);
    expect(dailyVolumeSeries(undefined)).toEqual([]);
  });
});
