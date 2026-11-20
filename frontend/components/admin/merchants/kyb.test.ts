import { describe, expect, it } from "vitest";
import type { MerchantUser } from "@/lib/api";
import { countByKyb, filterMerchants, kybLabel, websiteHref } from "./kyb";

const m = (name: string, status: MerchantUser["status"], email = `${name.toLowerCase()}@x.com`) => ({ id: name, name, status, user: { email } }) as MerchantUser;
const list = [m("Acme", "VERIFIED"), m("Foundry", "PENDING"), m("Zed", "REJECTED", "owner@zed.io")];

describe("kyb helpers", () => {
  it("names KYB statuses in plain words", () => {
    expect(kybLabel("VERIFIED")).toBe("Approved");
    expect(kybLabel("PENDING")).toBe("Pending review");
    expect(kybLabel("REJECTED")).toBe("Rejected");
    expect(kybLabel(undefined)).toBe("No KYB");
  });
  it("filters by status and by name or email, ignoring case and spaces", () => {
    expect(filterMerchants(list, "PENDING", "").map((x) => x.name)).toEqual(["Foundry"]);
    expect(filterMerchants(list, "all", "  ACME ").map((x) => x.name)).toEqual(["Acme"]);
    expect(filterMerchants(list, "all", "zed.io").map((x) => x.name)).toEqual(["Zed"]);
    expect(filterMerchants(list, "VERIFIED", "foundry")).toEqual([]);
    expect(filterMerchants(list, "all", "")).toHaveLength(3);
  });
  it("counts each status", () => expect(countByKyb(list)).toEqual({ all: 3, PENDING: 1, VERIFIED: 1, REJECTED: 1 }));
  it("adds a scheme to website addresses", () => {
    expect(websiteHref("acme.com")).toBe("https://acme.com");
    expect(websiteHref(" http://acme.com ")).toBe("http://acme.com");
    expect(websiteHref("HTTPS://acme.com")).toBe("HTTPS://acme.com");
  });
});
