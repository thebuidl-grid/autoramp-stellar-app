import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminSidebar } from "./AdminSidebar";

let pathname = "/admin/waitlist";
const logout = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/lib/store", () => ({ useAuthStore: () => ({ logout }) }));

beforeEach(() => {
  pathname = "/admin/waitlist";
  logout.mockClear();
});
afterEach(cleanup);

describe("<AdminSidebar />", () => {
  it("groups the pages into sections and links to each one", () => {
    render(<AdminSidebar />);
    const nav = screen.getByRole("navigation", { name: "Admin" });
    for (const [name, href] of [
      ["Dashboard", "/admin"],
      ["Transactions", "/admin/transactions"],
      ["Safehaven", "/admin/safehaven"],
      ["CCTP", "/admin/cctp"],
      ["Bitnob", "/admin/bitnob"],
      ["Webhooks", "/admin/webhooks"],
      ["OTC Service", "/admin/otc"],
      ["Users", "/admin/users"],
      ["Merchants", "/admin/merchants"],
      ["Waitlist", "/admin/waitlist"],
      ["User Analytics", "/admin/user-analytics"],
    ] as const) {
      expect(within(nav).getByRole("link", { name })).toHaveAttribute("href", href);
    }
    for (const title of ["Overview", "Money", "People", "Insights"]) expect(within(nav).getByText(title)).toBeInTheDocument();
  });

  it("no longer offers the dead API Keys page or a separate Transfer Logs page", () => {
    render(<AdminSidebar />);
    expect(screen.queryByRole("link", { name: "API Keys" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Transfer Logs" })).not.toBeInTheDocument();
  });

  it("marks only the current page with aria-current", () => {
    render(<AdminSidebar />);
    expect(screen.getByRole("link", { name: "Waitlist" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Users" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("keeps a section lit on its sub-pages and treats Transfer Logs as part of Transactions", () => {
    pathname = "/admin/users/42";
    const { unmount } = render(<AdminSidebar />);
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
    unmount();
    pathname = "/admin/transfer-logs/abc";
    render(<AdminSidebar />);
    expect(screen.getByRole("link", { name: "Transactions" })).toHaveAttribute("aria-current", "page");
  });

  it("collapses to an icon rail but keeps every link nameable for screen readers and hover", () => {
    render(<AdminSidebar expanded={false} onToggleExpanded={() => undefined} />);
    const link = screen.getByRole("link", { name: "Transactions" });
    expect(link).toHaveAttribute("title", "Transactions");
    expect(within(link).getByText("Transactions")).toHaveClass("lg:sr-only");
  });

  it("offers a collapse toggle that reports its state", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<AdminSidebar expanded onToggleExpanded={onToggle} />);
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<AdminSidebar expanded={false} onToggleExpanded={onToggle} />);
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-pressed", "true");
  });

  it("is a drawer on phones: closed by default, open on request, closes on Escape, link tap and overlay", async () => {
    const onClose = vi.fn();
    const { container, rerender } = render(<AdminSidebar mobileOpen={false} onCloseMobile={onClose} />);
    const aside = container.querySelector("aside")!;
    expect(aside).toHaveAttribute("data-open", "false");
    expect(aside).toHaveClass("-translate-x-full");

    rerender(<AdminSidebar mobileOpen onCloseMobile={onClose} />);
    expect(aside).toHaveAttribute("data-open", "true");
    expect(aside).toHaveClass("translate-x-0");

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("link", { name: "Users" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    await userEvent.click(container.querySelector("div[aria-hidden].fixed")!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("does not listen for Escape while the drawer is closed", async () => {
    const onClose = vi.fn();
    render(<AdminSidebar mobileOpen={false} onCloseMobile={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("logs out", async () => {
    render(<AdminSidebar />);
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
