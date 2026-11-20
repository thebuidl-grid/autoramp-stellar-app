import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SellProgressTrack } from "./sell-progress";

describe("<SellProgressTrack />", () => {
  it("starts at 'USDC sent' and waits for confirmation before the server reports anything", () => {
    render(<SellProgressTrack status={undefined} />);
    expect(screen.getByText("USDC sent")).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Deposit received"),
    );
  });
  it("moves the current step along with the payout", () => {
    render(<SellProgressTrack status="PAYOUT_PENDING" />);
    expect(screen.getByText("Paying out").closest("li")).toHaveAttribute(
      "data-state",
      "current",
    );
    expect(screen.getByText("Deposit received").closest("li")).toHaveAttribute(
      "data-state",
      "done",
    );
    expect(screen.getByText("Paid").closest("li")).toHaveAttribute(
      "data-state",
      "upcoming",
    );
  });
  it("has no step labelled 'Step 2 of 2' or a send button", () => {
    render(<SellProgressTrack status="PROCESSING" />);
    expect(screen.queryByText(/Step \d of 2/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
