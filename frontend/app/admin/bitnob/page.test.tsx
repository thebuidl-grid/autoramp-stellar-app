import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import { useAuthStore } from "@/lib/store";
import AdminBitnobPage from "./page";

let urlSearch = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(urlSearch) }));

const URL = "http://localhost/api/admin/bitnob";

// The records from the live page: Bitnob already puts the sign and currency inside amount_formatted.
const payout = { transaction_id: "tx-1", reference: "off_4uby6wYnBpq0b4B0", type: "PAYOUT", state: "SETTLED", side: "Debit", currency: "USDC", amount_formatted: "-5.000002 USDC", fee_formatted: "0.0 USDC", created_at: "2026-11-20T13:11:00Z", updated_at: "2026-11-20T13:12:00Z", account_number: "3000000002", value_date: "2026-11-20", metadata: { customer_id: "c-123", chain: "stellar" } };
const deposit = { transaction_id: "tx-2", reference: "RCV_USDC_3b18018a1ce0", type: "DEPOSIT_CONFIRMED", state: "SETTLED", side: "Credit", currency: "USDC", amount_formatted: "+5.000253 USDC", fee_formatted: "0.0 USDC", created_at: "2026-11-20T13:11:00Z" };
const balances = { data: { accounts: [{ account_id: "a", currency: "USDC", available_balance_formatted: "12.5", ledger_balance_formatted: "12.5" }, { account_id: "b", currency: "BTC", available_balance_formatted: "0.145", ledger_balance_formatted: "0.15" }] } };

let seen: URLSearchParams[] = [];

function mock(over: { transactions?: (url: URL) => Response | Promise<Response>; balances?: Response } = {}) {
  seen = [];
  server.use(
    http.get(`${URL}/balances`, () => over.balances ?? HttpResponse.json(balances)),
    http.get(`${URL}/transactions`, ({ request }) => {
      const url = new globalThis.URL(request.url);
      seen.push(url.searchParams);
      if (over.transactions) return over.transactions(url);
      return HttpResponse.json({ data: { transactions: [payout, deposit], total_count: 2 } });
    }),
  );
}

beforeEach(() => {
  urlSearch = "";
  useAuthStore.setState({ token: "admin-jwt" });
});

describe("AdminBitnobPage", () => {
  it("opens already filtered to one reference from the link (the trace page links here)", async () => {
    mock();
    urlSearch = "reference=off_4uby6wYnBpq0b4B0";
    renderWithClient(<AdminBitnobPage />);
    expect(await screen.findByDisplayValue("off_4uby6wYnBpq0b4B0")).toBeInTheDocument();
    await vi.waitFor(() => expect(seen.at(-1)!.get("reference")).toBe("off_4uby6wYnBpq0b4B0"));
  });

  it("shows what we hold and the records, without the doubled sign and currency", async () => {
    mock();
    renderWithClient(<AdminBitnobPage />);

    const balancesPanel = await screen.findByRole("region", { name: "Balances at Bitnob" });
    expect(await within(balancesPanel).findByText("12.50 USDC")).toBeInTheDocument();
    expect(within(balancesPanel).getByText("0.145 BTC")).toBeInTheDocument();

    const table = await screen.findByRole("table", { name: "Bitnob transactions" });
    expect(within(table).getByText("−5.000002 USDC")).toBeInTheDocument();
    expect(within(table).getByText("+5.000253 USDC")).toBeInTheDocument();
    expect(table).not.toHaveTextContent(/--|USDC USDC/);
    expect(within(table).getByText("Payout")).toBeInTheDocument();
    expect(within(table).getByText("Deposit")).toBeInTheDocument();
    expect(within(table).getAllByText("Settled")).toHaveLength(2);
    expect(screen.getByText("1–2 of 2")).toBeInTheDocument();
  });

  it("no longer has a separate Payouts tab (payouts are rows in the list)", async () => {
    mock();
    renderWithClient(<AdminBitnobPage />);
    await screen.findByRole("table", { name: "Bitnob transactions" });
    expect(screen.queryByRole("tab", { name: "Payouts" })).not.toBeInTheDocument();
    expect(seen.every((p) => !p.has("status"))).toBe(true);
  });

  describe("pull-out panel", () => {
    it("opens from the keyboard, shows the record, and links our own references to the AutoRamp transaction", async () => {
      mock();
      renderWithClient(<AdminBitnobPage />);
      const table = await screen.findByRole("table", { name: "Bitnob transactions" });
      const row = within(table).getByText("Payout").closest("tr")!;
      row.focus();
      await userEvent.keyboard("{Enter}");

      const panel = await screen.findByRole("dialog", { name: "Payout" });
      expect(within(panel).getByText("−5.000002 USDC")).toBeInTheDocument();
      expect(within(panel).getByText("Money out")).toBeInTheDocument();
      expect(within(panel).getByText("Customer id")).toBeInTheDocument();
      expect(within(panel).getByText("stellar")).toBeInTheDocument();
      expect(within(panel).getByRole("link", { name: /Open the AutoRamp transaction/ })).toHaveAttribute("href", "/admin/transactions/off_4uby6wYnBpq0b4B0");

      await userEvent.click(within(panel).getByRole("button", { name: "Close panel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("says there is nothing to open for a record Bitnob created", async () => {
      mock();
      renderWithClient(<AdminBitnobPage />);
      const table = await screen.findByRole("table", { name: "Bitnob transactions" });
      await userEvent.click(within(table).getByText("Deposit"));
      const panel = await screen.findByRole("dialog", { name: "Deposit" });
      expect(within(panel).getByText("Money in")).toBeInTheDocument();
      expect(within(panel).queryByRole("link", { name: /Open the AutoRamp transaction/ })).not.toBeInTheDocument();
      expect(within(panel).getByText(/no AutoRamp transaction with this reference/)).toBeInTheDocument();
    });

    it("closes on Escape", async () => {
      mock();
      renderWithClient(<AdminBitnobPage />);
      await userEvent.click(within(await screen.findByRole("table", { name: "Bitnob transactions" })).getByText("Payout"));
      await screen.findByRole("dialog");
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("search and filters", () => {
    it("finds a record by reference, and clearing the search brings the full list back", async () => {
      mock({
        transactions: (url) =>
          HttpResponse.json({ data: { transactions: url.searchParams.get("reference") === "off_4uby6wYnBpq0b4B0" ? [payout] : [payout, deposit], total_count: 1 } }),
      });
      renderWithClient(<AdminBitnobPage />);
      await screen.findByRole("table", { name: "Bitnob transactions" });

      await userEvent.type(screen.getByRole("textbox", { name: "Find by reference" }), "  off_4uby6wYnBpq0b4B0 {Enter}");
      await screen.findByText("1–1 of 1");
      expect(seen.at(-1)!.get("reference")).toBe("off_4uby6wYnBpq0b4B0");
      expect(screen.queryByText("Deposit")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
      expect(await screen.findByText("Deposit")).toBeInTheDocument();
      expect(seen.at(-1)!.has("reference")).toBe(false);
    });

    it("explains an empty search instead of showing a blank table", async () => {
      mock({ transactions: () => HttpResponse.json({ data: {} }) });
      renderWithClient(<AdminBitnobPage />);
      await userEvent.type(await screen.findByRole("textbox", { name: "Find by reference" }), "off_nope{Enter}");
      expect(await screen.findByText("No Bitnob record with reference off_nope")).toBeInTheDocument();
      expect(screen.getByText(/References must match exactly/)).toBeInTheDocument();
    });

    it("filters by direction using Bitnob's own filter", async () => {
      mock();
      renderWithClient(<AdminBitnobPage />);
      await screen.findByRole("table", { name: "Bitnob transactions" });
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Direction" }), "inflow");
      await screen.findByRole("table", { name: "Bitnob transactions" });
      expect(seen.at(-1)!.get("direction")).toBe("inflow");
    });
  });

  it("lets you choose how many rows per page, and goes back to the first page when you do", async () => {
    mock({
      transactions: (url) =>
        HttpResponse.json({ data: url.searchParams.get("cursor") ? { transactions: [deposit], total_count: 60 } : { transactions: [payout], next_cursor: "c2", total_count: 60 } }),
    });
    renderWithClient(<AdminBitnobPage />);
    await screen.findByText("Page 1 of 3"); // 60 rows at 25 per page
    expect(seen.at(-1)!.get("limit")).toBe("25");
    await userEvent.click(screen.getByRole("button", { name: "Older" }));
    await screen.findByText("Page 2 of 3");

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "50");
    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    expect(seen.at(-1)!.get("limit")).toBe("50");
    expect(seen.at(-1)!.has("cursor")).toBe(false);
  });

  it("pages with Bitnob's cursor", async () => {
    mock({
      transactions: (url) =>
        HttpResponse.json({ data: url.searchParams.get("cursor") ? { transactions: [deposit], total_count: 2 } : { transactions: [payout], next_cursor: "c2", total_count: 2 } }),
    });
    renderWithClient(<AdminBitnobPage />);
    await screen.findByText("Payout");
    expect(screen.getByRole("button", { name: "Newer" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Older" }));
    expect(await screen.findByText("Deposit")).toBeInTheDocument();
    expect(seen.at(-1)!.get("cursor")).toBe("c2");
    await userEvent.click(screen.getByRole("button", { name: "Newer" }));
    expect(await screen.findByText("Payout")).toBeInTheDocument();
  });

  it("tells the admin how to fix an IP allowlist refusal, and offers a retry for the list", async () => {
    mock({
      balances: HttpResponse.json({ code: "FORBIDDEN", detail: "IP address not whitelisted" }, { status: 403 }),
      transactions: () => HttpResponse.json({ detail: "IP address not whitelisted" }, { status: 403 }),
    });
    renderWithClient(<AdminBitnobPage />);
    const balancesPanel = await screen.findByRole("region", { name: "Balances at Bitnob" });
    expect(await within(balancesPanel).findByRole("alert")).toHaveTextContent(/IP address not whitelisted.*allowlist/);
    expect(await screen.findByText("Couldn't load Bitnob transactions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
