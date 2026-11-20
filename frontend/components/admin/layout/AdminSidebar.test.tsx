import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminSidebar } from "./AdminSidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/waitlist" }));

describe("<AdminSidebar />", () => {
  it("links to the Waitlist and User Analytics reports", () => {
    render(<AdminSidebar />);
    expect(screen.getByRole("link", { name: "Waitlist" })).toHaveAttribute("href", "/admin/waitlist");
    expect(screen.getByRole("link", { name: "User Analytics" })).toHaveAttribute(
      "href",
      "/admin/user-analytics",
    );
  });

  it("highlights the current page", () => {
    render(<AdminSidebar />);
    expect(screen.getByRole("link", { name: "Waitlist" })).toHaveClass("bg-primary");
    expect(screen.getByRole("link", { name: "Users" })).not.toHaveClass("bg-primary");
  });

  it("is reachable on mobile through the menu button", async () => {
    render(<AdminSidebar />);
    const nav = screen.getByRole("navigation");
    expect(nav.closest("div.fixed")).toHaveClass("-translate-x-full");

    await userEvent.click(screen.getAllByRole("button")[0]);
    expect(nav.closest("div.fixed")).toHaveClass("translate-x-0");
  });
});
