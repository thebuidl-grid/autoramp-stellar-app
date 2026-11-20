import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import { useAuthStore } from "@/lib/store";
import AdminTransactionsPage from "./page";

let search = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search), useRouter: () => ({ push: vi.fn() }) }));

beforeEach(() => {
  search = "";
  useAuthStore.setState({ token: "admin-jwt" });
});

const tableOf = async () => screen.findByRole("table", { name: "Transactions" });

describe("AdminTransactionsPage", () => {
  it("shows the period's headline numbers in one panel", async () => {
    renderWithClient(<AdminTransactionsPage />);
    const summary = await screen.findByRole("region", { name: /^Summary,/ });
    expect(await within(summary).findByText("₦3,105,000")).toBeInTheDocument(); // volume
    expect(within(summary).getByText("₦1,730,000")).toBeInTheDocument(); // net volume
    expect(within(summary).getByText("15")).toBeInTheDocument(); // transactions
    expect(within(summary).getByText("₦10,600")).toBeInTheDocument(); // fees collected
    expect(summary).toHaveTextContent("Provider ₦10,000 · VAT ₦500 · Stamp duty ₦100");
  });

  it("shows Unavailable, not zeros, when the summary fails", async () => {
    server.use(http.get("http://localhost/api/admin/transactions/summary", () => HttpResponse.json({ message: "boom" }, { status: 500 })));
    renderWithClient(<AdminTransactionsPage />);
    const summary = await screen.findByRole("region", { name: /^Summary,/ });
    expect((await within(summary).findAllByText("Unavailable")).length).toBeGreaterThan(0);
    expect(within(summary).queryByText("₦0")).not.toBeInTheDocument();
  });

  describe("the list and its pagination", () => {
    it("pages by number: jump to a page, and Previous / Next follow", async () => {
      renderWithClient(<AdminTransactionsPage />);
      const first = await tableOf();
      expect(await within(first).findByText("ALL-001")).toBeInTheDocument();

      const nav = screen.getByRole("navigation", { name: "Pagination" });
      expect(within(nav).getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
      expect(within(nav).getByRole("button", { name: "Previous page" })).toBeDisabled();

      await userEvent.click(within(nav).getByRole("button", { name: "Page 2" }));
      expect(await screen.findByText("ALL-002")).toBeInTheDocument();
      expect(within(nav).getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
      expect(within(nav).getByRole("button", { name: "Next page" })).toBeDisabled();

      await userEvent.click(within(nav).getByRole("button", { name: "Previous page" }));
      expect(await screen.findByText("ALL-001")).toBeInTheDocument();
    });

    it("asks the server for the page size you choose, from the first page", async () => {
      const seen: URLSearchParams[] = [];
      server.use(
        http.get("http://localhost/api/admin/platform-transactions", ({ request }) => {
          seen.push(new URL(request.url).searchParams);
          return HttpResponse.json({ data: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 1 } });
        }),
      );
      renderWithClient(<AdminTransactionsPage />);
      await screen.findByText("No transactions yet");
      expect(seen.at(-1)!.get("limit")).toBe("10");
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "50");
      await vi.waitFor(() => expect(seen.at(-1)!.get("limit")).toBe("50"));
      expect(seen.at(-1)!.get("page")).toBe("1");
    });

    it("shows one page of results without page buttons, but still says how many", async () => {
      renderWithClient(<AdminTransactionsPage />);
      await tableOf();
      await userEvent.click(screen.getByRole("tab", { name: "Onramp" }));
      expect(await screen.findByText("ONR-001")).toBeInTheDocument();
      expect(screen.getByText("1–2 of 2")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
    });

    it("goes back to page 1 when you search", async () => {
      renderWithClient(<AdminTransactionsPage />);
      await tableOf();
      const nav = screen.getByRole("navigation", { name: "Pagination" });
      await userEvent.click(within(nav).getByRole("button", { name: "Page 2" }));
      await screen.findByText("ALL-002");

      await userEvent.type(screen.getByRole("textbox", { name: "Find by reference or user" }), "acme{Enter}");
      expect(await screen.findByText("ALL-001")).toBeInTheDocument();
      expect(within(nav).getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    });
  });

  describe("type tabs", () => {
    it("shows the OTC rows with who and how much", async () => {
      renderWithClient(<AdminTransactionsPage />);
      await tableOf();
      await userEvent.click(screen.getByRole("tab", { name: "OTC" }));
      const row = (await screen.findByText("OTC-REF-001")).closest("tr") as HTMLElement;
      expect(within(row).getByText("trader@example.com")).toBeInTheDocument();
      expect(within(row).getByText("OTC")).toBeInTheDocument();
      expect(within(row).getByText("₦275,000.00")).toBeInTheDocument();
    });

    it("shows merchant rows by merchant name with a plain type name", async () => {
      renderWithClient(<AdminTransactionsPage />);
      await tableOf();
      await userEvent.click(screen.getByRole("tab", { name: "Merchant" }));
      const row = (await screen.findByText("M-REF-1")).closest("tr") as HTMLElement;
      expect(within(row).getByText("Acme Ltd")).toBeInTheDocument();
      expect(within(row).getByText("Merchant on-ramp")).toBeInTheDocument();
    });

    it("shows a user off-ramp amount in naira (it is what the customer asked to receive)", async () => {
      renderWithClient(<AdminTransactionsPage />);
      await tableOf();
      await userEvent.click(screen.getByRole("tab", { name: "Offramp" }));
      const row = (await screen.findByText("OFR-001")).closest("tr") as HTMLElement;
      expect(within(row).getByText("₦120,000.00")).toBeInTheDocument();
    });

    it("draws each row's progress as step nodes", async () => {
      renderWithClient(<AdminTransactionsPage />);
      await tableOf();
      await userEvent.click(screen.getByRole("tab", { name: "Offramp" }));
      const row = (await screen.findByText("OFR-001")).closest("tr") as HTMLElement;
      expect(within(row).getByRole("list", { name: "Done: Paid" })).toBeInTheDocument();
    });
  });

  describe("pull-out panel", () => {
    it("opens a transaction from the keyboard and shows its details", async () => {
      renderWithClient(<AdminTransactionsPage />);
      await tableOf();
      await userEvent.click(screen.getByRole("tab", { name: "Offramp" }));
      const row = (await screen.findByText("OFR-001")).closest("tr") as HTMLElement;
      row.focus();
      await userEvent.keyboard("{Enter}");

      const panel = await screen.findByRole("dialog", { name: "Off-ramp" });
      expect(within(panel).getByText("user3@example.com")).toBeInTheDocument();
      expect(within(panel).getByText("Completed")).toBeInTheDocument();
      expect(within(panel).getByRole("list", { name: "Done: Paid" })).toBeInTheDocument();
      expect(within(panel).getByRole("link", { name: /Trace this transaction/ })).toHaveAttribute("href", "/admin/transactions/OFR-001");
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("opened from a link (?q=, ?status=, ?tab=)", () => {
    it("starts with the reference in the search box, so the list is already filtered", async () => {
      search = "q=off_4uby6wYnBpq0b4B0";
      let sent: string | null = null;
      server.use(
        http.get("http://localhost/api/admin/platform-transactions", ({ request }) => {
          sent = new URL(request.url).searchParams.get("search");
          return HttpResponse.json({ data: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 1 } });
        }),
      );
      renderWithClient(<AdminTransactionsPage />);
      expect(await screen.findByDisplayValue("off_4uby6wYnBpq0b4B0")).toBeInTheDocument();
      await screen.findByText("No transactions match these filters");
      expect(sent).toBe("off_4uby6wYnBpq0b4B0");
    });

    it("applies a status from the link, and ignores one the filter does not offer", async () => {
      search = "status=failed";
      const { unmount } = renderWithClient(<AdminTransactionsPage />);
      expect(await screen.findByRole("combobox", { name: "Status" })).toHaveValue("FAILED");
      unmount();

      search = "status=NONSENSE";
      renderWithClient(<AdminTransactionsPage />);
      expect(await screen.findByRole("combobox", { name: "Status" })).toHaveValue("all");
    });

    it("opens on the Transfer logs tab when asked (old Transfer Logs links)", async () => {
      search = "tab=transfer-logs";
      renderWithClient(<AdminTransactionsPage />);
      expect(await screen.findByRole("tab", { name: "Transfer logs" })).toHaveAttribute("aria-selected", "true");
      expect(await screen.findByRole("table", { name: "Transfer logs" })).toBeInTheDocument();
      expect(screen.queryByRole("table", { name: "Transactions" })).not.toBeInTheDocument();
    });

    it("opens on the Stuck or Failed tab from a needs-attention link", async () => {
      server.use(
        http.get("http://localhost/api/admin/transactions/stuck", () => HttpResponse.json({ total: 0, limit: 10, offset: 0, items: [] })),
        http.get("http://localhost/api/admin/transactions/failed", () => HttpResponse.json({ total: 0, limit: 10, offset: 0, items: [] })),
      );
      search = "tab=stuck";
      const { unmount } = renderWithClient(<AdminTransactionsPage />);
      expect(await screen.findByRole("tab", { name: "Stuck" })).toHaveAttribute("aria-selected", "true");
      expect(await screen.findByText("Nothing is stuck")).toBeInTheDocument();
      unmount();
      search = "tab=failed";
      renderWithClient(<AdminTransactionsPage />);
      expect(await screen.findByRole("tab", { name: "Failed" })).toHaveAttribute("aria-selected", "true");
      expect(await screen.findByText("Nothing has failed")).toBeInTheDocument();
    });

    it("ignores a tab it does not know", async () => {
      search = "tab=nonsense";
      renderWithClient(<AdminTransactionsPage />);
      expect(await screen.findByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
    });
  });
});
