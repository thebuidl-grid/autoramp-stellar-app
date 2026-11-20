import { describe, expect, it } from "vitest";
import nextConfig, { BASELINE_HEADERS, NO_FRAMING_HEADERS, NO_FRAMING_SOURCES } from "../next.config";

const toMap = (h: { key: string; value: string }[]) => Object.fromEntries(h.map((x) => [x.key, x.value]));

describe("security headers", () => {
  it("does not advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("applies the baseline headers to every route", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*")!;
    const h = toMap(all.headers);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Strict-Transport-Security"]).toContain("max-age=");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toContain("camera=()");
    // wallet popups need window.opener
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
    expect(h["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(h["Content-Security-Policy"]).toContain("base-uri 'self'");
    expect(h["Content-Security-Policy"]).toContain("form-action 'self'");
  });

  it("forbids framing on login, admin and money screens", async () => {
    const rules = await nextConfig.headers!();
    for (const source of NO_FRAMING_SOURCES) {
      const rule = rules.find((r) => r.source === source);
      expect(rule, source).toBeDefined();
      const h = toMap(rule!.headers);
      expect(h["X-Frame-Options"]).toBe("DENY");
      expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    }
    expect(NO_FRAMING_SOURCES).toEqual(expect.arrayContaining(["/admin/:path*", "/auth/:path*", "/merchant/:path*"]));
  });

  it("keeps the public swap app embeddable (it is also a Base mini app)", () => {
    expect(NO_FRAMING_SOURCES).not.toContain("/:path*");
    expect(toMap(BASELINE_HEADERS)["X-Frame-Options"]).toBeUndefined();
    expect(toMap(BASELINE_HEADERS)["Content-Security-Policy"]).not.toContain("frame-ancestors");
    expect(toMap(NO_FRAMING_HEADERS)["X-Frame-Options"]).toBe("DENY");
  });
});
