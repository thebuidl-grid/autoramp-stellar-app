import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/constants/networks", () => ({ IS_TESTNET: false }));

import { addressesFromSession, buildSignRequest, STELLAR_WC_CHAIN, WC_STELLAR_METHODS } from "./stellar-walletconnect";

const A = "G" + "A".repeat(55);
const B = "G" + "B".repeat(55);

describe("stellar-walletconnect (pure parts)", () => {
  it("targets the app's network", () => {
    expect(STELLAR_WC_CHAIN).toBe("stellar:pubnet");
  });

  it("builds the sign request the wallet receives", () => {
    expect(buildSignRequest("topic1", "AAAA")).toEqual({
      topic: "topic1",
      chainId: "stellar:pubnet",
      request: { method: WC_STELLAR_METHODS.SIGN, params: { xdr: "AAAA" } },
    });
    expect(buildSignRequest("t", "X", "stellar:testnet").chainId).toBe("stellar:testnet");
  });

  it("uses the method names WalletConnect wallets expect", () => {
    expect(WC_STELLAR_METHODS.SIGN).toBe("stellar_signXDR");
    expect(WC_STELLAR_METHODS.SIGN_AND_SUBMIT).toBe("stellar_signAndSubmitXDR");
  });

  it("reads addresses out of a session's accounts", () => {
    const addrs = addressesFromSession({
      topic: "t",
      expiry: 1,
      namespaces: { stellar: { accounts: [`stellar:pubnet:${A}`, `stellar:testnet:${B}`] } },
    });
    expect(addrs).toEqual([A, B]);
    expect(addressesFromSession({ topic: "t", expiry: 1 })).toEqual([]);
  });
});
