import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AmountCard, DetailCard, DetailRow, ReferenceCard, StatusHeader } from "./processing";

vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe("processing components", () => {
  it("StatusHeader can show a problem instead of a spinner", () => {
    const { container } = render(<StatusHeader state="failed" title="Expired" subtitle="Contact support." />);
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
  it("StatusHeader shows the title and one plain sentence", () => {
    render(<StatusHeader state="waiting" title="Send your USDC" subtitle="Send the amount shown." />);
    expect(screen.getByRole("heading", { name: "Send your USDC" })).toBeTruthy();
    expect(screen.getByText("Send the amount shown.")).toBeTruthy();
  });

  it("ReferenceCard shows the reference, a copy button, and live updates only when connected", () => {
    const { rerender } = render(<ReferenceCard reference="off_ABC" />);
    expect(screen.getByText("off_ABC")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy reference" })).toBeTruthy();
    expect(screen.queryByText("Live updates on")).toBeNull();
    rerender(<ReferenceCard reference="off_ABC" live />);
    expect(screen.getByText("Live updates on")).toBeTruthy();
  });

  it("DetailRow offers a copy button only when asked", () => {
    render(
      <DetailCard>
        <DetailRow label="Bank" value="Safe Haven Microfinance Bank" />
        <DetailRow label="Account number" value="6012821803" mono copy={{ label: "Copy account number", toastText: "Copied" }} />
      </DetailCard>,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Copy account number" })).toBeTruthy();
  });

  it("AmountCard shows the amount with its unit", () => {
    render(<AmountCard label="Amount to send" amount="1.5000760" unit="USDC" />);
    expect(screen.getByText("Amount to send")).toBeTruthy();
    expect(screen.getByText("USDC")).toBeTruthy();
  });
});
