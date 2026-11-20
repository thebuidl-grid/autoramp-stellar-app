import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import { useAuthStore } from "@/lib/store";
import AdminMerchantsPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
beforeEach(() => {
  push.mockClear();
  useAuthStore.setState({ token: "admin-jwt" });
});

const API = "http://localhost/api";

describe("AdminMerchantsPage", () => {
  it("lists merchants with KYB status in plain words, and counts on the tabs", async () => {
    renderWithClient(<AdminMerchantsPage />);

    await screen.findByText("Merchant m1");
    expect(screen.getAllByText("Approved").length).toBeGreaterThanOrEqual(2); // m1 + m2 are VERIFIED (plus the tab)
    expect(screen.getAllByText("Pending review").length).toBeGreaterThanOrEqual(1); // m3
    expect(screen.getByRole("tab", { name: /^All/ })).toHaveTextContent("3");
    expect(screen.getByRole("tab", { name: /^Pending review/ })).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /^Approved/ })).toHaveTextContent("2");
    expect(screen.getByRole("tab", { name: /^Rejected/ })).toHaveTextContent("0"); // a real zero is shown
  });

  it("shows only the merchants waiting for review on that tab", async () => {
    renderWithClient(<AdminMerchantsPage />);
    await screen.findByText("Merchant m1");
    await userEvent.click(screen.getByRole("tab", { name: /^Pending review/ }));
    expect(await screen.findByText("Merchant m3")).toBeInTheDocument();
    expect(screen.queryByText("Merchant m1")).not.toBeInTheDocument();
  });

  it("opens a merchant with a normal navigation (no full page reload), and the dead menu actions are gone", async () => {
    renderWithClient(<AdminMerchantsPage />);
    const row = (await screen.findByText("Merchant m1")).closest("tr") as HTMLElement;
    await userEvent.click(within(row).getByText("Merchant m1"));
    expect(push).toHaveBeenCalledWith("/admin/merchants/m1");
    expect(screen.queryByText("Send Message")).not.toBeInTheDocument();
    expect(screen.queryByText("Suspend Merchant")).not.toBeInTheDocument();
  });

  it("filters the list client-side by business name or email as the search term changes", async () => {
    server.use(
      http.get(`${API}/merchants/onboarding`, () =>
        HttpResponse.json([
          {
            id: "acme-1",
            userId: "u-acme",
            name: "Acme Traders",
            natureOfBusiness: "Retail",
            description: "",
            websiteUrl: "",
            addressLine1: "",
            addressLine2: "",
            city: "",
            state: "",
            country: "",
            postalCode: "",
            status: "VERIFIED",
            verifiedAt: "2026-01-01T00:00:00.000Z",
            rejectionReason: null,
            metadata: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            user: { email: "acme@example.com", contactName: null },
          },
          {
            id: "foundry-1",
            userId: "u-foundry",
            name: "Foundry Inc",
            natureOfBusiness: "Manufacturing",
            description: "",
            websiteUrl: "",
            addressLine1: "",
            addressLine2: "",
            city: "",
            state: "",
            country: "",
            postalCode: "",
            status: "PENDING",
            verifiedAt: null,
            rejectionReason: null,
            metadata: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            user: { email: "foundry@example.com", contactName: null },
          },
        ]),
      ),
    );

    renderWithClient(<AdminMerchantsPage />);
    await screen.findByText("Acme Traders");
    expect(screen.getByText("Foundry Inc")).toBeInTheDocument();

    await userEvent.type(screen.getByRole("textbox", { name: "Find by business name or email" }), "acme");

    expect(await screen.findByText("Acme Traders")).toBeInTheDocument();
    expect(screen.queryByText("Foundry Inc")).not.toBeInTheDocument();
  });

  it("paginates the filtered list client-side, 10 per page", async () => {
    const manyMerchants = Array.from({ length: 12 }, (_, i) => ({
      id: `m-${i + 1}`,
      userId: `u-${i + 1}`,
      name: `Merchant ${i + 1}`,
      natureOfBusiness: "Retail",
      description: "",
      websiteUrl: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      country: "",
      postalCode: "",
      status: "VERIFIED",
      verifiedAt: "2026-01-01T00:00:00.000Z",
      rejectionReason: null,
      metadata: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      user: { email: `merchant${i + 1}@example.com`, contactName: null },
    }));
    server.use(http.get(`${API}/merchants/onboarding`, () => HttpResponse.json(manyMerchants)));

    renderWithClient(<AdminMerchantsPage />);

    await screen.findByText("Merchant 1");
    expect(screen.getByText("1–10 of 12")).toBeInTheDocument();
    expect(screen.queryByText("Merchant 11")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));

    expect(await screen.findByText("Merchant 11")).toBeInTheDocument();
    expect(screen.queryByText("Merchant 1")).not.toBeInTheDocument();
    expect(screen.getByText("11–12 of 12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });
});
