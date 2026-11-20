import { describe, expect, it } from "vitest";
import { COUNTRIES, countryName, detectFromInternational, findCountry, toE164 } from "./countries";

describe("countries", () => {
  it("has unique ISO codes and numeric dial codes", () => {
    const isos = COUNTRIES.map((c) => c.iso);
    expect(new Set(isos).size).toBe(isos.length);
    expect(COUNTRIES.every((c) => /^[0-9]{1,4}$/.test(c.dial))).toBe(true);
  });

  it("includes Autoramp's corridors", () => {
    expect(findCountry("NG")?.dial).toBe("234");
    expect(findCountry("gh")?.dial).toBe("233");
    expect(findCountry("KE")?.dial).toBe("254");
  });

  it("names countries, falling back to Intl and to the raw code", () => {
    expect(countryName("GH")).toBe("Ghana");
    expect(countryName("FI")).toBe("Finland"); // not in our list: via Intl.DisplayNames
    expect(countryName("unknown")).toBe("Unknown");
    expect(countryName(null)).toBe("Unknown");
  });
});

describe("toE164", () => {
  it("joins dial code and national number, dropping spaces, punctuation and the trunk 0", () => {
    expect(toE164("NG", "801 234 5678")).toBe("+2348012345678");
    expect(toE164("NG", "0801-234-5678")).toBe("+2348012345678");
    expect(toE164("GH", "(024) 123 4567")).toBe("+233241234567");
    expect(toE164("US", "555.123.4567")).toBe("+15551234567");
  });

  it("returns an empty string for nothing typed or an unknown country", () => {
    expect(toE164("NG", "   ")).toBe("");
    expect(toE164("NG", "0")).toBe("");
    expect(toE164("ZZ", "123456789")).toBe("");
  });
});

describe("detectFromInternational", () => {
  it("detects the country from a pasted international number", () => {
    const d = detectFromInternational("+234 801 234 5678");
    expect(d?.country.iso).toBe("NG");
    expect(d?.national).toBe("8012345678");
    expect(detectFromInternational("+254712345678")?.country.iso).toBe("KE");
  });

  it("prefers the longest dial code (+2xx numbers are not Egypt's +20)", () => {
    expect(detectFromInternational("+233241234567")?.country.iso).toBe("GH");
    expect(detectFromInternational("+201234567890")?.country.iso).toBe("EG");
  });

  it("keeps the selected country for shared dial codes (+1 is US and Canada)", () => {
    expect(detectFromInternational("+1 555 123 4567", "CA")?.country.iso).toBe("CA");
    expect(detectFromInternational("+1 555 123 4567")?.country.iso).toBe("US");
  });

  it("ignores numbers without a leading + and unknown dial codes", () => {
    expect(detectFromInternational("08012345678")).toBeNull();
    expect(detectFromInternational("+999123456")).toBeNull();
  });
});
