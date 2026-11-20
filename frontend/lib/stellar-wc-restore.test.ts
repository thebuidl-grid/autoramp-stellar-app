import { describe, expect, it } from "vitest";
import { isPending, pickStellarSession, WC_PENDING_WINDOW_MS } from "./stellar-wc-restore";

const A = "G" + "A".repeat(55);
const B = "G" + "B".repeat(55);
const session = (topic: string, expiry: number, accounts: string[]) => ({
  topic,
  expiry,
  namespaces: { stellar: { accounts } },
});

describe("pickStellarSession", () => {
  it("returns the address and topic of the matching session", () => {
    const res = pickStellarSession([session("t1", 2000, [`stellar:pubnet:${A}`])], "stellar:pubnet", 1000);
    expect(res).toEqual({ address: A, topic: "t1" });
  });

  it("takes the latest of several unexpired sessions", () => {
    const res = pickStellarSession(
      [session("old", 1500, [`stellar:pubnet:${A}`]), session("new", 3000, [`stellar:pubnet:${B}`])],
      "stellar:pubnet",
      1000,
    );
    expect(res).toEqual({ address: B, topic: "new" });
  });

  it("ignores expired sessions", () => {
    expect(pickStellarSession([session("t", 900, [`stellar:pubnet:${A}`])], "stellar:pubnet", 1000)).toBeNull();
  });

  it("never connects a mainnet app to a testnet session (or the reverse)", () => {
    const s = [session("t", 2000, [`stellar:testnet:${A}`])];
    expect(pickStellarSession(s, "stellar:pubnet", 1000)).toBeNull();
    expect(pickStellarSession(s, "stellar:testnet", 1000)?.address).toBe(A);
  });

  it("ignores other chains and malformed accounts", () => {
    expect(
      pickStellarSession(
        [session("t", 2000, [`eip155:1:0x${"1".repeat(40)}`, "stellar:pubnet:notanaddress", "garbage"])],
        "stellar:pubnet",
        1000,
      ),
    ).toBeNull();
  });

  it("copes with no sessions or missing namespaces", () => {
    expect(pickStellarSession([], "stellar:pubnet", 1000)).toBeNull();
    expect(pickStellarSession([{ topic: "t", expiry: 2000 }], "stellar:pubnet", 1000)).toBeNull();
  });
});

describe("isPending", () => {
  it("is true shortly after a connect starts and false once stale or unset", () => {
    expect(isPending(1_000, 1_000 + 5_000)).toBe(true);
    expect(isPending(1_000, 1_000 + WC_PENDING_WINDOW_MS + 1)).toBe(false);
    expect(isPending(null, 1)).toBe(false);
    expect(isPending(undefined, 1)).toBe(false);
  });
});
