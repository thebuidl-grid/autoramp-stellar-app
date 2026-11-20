import { describe, expect, it } from "vitest";
import { ADMIN_NAV, isNavActive, resolveNavPath } from "./nav";

describe("admin nav", () => {
  it("has unique hrefs and every item is reachable under /admin", () => {
    const hrefs = ADMIN_NAV.flatMap((s) => s.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of hrefs) expect(h.startsWith("/admin")).toBe(true);
  });

  it("keeps the pages people already use", () => {
    const hrefs = ADMIN_NAV.flatMap((s) => s.items.map((i) => i.href));
    for (const h of ["/admin", "/admin/users", "/admin/merchants", "/admin/transactions", "/admin/waitlist", "/admin/user-analytics", "/admin/otc", "/admin/bitnob", "/admin/webhooks"]) {
      expect(hrefs).toContain(h);
    }
    // the dead API Keys page and the merged Transfer Logs page are not top-level items any more
    expect(hrefs).not.toContain("/admin/api-keys");
    expect(hrefs).not.toContain("/admin/transfer-logs");
  });

  describe("isNavActive", () => {
    it("matches the dashboard only on its own path", () => {
      expect(isNavActive("/admin", "/admin")).toBe(true);
      expect(isNavActive("/admin/users", "/admin")).toBe(false);
    });
    it("matches a section and its sub-pages, on a path boundary", () => {
      expect(isNavActive("/admin/users", "/admin/users")).toBe(true);
      expect(isNavActive("/admin/users/123", "/admin/users")).toBe(true);
      expect(isNavActive("/admin/users2", "/admin/users")).toBe(false);
      expect(isNavActive("/admin/merchants", "/admin/users")).toBe(false);
      expect(isNavActive(null, "/admin/users")).toBe(false);
    });
  });

  it("lights Transactions for the old Transfer Logs URLs", () => {
    expect(isNavActive(resolveNavPath("/admin/transfer-logs"), "/admin/transactions")).toBe(true);
    expect(isNavActive(resolveNavPath("/admin/transfer-logs/abc"), "/admin/transactions")).toBe(true);
    expect(resolveNavPath("/admin/users")).toBe("/admin/users");
  });
});
