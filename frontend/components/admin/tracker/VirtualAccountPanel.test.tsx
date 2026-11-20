import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { VirtualAccountPanel } from "./VirtualAccountPanel";

const account = {
  accountNumber: "0902672602", accountName: "AutoRamp / Ada", bankName: "Safehaven MFB", bankCode: "090286", status: "ACTIVE", expectedAmount: "150000",
  expiresAt: "2026-11-21T10:00:00.000Z", reference: "va_1", externalReference: "ext_1", createdAt: "2026-11-20T09:00:00.000Z",
  activity: [
    { id: "e2", eventType: "account.credit", status: "Completed", processed: true, transactionId: "t1", errorMessage: null, createdAt: "2026-11-20T10:05:00.000Z" },
    { id: "e1", eventType: "account.credit", status: "Completed", processed: false, transactionId: "t-other", errorMessage: "no match", createdAt: "2026-11-20T10:00:00.000Z" },
    { id: "e0", eventType: "account.debit", status: "Failed", processed: true, transactionId: null, errorMessage: null, createdAt: "2026-11-20T09:50:00.000Z" },
  ],
};

describe("<VirtualAccountPanel />", () => {
  it("shows the account, its bank and what it was created to receive", () => {
    render(<VirtualAccountPanel account={account} transactionId="t1" currency="NGN" />);
    expect(screen.getByText("0902672602")).toBeInTheDocument();
    expect(screen.getByText("AutoRamp / Ada")).toBeInTheDocument();
    expect(screen.getByText("Safehaven MFB (090286)")).toBeInTheDocument();
    expect(screen.getByText("Created to receive").closest("div")).toHaveTextContent("₦150,000.00");
    expect(screen.getByText("ext_1")).toBeInTheDocument();
  });
  it("lists the activity and says which events are another transaction's or unmatched", () => {
    render(<VirtualAccountPanel account={account} transactionId="t1" />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).queryByText(/another transaction/)).not.toBeInTheDocument();
    expect(within(items[1]).getByText(/belongs to another transaction/)).toBeInTheDocument();
    expect(within(items[1]).getByText(/not processed/)).toBeInTheDocument();
    expect(within(items[1]).getByText("no match")).toBeInTheDocument();
    expect(within(items[2]).getByText(/not matched to a transaction/)).toBeInTheDocument();
  });
  it("for an off-ramp shows the naira credited to the account and the reference it was forwarded under", () => {
    render(<VirtualAccountPanel account={{ ...account, credited: "2185.78", forwardReference: "off_2QRK-FWD" }} transactionId="t1" />);
    expect(screen.getByText("Credited to this account").closest("div")).toHaveTextContent("₦2,185.78");
    expect(screen.getByText("off_2QRK-FWD")).toBeInTheDocument();
  });

  it("says so when nothing has happened on the account", () => {
    render(<VirtualAccountPanel account={{ ...account, activity: [] }} transactionId="t1" />);
    expect(screen.getByText(/Nothing has been paid into or out of this account yet/)).toBeInTheDocument();
  });
});
