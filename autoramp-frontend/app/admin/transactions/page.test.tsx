import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithClient } from "@/test/test-utils";
import AdminTransactionsPage from "./page";

// Card titles and their card body are siblings two levels up from the title
// element, so this scopes assertions to one card and avoids matching
// duplicate text across cards.
function cardFor(title: string) {
  const heading = screen.getByText(title);
  return within(heading.parentElement!.parentElement as HTMLElement);
}

describe("AdminTransactionsPage", () => {
  it("renders the summary stat cards from the API", async () => {
    renderWithClient(<AdminTransactionsPage />);

    // Top summary cards
    expect(await screen.findByText("₦3,105,000")).toBeInTheDocument(); // Total Volume
    expect(screen.getByText("₦1,730,000")).toBeInTheDocument(); // Net Volume
    expect(screen.getByText("15")).toBeInTheDocument(); // Total Requests
    expect(cardFor("Total Fees Collected").getByText("₦10,600")).toBeInTheDocument();

    // Per-type tiles
    expect(screen.getByText("₦1,370,000")).toBeInTheDocument(); // Onramp
    expect(screen.getByText("₦700,000")).toBeInTheDocument(); // Offramp
    expect(screen.getByText("₦760,000")).toBeInTheDocument(); // Swap
    expect(screen.getByText("₦275,000")).toBeInTheDocument(); // OTC

    // Fee breakdown
    expect(screen.getByText("₦10,000")).toBeInTheDocument(); // provider fee
    expect(screen.getByText("₦500")).toBeInTheDocument(); // VAT
    expect(screen.getByText("₦100")).toBeInTheDocument(); // stamp duty
  });

  it("shows the 'all' tab offset-paginated and pages forward/backward by page number", async () => {
    renderWithClient(<AdminTransactionsPage />);

    expect(await screen.findByText("ALL-001")).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("ALL-002")).toBeInTheDocument();
    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("switches the onramp tab into offset pagination and steps forward/backward by page number", async () => {
    renderWithClient(<AdminTransactionsPage />);
    await screen.findByText("ALL-001");

    await userEvent.click(screen.getByRole("tab", { name: "Onramp" }));

    expect(await screen.findByText("ONR-001")).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("ONR-002")).toBeInTheDocument();
    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Previous" }));

    expect(await screen.findByText("ONR-001")).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
  });

  it("renders the OTC badge and row for the otc tab", async () => {
    renderWithClient(<AdminTransactionsPage />);
    await screen.findByText("ALL-001");

    await userEvent.click(screen.getByRole("tab", { name: "OTC" }));

    const referenceCell = await screen.findByText("OTC-REF-001");
    const row = referenceCell.closest("tr") as HTMLElement;
    expect(within(row).getByText("trader@example.com")).toBeInTheDocument();
    expect(within(row).getByText("OTC")).toBeInTheDocument();
    // A single, non-hasMore page shouldn't render pagination controls at all.
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("renders merchant rows with merchantName instead of userEmail, and the merchant type badges", async () => {
    renderWithClient(<AdminTransactionsPage />);
    await screen.findByText("ALL-001");

    await userEvent.click(screen.getByRole("tab", { name: "Merchant" }));

    expect(await screen.findByText("M-REF-1")).toBeInTheDocument();
    expect(screen.getByText("Acme Ltd")).toBeInTheDocument();
    expect(screen.getByText("Merchant Onramp")).toBeInTheDocument();
  });

  it("resets pagination back to the first page when the search term changes", async () => {
    renderWithClient(<AdminTransactionsPage />);
    await screen.findByText("ALL-001");

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("ALL-002");

    await userEvent.type(screen.getByPlaceholderText("Search ref or user..."), "acme");

    await waitFor(() => expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument());
    await screen.findByText("ALL-001");
  });
});
