import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import { useAuthStore } from "@/lib/store";
import AdminUsersPage from "./page";

const API = "http://localhost/api";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }) }));

beforeEach(() => {
  push.mockClear();
  useAuthStore.setState({ token: "admin-jwt" });
});

const rowFor = async (email: string) => (await screen.findByText(email)).closest("tr") as HTMLElement;

describe("AdminUsersPage", () => {
  it("lists users with role and status, each email once", async () => {
    renderWithClient(<AdminUsersPage />);
    const adminRow = await rowFor("admin@example.com");
    expect(within(adminRow).getByText("admin")).toBeInTheDocument();
    expect(within(adminRow).getByText("Active")).toBeInTheDocument();
    const suspendedRow = await rowFor("user3@example.com");
    expect(within(suspendedRow).getByText("Suspended")).toBeInTheDocument();
    expect(screen.getAllByText("admin@example.com")).toHaveLength(1);
    expect(screen.getByText("1–3 of 3")).toBeInTheDocument();
  });

  it("no longer shows an 'Add User' button that did nothing", async () => {
    renderWithClient(<AdminUsersPage />);
    await screen.findByText("admin@example.com");
    expect(screen.queryByRole("button", { name: /add user/i })).not.toBeInTheDocument();
  });

  it("filters by status with the tabs", async () => {
    renderWithClient(<AdminUsersPage />);
    await screen.findByText("admin@example.com");
    await userEvent.click(screen.getByRole("tab", { name: "Suspended" }));
    expect(await screen.findByText("user3@example.com")).toBeInTheDocument();
    expect(screen.queryByText("admin@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("user2@example.com")).not.toBeInTheDocument();
  });

  it("filters by role, even if the server ignores the role filter", async () => {
    renderWithClient(<AdminUsersPage />);
    await screen.findByText("admin@example.com");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Role" }), "admin");
    expect(await screen.findByText("admin@example.com")).toBeInTheDocument();
    expect(screen.queryByText("user2@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("user3@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("1–1 of 1")).toBeInTheDocument();
  });

  it("opens a user from a row click and from the View link", async () => {
    renderWithClient(<AdminUsersPage />);
    const row = await rowFor("admin@example.com");
    expect(within(row).getByRole("link", { name: "View admin@example.com" })).toHaveAttribute("href", expect.stringMatching(/^\/admin\/users\//));
    await userEvent.click(within(row).getByText("admin@example.com"));
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/users\//));
  });

  it("searches by email and goes back to page 1", async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get(`${API}/admin/users`, ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json({ users: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1 } });
      }),
    );
    renderWithClient(<AdminUsersPage />);
    await userEvent.type(await screen.findByRole("textbox", { name: "Find by email or phone" }), "ada@{Enter}");
    await screen.findByText("No users match these filters");
    expect(seen.at(-1)!.get("search")).toBe("ada@");
    expect(seen.at(-1)!.get("page")).toBe("1");
  });

  it("pages across multiple pages and can change the page size", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `bulk-${i + 1}`, email: `bulk${i + 1}@example.com`, role: "USER", suspended: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }));
    const limits: string[] = [];
    server.use(
      http.get(`${API}/admin/users`, ({ request }) => {
        const url = new URL(request.url);
        const page = Number(url.searchParams.get("page")) || 1;
        const limit = Number(url.searchParams.get("limit")) || 10;
        limits.push(String(limit));
        return HttpResponse.json({ users: many.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: many.length, totalPages: Math.ceil(many.length / limit) } });
      }),
    );
    renderWithClient(<AdminUsersPage />);
    await screen.findByText("bulk1@example.com");
    expect(screen.getByText("1–10 of 12")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("bulk11@example.com")).toBeInTheDocument();
    expect(screen.getByText("11–12 of 12")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "25");
    expect(await screen.findByText("1–12 of 12")).toBeInTheDocument();
    expect(limits.at(-1)).toBe("25");
  });

  it("shows an error with a retry when the list fails", async () => {
    server.use(http.get(`${API}/admin/users`, () => HttpResponse.json({ message: "down" }, { status: 500 })));
    renderWithClient(<AdminUsersPage />);
    expect(await screen.findByText("Couldn't load users")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
