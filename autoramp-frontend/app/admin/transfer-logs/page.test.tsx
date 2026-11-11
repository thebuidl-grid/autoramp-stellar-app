import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { renderWithClient } from "@/test/test-utils";
import AdminTransferLogsPage from "./page";

describe("AdminTransferLogsPage", () => {
  it("renders logs with type/status badges and formatted dates", async () => {
    renderWithClient(<AdminTransferLogsPage />);

    const row = (await screen.findByText("t-001")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Onramp")).toBeInTheDocument();
    expect(within(row).getByText("Completed")).toBeInTheDocument();
    const expectedCreated = format(new Date("2026-07-13T10:00:00.000Z"), "MMM d, yyyy HH:mm");
    expect(within(row).getByText(expectedCreated)).toBeInTheDocument();
  });

  it("shows no pagination controls until hasMore/canGoPrevious is true, then steps forward and back via cursor", async () => {
    renderWithClient(<AdminTransferLogsPage />);
    await screen.findByText("t-001");

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(screen.getByText(/Page 1 of ~1/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("t-002")).toBeInTheDocument();
    const row = screen.getByText("t-002").closest("tr") as HTMLElement;
    expect(within(row).getByText("Offramp")).toBeInTheDocument();
    expect(within(row).getByText("Failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Previous" }));

    expect(await screen.findByText("t-001")).toBeInTheDocument();
  });

  it("resets pagination when the transaction ID search changes", async () => {
    renderWithClient(<AdminTransferLogsPage />);
    await screen.findByText("t-001");

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("t-002");

    await userEvent.type(screen.getByPlaceholderText("Search transaction ID..."), "t-001");

    // Reset lands back on the first cursor page.
    expect(await screen.findByText("t-001")).toBeInTheDocument();
  });
});
