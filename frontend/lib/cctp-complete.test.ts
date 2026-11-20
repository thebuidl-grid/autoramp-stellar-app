import { describe, expect, it, vi } from "vitest";
import { completeMint, pollRelay } from "./cctp-complete";

describe("completeMint", () => {
  it("uses the user's wallet when it works, and never touches the relayer", async () => {
    const relayMint = vi.fn();
    const r = await completeMint({ walletMint: async () => "0xwallet", relayMint });
    expect(r).toEqual({ hash: "0xwallet", by: "wallet" });
    expect(relayMint).not.toHaveBeenCalled();
  });

  it("falls back to the relayer straight away when the wallet is closed or rejects, saying why", async () => {
    const onFallback = vi.fn();
    const r = await completeMint({ walletMint: async () => { throw new Error("User rejected the request\nstack..."); }, relayMint: async () => "0xrelay", onFallback });
    expect(r).toEqual({ hash: "0xrelay", by: "relay" });
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledWith("User rejected the request");
  });

  it("goes straight to the relayer when no wallet can do the mint", async () => {
    const onFallback = vi.fn();
    expect(await completeMint({ relayMint: async () => "0xrelay", onFallback })).toEqual({ hash: "0xrelay", by: "relay" });
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("surfaces the relayer's failure (the burn stays safe)", async () => {
    await expect(completeMint({ walletMint: async () => { throw new Error("x"); }, relayMint: async () => { throw new Error("relay down"); } })).rejects.toThrow("relay down");
  });
});

describe("pollRelay", () => {
  const sleep = async () => undefined;
  const far = () => Date.now() + 60_000;

  it("returns the mint hash once the relay says complete, reporting when it is minting", async () => {
    const calls = [{ status: "pending" }, { status: "minting" }, { status: "complete", mintTxHash: "0xmint" }];
    const onMinting = vi.fn();
    expect(await pollRelay({ call: async () => calls.shift()!, onMinting, deadline: far(), sleep })).toBe("0xmint");
    expect(onMinting).toHaveBeenCalledTimes(1);
  });

  it("treats complete with no hash as delivered (someone, e.g. the wallet, minted it first)", async () => {
    expect(await pollRelay({ call: async () => ({ status: "complete" }), deadline: far(), sleep })).toBe("");
  });

  it("rides out transient failures but stops on 403 and after too many in a row", async () => {
    let n = 0;
    expect(await pollRelay({ call: async () => { if (++n < 3) throw { response: { status: 502 } }; return { status: "complete", mintTxHash: "0x1" }; }, deadline: far(), sleep })).toBe("0x1");
    await expect(pollRelay({ call: async () => { throw { response: { status: 403, data: { message: "Not yours" } } }; }, deadline: far(), sleep })).rejects.toThrow("Not yours");
    let tries = 0;
    await expect(pollRelay({ call: async () => { tries++; throw { response: { status: 502 } }; }, deadline: far(), sleep, maxFailures: 3 })).rejects.toThrow(/burn is safe/);
    expect(tries).toBe(3);
  });

  it("gives up at the deadline without losing the burn", async () => {
    await expect(pollRelay({ call: async () => ({ status: "pending" }), deadline: Date.now() - 1, sleep })).rejects.toThrow(/finished automatically/);
  });
});
