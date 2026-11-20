import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useLastUpdated } from "./use-last-updated";

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(() => useLastUpdated(), { wrapper }) };
}

describe("useLastUpdated", () => {
  it("is undefined until something has loaded", () => {
    const { result } = setup();
    expect(result.current).toBeUndefined();
  });

  it("tracks the newest successful load and ignores failed ones", async () => {
    const { client, result } = setup();
    await act(async () => {
      await client.fetchQuery({ queryKey: ["a"], queryFn: async () => 1 });
    });
    await waitFor(() => expect(result.current).toBeTypeOf("number"));
    const first = result.current!;

    await act(async () => {
      await client.fetchQuery({ queryKey: ["bad"], queryFn: async () => { throw new Error("nope"); } }).catch(() => undefined);
    });
    expect(result.current).toBe(first);

    await new Promise((r) => setTimeout(r, 5));
    await act(async () => {
      await client.fetchQuery({ queryKey: ["b"], queryFn: async () => 2 });
    });
    await waitFor(() => expect(result.current!).toBeGreaterThan(first));
  });
});
