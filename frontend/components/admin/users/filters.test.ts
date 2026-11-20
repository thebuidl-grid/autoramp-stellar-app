import { describe, expect, it } from "vitest";
import { applyUserFilters, serverIgnoredRole, userStatusKey } from "./filters";

const users = [
  { role: "ADMIN", suspended: false },
  { role: "USER", suspended: false },
  { role: "user", suspended: true },
];

describe("applyUserFilters", () => {
  it("returns everyone for all/all", () => expect(applyUserFilters(users, "all", "all")).toHaveLength(3));
  it("filters by status", () => {
    expect(applyUserFilters(users, "active", "all")).toHaveLength(2);
    expect(applyUserFilters(users, "suspended", "all")).toEqual([users[2]]);
  });
  it("filters by role, case-insensitively, with 'user' meaning anyone who is not an admin", () => {
    expect(applyUserFilters(users, "all", "admin")).toEqual([users[0]]);
    expect(applyUserFilters(users, "all", "user")).toEqual([users[1], users[2]]);
  });
  it("combines both", () => expect(applyUserFilters(users, "suspended", "user")).toEqual([users[2]]));
});

describe("serverIgnoredRole", () => {
  it("is false when the rows match the role, or no role was asked for", () => {
    expect(serverIgnoredRole([{ role: "ADMIN" }], "admin")).toBe(false);
    expect(serverIgnoredRole([{ role: "USER" }, { role: "ADMIN" }], "all")).toBe(false);
  });
  it("is true when rows of the wrong role came back", () => {
    expect(serverIgnoredRole([{ role: "USER" }, { role: "ADMIN" }], "admin")).toBe(true);
    expect(serverIgnoredRole([{ role: "ADMIN" }], "user")).toBe(true);
  });
});

describe("userStatusKey", () => {
  it("maps the flag to a status the shared pill understands", () => {
    expect(userStatusKey({ suspended: true })).toBe("SUSPENDED");
    expect(userStatusKey({ suspended: false })).toBe("ACTIVE");
  });
});
