import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LoginGate } from "./login-gate";

describe("LoginGate", () => {
  it("explains the tab and opens the login when the button is pressed", () => {
    const onLogin = vi.fn();
    render(<LoginGate tab="sell" onLogin={onLogin} />);
    expect(screen.getByText("Log in to get started")).toBeTruthy();
    expect(screen.getByText(/M-Pesa/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Log in or create account" }));
    expect(onLogin).toHaveBeenCalledOnce();
  });

  it("has wording for every tab", () => {
    for (const tab of ["buy", "sell", "swap", "bridge"] as const) {
      const { container, unmount } = render(<LoginGate tab={tab} onLogin={vi.fn()} />);
      expect(container.querySelector("p")?.textContent?.length).toBeGreaterThan(10);
      unmount();
    }
  });
});
