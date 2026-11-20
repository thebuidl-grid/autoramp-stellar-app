import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWalletLink, fetchWalletListings } from "./wc-wallet-links";

const URI = "wc:abc@2?relay-protocol=irn&symKey=xyz";

describe("buildWalletLink", () => {
  it("prefers the native scheme (Lobstr's universal link opens its home screen without a request)", () => {
    expect(buildWalletLink({ mobile: { universal: "https://lobstr.co/uni/wc", native: "lobstr://" } }, URI)).toBe(
      `lobstr://wc?uri=${encodeURIComponent(URI)}`,
    );
  });
  it("uses the universal link when there is no native scheme", () => {
    expect(buildWalletLink({ mobile: { universal: "https://lobstr.co/" } }, URI)).toBe(
      `https://lobstr.co/wc?uri=${encodeURIComponent(URI)}`,
    );
  });
  it("normalises a bare native scheme", () => {
    expect(buildWalletLink({ mobile: { native: "varial://" } }, URI)).toBe(`varial://wc?uri=${encodeURIComponent(URI)}`);
    expect(buildWalletLink({ mobile: { native: "varial" } }, URI)).toBe(`varial://wc?uri=${encodeURIComponent(URI)}`);
  });
  it("does not add a second /wc when the registry link already ends in one", () => {
    const q = encodeURIComponent(URI);
    expect(buildWalletLink({ mobile: { universal: "https://lobstr.co/uni/wc" } }, URI)).toBe(`https://lobstr.co/uni/wc?uri=${q}`);
    expect(buildWalletLink({ mobile: { universal: "https://app.scopuly.com/wc" } }, URI)).toBe(`https://app.scopuly.com/wc?uri=${q}`);
    expect(buildWalletLink({ mobile: { native: "freighterwallet://wc-redirect" } }, URI)).toBe(`freighterwallet://wc-redirect?uri=${q}`);
  });
  it("returns null when the wallet has no mobile link", () => {
    expect(buildWalletLink({ mobile: {} }, URI)).toBeNull();
  });
});

describe("fetchWalletListings", () => {
  afterEach(() => vi.restoreAllMocks());

  it("maps the explorer listings and drops wallets without a mobile link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          listings: {
            a: { id: "a", name: "Lobstr", image_id: "img1", mobile: { native: "lobstr://", universal: "" } },
            b: { id: "b", name: "Desktop only", mobile: {} },
          },
        }),
      }),
    );
    const out = await fetchWalletListings("proj", ["a", "b"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "a", name: "Lobstr", mobile: { native: "lobstr://" } });
    expect(out[0].image).toContain("/v3/logo/md/img1");
  });

  it("returns an empty list when the explorer fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await fetchWalletListings("proj", ["a"])).toEqual([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchWalletListings("proj", ["a"])).toEqual([]);
  });
});
