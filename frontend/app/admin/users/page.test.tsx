import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import AdminUsersPage from "./page";

const API = "http://localhost/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

// The email appears twice per row (User column + Contact column), so scope
// to the row via the first match rather than a single findByText/getByText.
function rowFor(text: string) {
  return screen.getAllByText(text)[0].closest("tr") as HTMLElement;
}

describe("AdminUsersPage", () => {
  it("renders the user list with role and status", async () => {
    renderWithClient(<AdminUsersPage />);

    await waitFor(() => expect(screen.getAllByText("admin@example.com").length).toBeGreaterThan(0));
    const adminRow = rowFor("admin@example.com");
    expect(within(adminRow).getByText("ADMIN")).toBeInTheDocument();
    expect(within(adminRow).getByText("Active")).toBeInTheDocument();

    const suspendedRow = rowFor("user3@example.com");
    expect(within(suspendedRow).getByText("Suspended")).toBeInTheDocument();

    expect(screen.getByText("Showing 1 to 3 of 3 users")).toBeInTheDocument();
  });

  it("filters by status using the Active/Suspended toggle", async () => {
    renderWithClient(<AdminUsersPage />);
    await waitFor(() => expect(screen.getAllByText("admin@example.com").length).toBeGreaterThan(0));

    await userEvent.click(screen.getByRole("button", { name: "Suspended" }));

    await waitFor(() => expect(screen.getAllByText("user3@example.com").length).toBeGreaterThan(0));
    expect(screen.queryByText("admin@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("user2@example.com")).not.toBeInTheDocument();
  });

  it("filters by role using the Admins/Users toggle", async () => {
    renderWithClient(<AdminUsersPage />);
    await waitFor(() => expect(screen.getAllByText("admin@example.com").length).toBeGreaterThan(0));

    await userEvent.click(screen.getByRole("button", { name: "Admins" }));

    await waitFor(() => expect(screen.getAllByText("admin@example.com").length).toBeGreaterThan(0));
    expect(screen.queryByText("user2@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("user3@example.com")).not.toBeInTheDocument();
  });

  it("paginates across multiple pages", async () => {
    const manyUsers = Array.from({ length: 12 }, (_, i) => ({
      id: `bulk-${i + 1}`,
      email: `bulk${i + 1}@example.com`,
      role: "USER",
      suspended: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    server.use(
      http.get(`${API}/admin/users`, ({ request }) => {
        const url = new URL(request.url);
        const page = Number(url.searchParams.get("page")) || 1;
        const limit = 10;
        const paged = manyUsers.slice((page - 1) * limit, page * limit);
        return HttpResponse.json({
          users: paged,
          pagination: { page, limit, total: manyUsers.length, totalPages: 2 },
        });
      }),
    );

    renderWithClient(<AdminUsersPage />);

    await waitFor(() => expect(screen.getAllByText("bulk1@example.com").length).toBeGreaterThan(0));
    expect(screen.getByText("Showing 1 to 10 of 12 users")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Next/ }));

    await waitFor(() => expect(screen.getAllByText("bulk11@example.com").length).toBeGreaterThan(0));
    expect(screen.getByText("Showing 11 to 12 of 12 users")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });
});
