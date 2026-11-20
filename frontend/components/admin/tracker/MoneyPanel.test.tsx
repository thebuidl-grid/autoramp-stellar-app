import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MoneyPanel, difference } from "./MoneyPanel";

describe("<MoneyPanel />", () => {
  it("shows each fee, the total, what was expected and what settled", () => {
    render(
      <MoneyPanel
        type="onramp"
        amount="150000"
        currency="NGN"
        money={{ fees: [{ type: "provider_fee", amount: "50.00", currency: "NGN" }, { type: "vat", amount: "3.75", currency: "NGN" }], feeTotal: { amount: "53.75", currency: "NGN" }, expected: "149946.25", settled: "149946.25" }}
      />,
    );
    expect(screen.getByText("Provider fee")).toBeInTheDocument();
    expect(screen.getByText("VAT")).toBeInTheDocument();
    expect(screen.getByText("Fees collected").closest("div")).toHaveTextContent("₦53.75");
    expect(screen.getByText("Expected to settle").closest("div")).toHaveTextContent("₦149,946.25");
    expect(screen.getByText("Settled").closest("div")).toHaveTextContent("₦149,946.25");
  });
  it("says not settled yet instead of showing zero", () => {
    render(<MoneyPanel type="offramp" amount="100" currency="USDC" money={{ fees: [], feeTotal: null, expected: "149700.00", settled: null }} />);
    expect(screen.getByText("Not settled yet")).toBeInTheDocument();
    expect(screen.getByText("Settled").closest("div")).toHaveTextContent("—");
  });
});

describe("<MoneyPanel /> for an off-ramp", () => {
  it("shows the USDC the customer sent, the naira due, that no fees were recorded, and the naira settled", () => {
    render(<MoneyPanel type="offramp" amount="2185.78" currency="NGN" money={{ fees: [], feeTotal: null, expected: "2185.78", sent: { amount: "1.5", currency: "USDC" }, settled: "2185.78" }} />);
    expect(screen.getByText("Customer sent").closest("div")).toHaveTextContent("1.50 USDC");
    expect(screen.getByText("Customer due").closest("div")).toHaveTextContent("₦2,185.78");
    expect(screen.getByText("Fees collected").closest("div")).toHaveTextContent("None recorded");
    expect(screen.getByText("Settled").closest("div")).toHaveTextContent("₦2,185.78");
    expect(screen.queryByText(/Short by|Over by/)).not.toBeInTheDocument();
  });
  it("says how far off the settled amount is from what was due", () => {
    const { rerender } = render(<MoneyPanel type="offramp" amount="1000" currency="NGN" money={{ fees: [], feeTotal: null, expected: "1000.00", sent: null, settled: "985.50" }} />);
    expect(screen.getByText("Short by").closest("div")).toHaveTextContent("₦14.50");
    rerender(<MoneyPanel type="offramp" amount="1000" currency="NGN" money={{ fees: [], feeTotal: null, expected: "1000.00", sent: null, settled: "1002" }} />);
    expect(screen.getByText("Over by").closest("div")).toHaveTextContent("₦2.00");
  });
});

describe("difference", () => {
  it("subtracts decimal strings exactly", () => {
    expect(difference("0.3", "0.1")).toBe("0.2");
    expect(difference("985.5", "1000")).toBe("-14.5");
    expect(difference("5", "5")).toBe("0");
  });
});
