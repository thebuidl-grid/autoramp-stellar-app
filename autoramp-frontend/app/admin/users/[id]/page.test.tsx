import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import UserDetailPage from "./page";

const API = "http://localhost/api";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "user-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "jane@example.com",
    phoneNumber: "+10000000099",
    role: "USER",
    isMerchant: false,
    isApiAccessApproved: false,
    isOTCEnabled: false,
    suspended: false,
    suspendedAt: null,
    walletAddress: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    _count: { onrampTransactions: 2, offrampTransactions: 1 },
    ...overrides,
  };
}

describe("UserDetailPage", () => {
  it("renders the user's profile information", async () => {
    server.use(http.get(`${API}/admin/users/user-1`, () => HttpResponse.json(baseUser())));

    renderWithClient(<UserDetailPage />);

    expect(await screen.findByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("+10000000099")).toBeInTheDocument();
    expect(screen.getByText("USER")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // onramp count
    expect(screen.getByText("1")).toBeInTheDocument(); // offramp count
  });

  it("suspending the user refetches and flips the button to Unsuspend", async () => {
    let suspended = false;
    server.use(
      http.get(`${API}/admin/users/user-1`, () => HttpResponse.json(baseUser({ suspended }))),
      http.patch(`${API}/admin/users/user-1/suspend`, async ({ request }) => {
        const body = (await request.json()) as { suspend: boolean };
        suspended = body.suspend;
        return HttpResponse.json({ message: "User suspension status updated." });
      }),
    );

    renderWithClient(<UserDetailPage />);
    await screen.findByText("jane@example.com");

    await userEvent.click(screen.getByRole("button", { name: "Suspend User" }));

    expect(await screen.findByRole("button", { name: "Unsuspend User" })).toBeInTheDocument();
    expect(await screen.findByText("ACCOUNT SUSPENDED")).toBeInTheDocument();
  });

  it("toggling the OTC switch persists the new value after refetch", async () => {
    let otcEnabled = false;
    server.use(
      http.get(`${API}/admin/users/user-1`, () => HttpResponse.json(baseUser({ isOTCEnabled: otcEnabled }))),
      http.patch(`${API}/admin/users/user-1/flags`, async ({ request }) => {
        const body = (await request.json()) as { isOTCEnabled?: boolean };
        if (typeof body.isOTCEnabled === "boolean") otcEnabled = body.isOTCEnabled;
        return HttpResponse.json(baseUser({ isOTCEnabled: otcEnabled }));
      }),
    );

    renderWithClient(<UserDetailPage />);
    await screen.findByText("jane@example.com");

    // Merchant, API Access, OTC Enablement toggles render in that order.
    const otcToggle = screen.getAllByRole("switch")[2];
    expect(otcToggle).toHaveAttribute("aria-checked", "false");

    await userEvent.click(otcToggle);

    await waitFor(() => expect(screen.getAllByRole("switch")[2]).toHaveAttribute("aria-checked", "true"));
  });
});
