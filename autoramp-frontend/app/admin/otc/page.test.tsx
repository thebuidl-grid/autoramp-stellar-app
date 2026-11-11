import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import AdminOtcPage from "./page";

const API = "http://localhost/api";

describe("AdminOtcPage", () => {
  it("renders OTC transactions with cursor pagination on the default tab", async () => {
    renderWithClient(<AdminOtcPage />);

    expect(await screen.findByText("OTC-TX-001")).toBeInTheDocument();
    expect(screen.getByText("trader1@example.com")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText(/Page 1 — 2 total/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("OTC-TX-002")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows only OTC-enabled users on the OTC Users tab", async () => {
    renderWithClient(<AdminOtcPage />);
    await screen.findByText("OTC-TX-001");

    await userEvent.click(screen.getByRole("tab", { name: "OTC Users" }));

    expect(await screen.findByText("user2@example.com")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("admin@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("user3@example.com")).not.toBeInTheDocument();
  });

  it("revoking OTC access invalidates the users list and reflects the removal", async () => {
    let fetchCount = 0;
    server.use(
      http.get(`${API}/admin/users`, () => {
        fetchCount += 1;
        const users =
          fetchCount === 1
            ? [
                {
                  id: "otc-user-1",
                  email: "otcuser@example.com",
                  role: "USER",
                  suspended: false,
                  isOTCEnabled: true,
                  createdAt: "2026-01-01T00:00:00.000Z",
                  updatedAt: "2026-01-01T00:00:00.000Z",
                },
              ]
            : [];
        return HttpResponse.json({
          users,
          pagination: { page: 1, limit: 20, total: users.length, totalPages: 1 },
        });
      }),
    );

    renderWithClient(<AdminOtcPage />);
    await userEvent.click(screen.getByRole("tab", { name: "OTC Users" }));
    await screen.findByText("otcuser@example.com");

    await userEvent.click(screen.getByRole("button", { name: /Revoke/i }));

    await waitFor(() => expect(screen.getByText("No OTC users yet")).toBeInTheDocument());
  });
});
