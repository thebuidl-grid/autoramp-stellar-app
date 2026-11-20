import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import { useAuthStore } from "@/lib/store";
import DataPage from "./page";

vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/layout/footer", () => ({ default: () => null }));

const stats = {
  totalUsers: 52, activeMerchants: 10, pendingVerifications: 1, totalTransactions: 1079, merchantTransactions: 382,
  onramps: 151, offramps: 238, swaps: 312, bankTransfers: 378, failedTransactions: 34, totalAmountTransacted: 1000, currency: "NGN",
};

function dashboardApi() {
  const seen = { hits: 0, auth: null as string | null, email: null as string | null };
  server.use(
    http.get("/api/dashboard", ({ request }) => {
      seen.hits += 1;
      seen.auth = request.headers.get("authorization");
      seen.email = request.headers.get("x-admin-email");
      return HttpResponse.json(stats);
    }),
    http.get("https://api.exchangerate-api.com/v4/latest/USD", () => HttpResponse.json({ rates: { NGN: 1500 } })),
  );
  return seen;
}

describe("/dashboard access", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("asks logged-out visitors to sign in as an admin, and fetches nothing (no more email-only gate)", async () => {
    const seen = dashboardApi();
    useAuthStore.setState({ token: null, user: null, _hasHydrated: true });
    renderWithClient(<DataPage />);

    expect(await screen.findByRole("link", { name: "Admin sign in" })).toHaveAttribute("href", "/auth/admin/login");
    expect(screen.queryByPlaceholderText(/email/i)).not.toBeInTheDocument();
    expect(seen.hits).toBe(0);
  });

  it("does not show the dashboard to a signed-in non-admin user", async () => {
    const seen = dashboardApi();
    useAuthStore.setState({ token: "user-token", user: { id: "u1", email: "u@x.co", role: "USER" } as never, _hasHydrated: true });
    renderWithClient(<DataPage />);

    expect(await screen.findByRole("link", { name: "Admin sign in" })).toBeInTheDocument();
    expect(seen.hits).toBe(0);
  });

  it("loads the stats for an admin session using the bearer token, never an email header", async () => {
    const seen = dashboardApi();
    useAuthStore.setState({ token: "admin-token", user: { id: "a1", email: "admin@x.co", role: "ADMIN" } as never, _hasHydrated: true });
    renderWithClient(<DataPage />);

    await waitFor(() => expect(seen.hits).toBeGreaterThan(0));
    expect(seen.auth).toBe("Bearer admin-token");
    expect(seen.email).toBeNull();
    expect(screen.queryByRole("link", { name: "Admin sign in" })).not.toBeInTheDocument();
  });

  it("tells an admin whose token was rejected to sign in again", async () => {
    server.use(
      http.get("/api/dashboard", () => HttpResponse.json({ statusCode: 403 }, { status: 403 })),
      http.get("https://api.exchangerate-api.com/v4/latest/USD", () => HttpResponse.json({ rates: { NGN: 1500 } })),
    );
    useAuthStore.setState({ token: "stale", user: { id: "a1", email: "admin@x.co", role: "ADMIN" } as never, _hasHydrated: true });
    renderWithClient(<DataPage />);
    expect((await screen.findAllByText("Not authorized")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Sign in again with an admin account/)).toBeInTheDocument();
  });
});
