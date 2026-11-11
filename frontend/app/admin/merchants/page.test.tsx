import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import AdminMerchantsPage from "./page";

const API = "http://localhost/api";

function cardFor(title: string) {
  const heading = screen.getByText(title);
  return within(heading.parentElement!.parentElement as HTMLElement);
}

describe("AdminMerchantsPage", () => {
  it("renders the merchant list with KYB status badges and summary stat cards", async () => {
    renderWithClient(<AdminMerchantsPage />);

    await screen.findByText("Merchant m1");
    expect(screen.getAllByText("Approved")).toHaveLength(2); // m1 + m2 are VERIFIED
    expect(screen.getByText("Pending")).toBeInTheDocument(); // m3

    expect(cardFor("Total Merchants").getByText("3")).toBeInTheDocument();
    expect(cardFor("Pending KYB").getByText("1")).toBeInTheDocument();
    expect(cardFor("Verified").getByText("2")).toBeInTheDocument();
    expect(cardFor("Inactive").getByText("0")).toBeInTheDocument();
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

    await userEvent.type(screen.getByPlaceholderText("Search business..."), "acme");

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
    expect(screen.getByText("Showing page 1 of 2")).toBeInTheDocument();
    expect(screen.queryByText("Merchant 11")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Merchant 11")).toBeInTheDocument();
    expect(screen.queryByText("Merchant 1")).not.toBeInTheDocument();
    expect(screen.getByText("Showing page 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
