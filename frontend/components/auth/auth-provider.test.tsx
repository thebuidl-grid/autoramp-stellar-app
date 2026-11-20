import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "./auth-provider";
import { useAuthStore } from "@/lib/store";

const push = vi.fn();
let pathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => pathname,
}));

function renderAt(path: string) {
  pathname = path;
  return render(
    <AuthProvider>
      <div>page</div>
    </AuthProvider>,
  );
}

describe("AuthProvider redirects for logged-out visitors", () => {
  beforeEach(() => {
    push.mockClear();
    window.localStorage.clear();
    useAuthStore.setState({ token: null, user: null, _hasHydrated: true });
  });

  it("keeps visitors on /waitlist instead of sending them to the landing page", async () => {
    renderAt("/waitlist");
    expect(screen.getByText("page")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(push).not.toHaveBeenCalled();
  });

  it("still sends logged-out visitors from protected pages to the landing page", async () => {
    renderAt("/profile");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });
});
