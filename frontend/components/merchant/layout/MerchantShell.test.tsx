import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MerchantShell } from "./MerchantShell";

let pathname = "/merchant/dashboard";
const push = vi.fn();
const logout = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push }) }));
vi.mock("@/lib/store", () => ({ useAuthStore: () => ({ logout, user: { email: "ada@shop.com" } }) }));

beforeEach(() => {
  pathname = "/merchant/dashboard";
  push.mockClear();
  logout.mockClear();
});
afterEach(cleanup);

describe("<MerchantShell />", () => {
  it("is a top navigation in the counter theme, with no sidebar", () => {
    const { container } = render(<MerchantShell>body</MerchantShell>);
    expect(container.firstElementChild).toHaveClass("counter");
    expect(container.firstElementChild).toHaveAttribute("data-theme", "light");
    expect(container.querySelector("aside")).toBeNull();
    const nav = screen.getByRole("navigation", { name: "Merchant" });
    for (const [name, href] of [
      ["Home", "/merchant/dashboard"],
      ["Payments", "/merchant/dashboard/transactions"],
      ["Banking", "/merchant/dashboard/bank"],
      ["Airtime & bills", "/merchant/dashboard/vas"],
      ["API keys", "/merchant/dashboard/api-keys"],
      ["Audit log", "/merchant/dashboard/audit-logs"],
    ] as const) {
      expect(within(nav).getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("marks only the current page, and keeps Home from lighting up on sub-pages", () => {
    pathname = "/merchant/dashboard/bank/sub-accounts";
    render(<MerchantShell>x</MerchantShell>);
    const nav = screen.getByRole("navigation", { name: "Merchant" });
    expect(within(nav).getByRole("link", { name: "Banking" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("puts settings and sign out in the account area, and signs out to the login page", async () => {
    render(<MerchantShell>x</MerchantShell>);
    expect(screen.getByRole("link", { name: "Account settings" })).toHaveAttribute("href", "/merchant/dashboard/settings");
    expect(screen.getByRole("link", { name: "Account settings" })).toHaveTextContent("A");
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/merchant/login");
  });

  it("opens a menu on phones and closes it on Escape or when a link is tapped", async () => {
    render(<MerchantShell>x</MerchantShell>);
    expect(screen.queryByRole("navigation", { name: "Merchant menu" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const menu = screen.getByRole("navigation", { name: "Merchant menu" });
    expect(within(menu).getByRole("link", { name: "Settings" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("navigation", { name: "Merchant menu" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await userEvent.click(within(screen.getByRole("navigation", { name: "Merchant menu" })).getByRole("link", { name: "Banking" }));
    expect(screen.queryByRole("navigation", { name: "Merchant menu" })).not.toBeInTheDocument();
  });
});
