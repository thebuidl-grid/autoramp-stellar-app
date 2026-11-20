import { describe, expect, it } from "vitest";
import { isPublicPath } from "./public-routes";

describe("isPublicPath", () => {
  it.each(["/", "/waitlist", "/waitlist/", "/auth/login", "/docs", "/merchant/login", "/admin/waitlist", "/dashboard", "/guide", "/guide/", "/privacy-policy"])(
    "allows %s for logged-out visitors",
    (p) => expect(isPublicPath(p)).toBe(true),
  );

  it.each(["/profile", "/history", "/otc/trade", "/waitlisting", "/guidebook", "/analytics", null, undefined])(
    "does not allow %s",
    (p) => expect(isPublicPath(p)).toBe(false),
  );
});
