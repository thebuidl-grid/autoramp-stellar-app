import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WalletHub, type WalletEntry } from "./wallet-hub";

vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const entry = (over: Partial<WalletEntry>): WalletEntry => ({
  id: "evm",
  name: "wallet",
  title: "EVM wallet",
  chain: "EVM",
  relevant: true,
  required: true,
  connected: false,
  onConnect: vi.fn(),
  ...over,
});
const stellar = (over: Partial<WalletEntry> = {}) =>
  entry({ id: "stellar", name: "Stellar", title: "Stellar wallet", chain: "Stellar", required: false, ...over });

describe("WalletHub (Your wallets)", () => {
  it("titles the section and shows one button that connects the missing required wallet", () => {
    const onConnect = vi.fn();
    render(<WalletHub entries={[entry({ onConnect })]} />);
    expect(screen.getByRole("region", { name: "Your wallets" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Connect your EVM wallet to continue.")).toBeTruthy();
    expect(screen.getByText("No wallet connected yet.")).toBeTruthy();
  });

  it("never shows two connect buttons: an optional wallet waits until the required one is connected", () => {
    render(<WalletHub entries={[entry({}), stellar()]} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("lists every connected wallet with its chain, shortened address, copy and manage/disconnect", () => {
    const onManage = vi.fn();
    const onDisconnect = vi.fn();
    render(
      <WalletHub
        entries={[
          entry({ connected: true, address: "0x1234567890abcdef1234567890abcdef12345678", onManage }),
          stellar({ connected: true, address: "GABCDEFGHIJKLMNOPQRSTUVWXYZ", onDisconnect }),
        ]}
      />,
    );
    expect(screen.getByText("EVM")).toBeTruthy();
    expect(screen.getByText("Stellar")).toBeTruthy();
    expect(screen.getByText("0x1234…5678")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy EVM wallet address" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Manage EVM wallet" }));
    expect(onManage).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Stellar wallet" }));
    expect(onDisconnect).toHaveBeenCalled();
    expect(screen.queryByText(/to continue/)).toBeNull();
  });

  it("still lists a connected wallet that this screen doesn't use", () => {
    render(<WalletHub entries={[entry({ connected: true, address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" }), stellar({ relevant: false, connected: true, address: "GZZZZZZZZZZZZZZZZZZZZZZZZZZZ" })]} />);
    expect(screen.getByText("Stellar")).toBeTruthy();
  });

  it("offers any other wallet quietly once nothing required is missing", () => {
    render(
      <WalletHub entries={[entry({ connected: true, address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" }), stellar({ relevant: false })]} />,
    );
    const btn = screen.getByRole("button", { name: "Add Stellar wallet" });
    expect(btn.getAttribute("data-quiet")).toBe("true");
  });

  it("names the wallet when only that one is missing", () => {
    render(<WalletHub entries={[stellar({ required: true })]} />);
    expect(screen.getByRole("button", { name: "Connect Stellar" })).toBeTruthy();
  });
});
