import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import { useAuthStore } from "@/lib/store";
import { TransferLogsPanel } from "./TransferLogsPanel";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockClear();
  useAuthStore.setState({ token: "admin-jwt" });
});

describe("<TransferLogsPanel /> (the old Transfer Logs page, now a Transactions tab)", () => {
  it("renders logs with a type, a status pill and formatted dates", async () => {
    renderWithClient(<TransferLogsPanel />);
    const row = (await screen.findByText("t-001")).closest("tr") as HTMLElement;
    expect(within(row).getByText("On-ramp")).toBeInTheDocument();
    expect(within(row).getByText("Completed")).toBeInTheDocument();
    expect(within(row).getByText(format(new Date("2026-07-13T10:00:00.000Z"), "MMM d, yyyy HH:mm"))).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Details" })).toHaveAttribute("href", "/admin/transfer-logs/t-001");
  });

  it("steps forward and back through Bitnob-style cursor pages and says where you are", async () => {
    renderWithClient(<TransferLogsPanel />);
    await screen.findByText("t-001");
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Newer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Older" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Older" }));
    const row = (await screen.findByText("t-002")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Off-ramp")).toBeInTheDocument();
    expect(within(row).getByText("Failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Newer" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Older" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Newer" }));
    expect(await screen.findByText("t-001")).toBeInTheDocument();
  });

  it("goes back to the first page when the search changes", async () => {
    let lastCursor: string | null = "unset";
    let lastId: string | null = null;
    server.use(
      http.get("http://localhost/api/admin/transfer-logs", ({ request }) => {
        const url = new URL(request.url);
        lastCursor = url.searchParams.get("cursor");
        lastId = url.searchParams.get("transactionId");
        return HttpResponse.json({ logs: [{ id: "l", transactionId: "t-001", type: "ONRAMP", status: "COMPLETED", createdAt: "2026-07-13T10:00:00.000Z", updatedAt: "2026-07-13T10:01:00.000Z" }], total: 1, limit: 10, nextCursor: null, hasMore: false });
      }),
    );
    renderWithClient(<TransferLogsPanel />);
    await screen.findByText("t-001");
    await userEvent.type(screen.getByRole("textbox", { name: "Find by transaction id" }), "t-001{Enter}");
    await screen.findByText("t-001");
    expect(lastId).toBe("t-001");
    expect(lastCursor).toBeNull();
  });

  it("opens the log detail page when a row is clicked", async () => {
    renderWithClient(<TransferLogsPanel />);
    const table = await screen.findByRole("table", { name: "Transfer logs" });
    await userEvent.click(within(table).getByText("Completed"));
    expect(push).toHaveBeenCalledWith("/admin/transfer-logs/t-001");
  });

  it("explains an empty result and a failed load", async () => {
    server.use(http.get("http://localhost/api/admin/transfer-logs", () => HttpResponse.json({ logs: [], total: 0, limit: 10, nextCursor: null, hasMore: false })));
    const { unmount } = renderWithClient(<TransferLogsPanel />);
    expect(await screen.findByText("No transfer logs found")).toBeInTheDocument();
    unmount();

    server.use(http.get("http://localhost/api/admin/transfer-logs", () => HttpResponse.json({ message: "down" }, { status: 500 })));
    renderWithClient(<TransferLogsPanel />);
    expect(await screen.findByText("Couldn't load transfer logs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
