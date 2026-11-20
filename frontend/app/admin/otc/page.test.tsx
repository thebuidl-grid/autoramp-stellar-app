import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import { useAuthStore } from "@/lib/store";
import AdminOtcPage from "./page";

const API = "http://localhost/api";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockClear();
  useAuthStore.setState({ token: "admin-jwt" });
});

const otcUser = { id: "otc-user-1", email: "otcuser@example.com", role: "USER", suspended: false, isOTCEnabled: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const usersHandler = (users: unknown[]) => http.get(`${API}/admin/users`, () => HttpResponse.json({ users, pagination: { page: 1, limit: 10, total: users.length, totalPages: 1 } }));

describe("AdminOtcPage", () => {
  it("lists OTC transactions and steps through cursor pages", async () => {
    renderWithClient(<AdminOtcPage />);
    expect(await screen.findByText("OTC-TX-001")).toBeInTheDocument();
    expect(screen.getByText("trader1@example.com")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "OTC transactions" });
    expect(within(table).getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Newer" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Older" }));
    expect(await screen.findByText("OTC-TX-002")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "OTC transactions" })).getByText("Pending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Older" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Newer" }));
    expect(await screen.findByText("OTC-TX-001")).toBeInTheDocument();
  });

  it("opens a trade from a row click", async () => {
    renderWithClient(<AdminOtcPage />);
    await userEvent.click(await screen.findByText("trader1@example.com"));
    expect(push).toHaveBeenCalledWith("/admin/otc/transactions/OTC-TX-001");
  });

  it("sends the filters to the server and goes back to the first page", async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get(`${API}/admin/otc/transactions`, ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json({ transactions: [], total: 0, limit: 10, nextCursor: null, hasMore: false });
      }),
    );
    renderWithClient(<AdminOtcPage />);
    await screen.findByText("No OTC transactions yet");
    await userEvent.type(screen.getByRole("textbox", { name: "Find by reference or user" }), "otc_9{Enter}");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "FAILED");
    await screen.findByText("No OTC transactions match these filters");
    const last = seen.at(-1)!;
    expect(last.get("search")).toBe("otc_9");
    expect(last.get("status")).toBe("FAILED");
    expect(last.has("cursor")).toBe(false);
  });

  describe("OTC users", () => {
    it("shows only OTC-enabled accounts", async () => {
      renderWithClient(<AdminOtcPage />);
      await screen.findByText("OTC-TX-001");
      await userEvent.click(screen.getByRole("tab", { name: "OTC users" }));
      expect(await screen.findByText("user2@example.com")).toBeInTheDocument();
      expect(within(screen.getByRole("table", { name: "OTC-enabled accounts" })).getByText("Active")).toBeInTheDocument();
      expect(screen.queryByText("admin@example.com")).not.toBeInTheDocument();
      expect(screen.queryByText("user3@example.com")).not.toBeInTheDocument();
    });

    it("asks before revoking, and Cancel changes nothing", async () => {
      let patches = 0;
      server.use(usersHandler([otcUser]), http.patch(`${API}/admin/users/:id/flags`, () => { patches += 1; return HttpResponse.json({}); }));
      renderWithClient(<AdminOtcPage />);
      await userEvent.click(screen.getByRole("tab", { name: "OTC users" }));
      await screen.findByText("otcuser@example.com");

      await userEvent.click(screen.getByRole("button", { name: "Revoke OTC access for otcuser@example.com" }));
      expect(screen.getByText("Remove OTC access?")).toBeInTheDocument();
      expect(patches).toBe(0); // one click is not enough
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText("Remove OTC access?")).not.toBeInTheDocument();
      expect(patches).toBe(0);
    });

    it("revokes after confirmation and the user leaves the list", async () => {
      let fetches = 0;
      let body: unknown;
      server.use(
        http.get(`${API}/admin/users`, () => {
          fetches += 1;
          const users = fetches === 1 ? [otcUser] : [];
          return HttpResponse.json({ users, pagination: { page: 1, limit: 10, total: users.length, totalPages: 1 } });
        }),
        http.patch(`${API}/admin/users/:id/flags`, async ({ request }) => { body = await request.json(); return HttpResponse.json({}); }),
      );
      renderWithClient(<AdminOtcPage />);
      await userEvent.click(screen.getByRole("tab", { name: "OTC users" }));
      await screen.findByText("otcuser@example.com");
      await userEvent.click(screen.getByRole("button", { name: "Revoke OTC access for otcuser@example.com" }));
      await userEvent.click(screen.getByRole("button", { name: "Yes, revoke" }));
      expect(await screen.findByText("No OTC users yet")).toBeInTheDocument();
      expect(body).toEqual({ isOTCEnabled: false });
    });

    it("tells the admin when revoking fails, and keeps the user", async () => {
      server.use(usersHandler([otcUser]), http.patch(`${API}/admin/users/:id/flags`, () => HttpResponse.json({ message: "Forbidden" }, { status: 403 })));
      renderWithClient(<AdminOtcPage />);
      await userEvent.click(screen.getByRole("tab", { name: "OTC users" }));
      await screen.findByText("otcuser@example.com");
      await userEvent.click(screen.getByRole("button", { name: "Revoke OTC access for otcuser@example.com" }));
      await userEvent.click(screen.getByRole("button", { name: "Yes, revoke" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't revoke OTC access for otcuser@example.com: Forbidden");
      expect(screen.getByText("otcuser@example.com")).toBeInTheDocument();
    });
  });
});
