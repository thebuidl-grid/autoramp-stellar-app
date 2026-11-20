import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminTopBar, traceHref } from "./AdminTopBar";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function renderBar(onOpenMenu?: () => void) {
  const client = new QueryClient();
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <AdminTopBar onOpenMenu={onOpenMenu} />
        <input aria-label="other field" />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => push.mockClear());
afterEach(cleanup);

describe("<AdminTopBar /> trace search", () => {
  it("takes a reference to its trace page, encoded", async () => {
    renderBar();
    await userEvent.type(screen.getByRole("searchbox", { name: "Trace a reference" }), "  off_9f2/c 4 {Enter}");
    expect(push).toHaveBeenCalledWith(traceHref("off_9f2/c 4"));
    expect(traceHref(" off_9f2/c 4 ")).toBe("/admin/transactions/off_9f2%2Fc%204");
  });

  it("ignores an empty or blank search", async () => {
    renderBar();
    await userEvent.type(screen.getByRole("searchbox", { name: "Trace a reference" }), "   {Enter}");
    expect(push).not.toHaveBeenCalled();
  });

  it("focuses the search when / or Ctrl+K is pressed anywhere", async () => {
    renderBar();
    const search = screen.getByRole("searchbox", { name: "Trace a reference" });
    expect(search).not.toHaveFocus();
    await userEvent.keyboard("/");
    expect(search).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(search).toHaveFocus();
  });

  it("does not hijack / while typing in another field", async () => {
    renderBar();
    const other = screen.getByRole("textbox", { name: "other field" });
    await userEvent.click(other);
    await userEvent.keyboard("a/b");
    expect(other).toHaveValue("a/b");
    expect(screen.getByRole("searchbox", { name: "Trace a reference" })).not.toHaveFocus();
  });
});

describe("<AdminTopBar /> chrome", () => {
  it("does not show a network badge taken from the website's own setting", () => {
    renderBar();
    expect(document.querySelector("[data-network]")).toBeNull();
  });

  it("says nothing has loaded yet rather than showing a fake age", () => {
    renderBar();
    expect(screen.getByText("Not loaded yet")).toBeInTheDocument();
  });

  it("shows the age of the data once something loads", async () => {
    const { client } = renderBar();
    await client.fetchQuery({ queryKey: ["x"], queryFn: async () => 1 });
    expect(await screen.findByText(/Updated (just now|\d+s ago)/)).toBeInTheDocument();
  });

  it("shows the menu button only when a handler is given, and calls it", async () => {
    const onOpenMenu = vi.fn();
    const { unmount } = renderBar();
    expect(screen.queryByRole("button", { name: "Open menu" })).not.toBeInTheDocument();
    unmount();
    renderBar(onOpenMenu);
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
  });
});
