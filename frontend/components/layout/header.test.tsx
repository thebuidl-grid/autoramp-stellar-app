import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "./header";
import { useAuthStore } from "@/lib/store";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock("@/lib/hooks/use-auth", () => ({
  useMerchantStatus: () => ({ data: undefined }),
  useOtcStatus: () => ({ data: undefined, isOTCEnabled: false, isOnboarded: false }),
}));
vi.mock("@/components/layout/network-switch", () => ({ NetworkSwitch: () => <div>network</div> }));

function signedOut() {
  useAuthStore.setState({ token: null, user: null, _hasHydrated: true });
}
function signedIn() {
  useAuthStore.setState({
    token: "t",
    user: { id: "u1", email: "a@b.co", role: "USER", isMerchant: true } as never,
    _hasHydrated: true,
  });
}

describe("<Header /> on mobile", () => {
  beforeEach(() => window.localStorage.clear());

  it("gives logged-out visitors a menu with Docs and Support (nav is hidden below md)", async () => {
    signedOut();
    render(<Header />);

    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const menu = await screen.findByRole("menu");

    expect(within(menu).getByRole("menuitem", { name: "API Docs" })).toHaveAttribute("href", "/docs");
    expect(within(menu).getByRole("menuitem", { name: "Support" })).toHaveAttribute(
      "href",
      "mailto:dev@thebuidlgrid.org",
    );
    expect(within(menu).queryByRole("menuitem", { name: "History" })).not.toBeInTheDocument();
  });

  it("adds History and Merchant Dashboard for signed-in users", async () => {
    signedIn();
    render(<Header />);
    // Checked first: an open Radix menu marks the rest of the page aria-hidden.
    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const menu = await screen.findByRole("menu");

    expect(within(menu).getByRole("menuitem", { name: "History" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Merchant Dashboard" })).toBeInTheDocument();
  });

  it("uses a short login label on small screens and the full one on larger screens", () => {
    signedOut();
    render(<Header />);
    const button = screen.getByRole("button", { name: /Log in|Login\/Sign up/ });
    expect(within(button).getByText("Log in")).toHaveClass("sm:hidden");
    expect(within(button).getByText("Login/Sign up")).toHaveClass("hidden", "sm:inline");
  });

  it("keeps a labelled logo link when the wordmark is hidden on narrow screens", () => {
    signedOut();
    render(<Header />);
    expect(screen.getByRole("link", { name: "AutoRamp home" })).toHaveAttribute("href", "/");
  });
});
