import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminShell } from "./AdminShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/store", () => ({ useAuthStore: () => ({ logout: vi.fn() }) }));

const shell = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AdminShell>
        <p>page body</p>
      </AdminShell>
    </QueryClientProvider>,
  );

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("<AdminShell />", () => {
  it("wraps the page in the console theme with navigation and a top bar", () => {
    const { container } = shell();
    expect(container.firstElementChild).toHaveClass("console");
    expect(screen.getByRole("navigation", { name: "Admin" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Trace a reference" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("page body");
  });

  it("remembers a collapsed sidebar across visits", async () => {
    const first = shell();
    expect(first.container.querySelector("aside")).toHaveClass("lg:w-56");
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(first.container.querySelector("aside")).toHaveClass("lg:w-14");
    expect(localStorage.getItem("admin-nav-expanded")).toBe("false");
    first.unmount();

    const second = shell();
    expect(second.container.querySelector("aside")).toHaveClass("lg:w-14");
  });

  it("opens the phone drawer from the top bar", async () => {
    const { container } = shell();
    const aside = container.querySelector("aside")!;
    expect(aside).toHaveAttribute("data-open", "false");
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(aside).toHaveAttribute("data-open", "true");
    await userEvent.keyboard("{Escape}");
    expect(aside).toHaveAttribute("data-open", "false");
  });
});
