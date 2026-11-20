import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CurrencySheet } from "./ramp-pickers";

const base = {
  open: true,
  onOpenChange: vi.fn(),
  country: "NG" as const,
  onCountrySelect: vi.fn(),
  tokens: ["USDC"],
  token: "USDC",
  onTokenSelect: vi.fn(),
  network: "base" as const,
  onNetworkSelect: vi.fn(),
};

describe("CurrencySheet", () => {
  it("lists every fiat currency and every network, paying side first on buy", () => {
    render(<CurrencySheet {...base} tab="buy" />);
    const groups = screen.getAllByRole("region").map((g) => g.getAttribute("aria-label"));
    expect(groups).toEqual(["You pay", "You receive"]);
    expect(screen.getByText("Naira (NGN)")).toBeTruthy();
    expect(screen.getByText("Cedi (GHS)")).toBeTruthy();
    expect(screen.getByText("Shilling (KES)")).toBeTruthy();
    expect(screen.getByText("USDC on Base")).toBeTruthy();
    expect(screen.getByText("USDC on BNB Smart Chain")).toBeTruthy();
    expect(screen.getByText("USDC on Stellar")).toBeTruthy();
  });

  it("puts crypto first on sell", () => {
    render(<CurrencySheet {...base} tab="sell" tokens={["USDC", "USDT"]} />);
    expect(screen.getAllByRole("region").map((g) => g.getAttribute("aria-label"))).toEqual(["You send", "You receive"]);
    expect(screen.getByRole("button", { name: "USDT" })).toBeTruthy();
  });

  it("selects a currency and a network without closing, and Done closes", () => {
    const onCountrySelect = vi.fn();
    const onNetworkSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CurrencySheet {...base} tab="buy" onCountrySelect={onCountrySelect} onNetworkSelect={onNetworkSelect} onOpenChange={onOpenChange} />,
    );
    fireEvent.click(screen.getByText("Cedi (GHS)"));
    fireEvent.click(screen.getByText("USDC on Stellar"));
    expect(onCountrySelect).toHaveBeenCalledWith("GH");
    expect(onNetworkSelect).toHaveBeenCalledWith("stellar");
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("marks the current choices", () => {
    render(<CurrencySheet {...base} tab="buy" country="KE" network="bsc" />);
    const pressed = screen.getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent);
    expect(pressed.some((t) => t?.includes("Shilling (KES)"))).toBe(true);
    expect(pressed.some((t) => t?.includes("USDC on BNB Smart Chain"))).toBe(true);
  });
});
