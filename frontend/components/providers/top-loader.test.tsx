import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/this-page-does-not-exist",
}));

import { TopLoader } from "./top-loader";

describe("TopLoader", () => {
  it("never refreshes the router (that looped forever on a 404 page)", () => {
    render(<TopLoader />);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the bar when an internal link is clicked", () => {
    render(
      <div>
        <TopLoader />
        <a href="/docs">Docs</a>
        <a href="https://example.com/x">Out</a>
      </div>,
    );
    const bar = screen.getByTestId("top-loader-bar");
    expect(bar.style.opacity).toBe("0");
    act(() => {
      fireEvent.click(screen.getByText("Out"));
    });
    expect(bar.style.opacity).toBe("0");
    act(() => {
      fireEvent.click(screen.getByText("Docs"));
    });
    expect(bar.style.opacity).toBe("1");
  });
});
