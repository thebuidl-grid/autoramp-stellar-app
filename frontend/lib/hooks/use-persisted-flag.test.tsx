import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePersistedFlag } from "./use-persisted-flag";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("usePersistedFlag", () => {
  it("uses the fallback when nothing is saved, and the saved value when there is one", () => {
    expect(renderHook(() => usePersistedFlag("k1", true)).result.current[0]).toBe(true);
    localStorage.setItem("k2", "false");
    expect(renderHook(() => usePersistedFlag("k2", true)).result.current[0]).toBe(false);
  });

  it("saves changes, supports a toggle function, and keeps other users of the same key in sync", () => {
    const a = renderHook(() => usePersistedFlag("k3", true));
    const b = renderHook(() => usePersistedFlag("k3", true));
    act(() => a.result.current[1]((prev) => !prev));
    expect(localStorage.getItem("k3")).toBe("false");
    expect(a.result.current[0]).toBe(false);
    expect(b.result.current[0]).toBe(false);
    act(() => b.result.current[1](true));
    expect(a.result.current[0]).toBe(true);
  });

  it("keeps working when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => usePersistedFlag("k4", true));
    expect(result.current[0]).toBe(true);
    expect(() => act(() => result.current[1](false))).not.toThrow();
  });
});
