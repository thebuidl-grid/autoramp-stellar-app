import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { StellarConnectSheet } from "./stellar-connect-sheet";

vi.mock("qrcode", () => ({ default: { toString: vi.fn().mockResolvedValue("<svg data-testid='qr'></svg>") } }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe("StellarConnectSheet", () => {
  it("is closed without a connection link", () => {
    render(<StellarConnectSheet uri={null} onClose={vi.fn()} />);
    expect(screen.queryByText("Connect Stellar wallet")).toBeNull();
  });

  it("shows the QR code, the waiting state, wallet links and copy when there is a link", async () => {
    render(<StellarConnectSheet uri="wc:abc@2" onClose={vi.fn()} />);
    expect(screen.getByText("Connect Stellar wallet")).toBeTruthy();
    expect(screen.getByText("Waiting for your wallet to approve")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("img", { name: "WalletConnect QR code" })).toBeTruthy());
    const open = screen.getByRole("link", { name: "Open wallet app" });
    expect(open.getAttribute("href")).toBe("wc:abc@2");
    expect(screen.getByRole("button", { name: "Copy connection link" })).toBeTruthy();
  });
});
