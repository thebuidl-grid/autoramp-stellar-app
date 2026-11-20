import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NetworkBadge } from "./NetworkBadge";

describe("<NetworkBadge />", () => {
  it("names the network, amber for testnet, and admits when it was not recorded", () => {
    const { rerender } = render(<NetworkBadge network="testnet" />);
    expect(screen.getByText("Testnet")).toHaveAttribute("data-network", "testnet");
    rerender(<NetworkBadge network="mainnet" />);
    expect(screen.getByText("Mainnet")).toHaveAttribute("data-network", "mainnet");
    rerender(<NetworkBadge network={null} />);
    expect(screen.getByText("Network not recorded")).toHaveAttribute("data-network", "unknown");
  });
});
