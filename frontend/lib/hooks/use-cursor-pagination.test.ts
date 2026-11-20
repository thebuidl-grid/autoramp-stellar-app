import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCursorPagination } from "./use-cursor-pagination";

describe("useCursorPagination", () => {
  it("starts on page 1 with no cursor and cannot go back", () => {
    const { result } = renderHook(() => useCursorPagination());

    expect(result.current.cursor).toBeUndefined();
    expect(result.current.pageNumber).toBe(1);
    expect(result.current.canGoPrevious).toBe(false);
  });

  it("advances to the next cursor and tracks the page number", () => {
    const { result } = renderHook(() => useCursorPagination());

    act(() => result.current.goNext("cursor-a"));

    expect(result.current.cursor).toBe("cursor-a");
    expect(result.current.pageNumber).toBe(2);
    expect(result.current.canGoPrevious).toBe(true);
  });

  it("steps backward to a previously visited cursor", () => {
    const { result } = renderHook(() => useCursorPagination());

    act(() => result.current.goNext("cursor-a"));
    act(() => result.current.goNext("cursor-b"));
    act(() => result.current.goPrevious());

    expect(result.current.cursor).toBe("cursor-a");
    expect(result.current.pageNumber).toBe(2);
    expect(result.current.canGoPrevious).toBe(true);
  });

  it("reuses the cached cursor when re-advancing into an already-visited page", () => {
    const { result } = renderHook(() => useCursorPagination());

    act(() => result.current.goNext("cursor-a"));
    act(() => result.current.goPrevious());
    // A stale/different value here must be ignored — the cache from the
    // first visit to page 2 is the source of truth, not this call's argument.
    act(() => result.current.goNext("cursor-a-stale"));

    expect(result.current.cursor).toBe("cursor-a");
  });

  it("never goes below page 1", () => {
    const { result } = renderHook(() => useCursorPagination());

    act(() => result.current.goPrevious());

    expect(result.current.pageNumber).toBe(1);
    expect(result.current.canGoPrevious).toBe(false);
  });

  it("reset returns to page 1 with no cursor", () => {
    const { result } = renderHook(() => useCursorPagination());

    act(() => result.current.goNext("cursor-a"));
    act(() => result.current.goNext("cursor-b"));
    act(() => result.current.reset());

    expect(result.current.cursor).toBeUndefined();
    expect(result.current.pageNumber).toBe(1);
    expect(result.current.canGoPrevious).toBe(false);
  });
});
