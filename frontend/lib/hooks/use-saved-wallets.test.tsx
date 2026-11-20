import { beforeEach, describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "@/test/mocks/server";
import { useAuthStore } from "@/lib/store";
import { useSavedWallets } from "./use-saved-wallets";

const API = "http://localhost/api";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useSavedWallets", () => {
  let calls = 0;
  beforeEach(() => {
    calls = 0;
    window.localStorage.clear();
    server.use(
      http.get(`${API}/user/wallets`, () => {
        calls += 1;
        return HttpResponse.json([{ id: "w1", address: "0x1" }]);
      }),
    );
  });

  it("does not call the API when logged out (no 401 flood)", async () => {
    useAuthStore.setState({ token: null, user: null, _hasHydrated: true });
    const { result } = renderHook(() => useSavedWallets(), { wrapper });

    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toBe(0);
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches wallets when logged in", async () => {
    useAuthStore.setState({
      token: "t",
      user: { id: "u1", email: "a@b.co", role: "USER" } as never,
      _hasHydrated: true,
    });
    const { result } = renderHook(() => useSavedWallets(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([{ id: "w1", address: "0x1" }]));
    expect(calls).toBe(1);
  });
});
