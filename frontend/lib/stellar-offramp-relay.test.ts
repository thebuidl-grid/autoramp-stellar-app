import { describe, expect, it, vi } from "vitest";
import { explainStellarAccountError, parseRelayBridge, waitForRelay } from "./stellar-offramp-relay";

vi.mock("@/lib/constants/networks", () => ({ IS_TESTNET: false }));

const good = {
  via: "cctp",
  sourceDomain: 27,
  destinationDomain: 6,
  mintRecipient: "0x" + "ab".repeat(20),
  burnAmountUnits: "13730000",
  maxFeeUnits: "700",
  network: "mainnet",
};

describe("parseRelayBridge", () => {
  it("accepts well-formed instructions", () => {
    expect(parseRelayBridge(good)).toEqual(good);
  });

  it.each([
    ["missing block", undefined],
    ["wrong route", { ...good, destinationDomain: 0 }],
    ["wrong source", { ...good, sourceDomain: 6 }],
    ["bad recipient", { ...good, mintRecipient: "GABC" }],
    ["short recipient", { ...good, mintRecipient: "0x1234" }],
    ["zero amount", { ...good, burnAmountUnits: "0" }],
    ["non-numeric amount", { ...good, burnAmountUnits: "1.5" }],
    ["bad fee", { ...good, maxFeeUnits: "-1" }],
    ["network mismatch", { ...good, network: "testnet" }],
  ])("rejects %s before any wallet prompt", (_name, input) => {
    expect(() => parseRelayBridge(input)).toThrow();
  });
});

describe("waitForRelay", () => {
  const sleep = () => Promise.resolve();

  it("returns once the USDC is minted and reports state changes", async () => {
    const relay = vi
      .fn()
      .mockResolvedValueOnce({ state: "attesting" })
      .mockResolvedValueOnce({ state: "attesting" })
      .mockResolvedValueOnce({ state: "minted", mintTxHash: "0xmint" });
    const onState = vi.fn();
    const res = await waitForRelay("off_1", relay, { sleep, onState });
    expect(res).toEqual({ state: "minted", mintTxHash: "0xmint" });
    expect(onState.mock.calls.map((c) => c[0])).toEqual(["attesting", "minted"]);
    expect(relay).toHaveBeenCalledWith("off_1");
  });

  it("keeps trying through transient errors", async () => {
    const relay = vi
      .fn()
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValueOnce({ state: "minted" });
    expect((await waitForRelay("off_1", relay, { sleep })).state).toBe("minted");
  });

  it("times out with a reassuring message", async () => {
    const relay = vi.fn().mockResolvedValue({ state: "attesting" });
    await expect(waitForRelay("off_1", relay, { sleep, timeoutMs: 0 })).rejects.toThrow(/USDC is safe/);
  });
});

describe("explainStellarAccountError", () => {
  it("explains a missing account in terms of the network", () => {
    const err = explainStellarAccountError(new Error("Account not found: GABC"), "mainnet");
    expect(err?.message).toContain("isn't funded on mainnet");
    expect(err?.message).toContain("switch the app to testnet");
    expect(explainStellarAccountError(new Error("Account not found: GABC"), "testnet")?.message).toContain(
      "switch the app to mainnet",
    );
  });

  it("leaves other errors alone", () => {
    expect(explainStellarAccountError(new Error("rpc timeout"), "mainnet")).toBeNull();
    expect(explainStellarAccountError("boom", "mainnet")).toBeNull();
  });
});
