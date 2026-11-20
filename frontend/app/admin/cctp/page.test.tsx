import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import { useAuthStore } from "@/lib/store";
import AdminCctpPage from "./page";

let search = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));

const API = "http://localhost/api";
const t = (o: Record<string, unknown> = {}) => ({
  id: "b1", reference: "BRG-1", fromChain: "Base", toChain: "Stellar", amount: "10000000", status: "COMPLETED", burnTxHash: "0xabc", sourceAddress: "0xSRC", destinationAddress: "GDEST", offrampReference: null,
  chainNetwork: null, createdAt: "2026-11-20T10:00:00.000Z", updatedAt: "2026-11-20T10:05:00.000Z", userId: "u1", userEmail: "ada@x.co", merchantId: null, merchantName: null, legStatus: "COMPLETED",
  legReference: "att_1", failedStep: null, failureReason: null, lastEventAt: "2026-11-20T10:05:00.000Z", legDetails: null, ...o,
});

let seen: URLSearchParams[] = [];
function mock(items: unknown[], status = 200) {
  seen = [];
  server.use(
    http.get(`${API}/admin/cctp/transactions`, ({ request }) => {
      seen.push(new URL(request.url).searchParams);
      return status === 200 ? HttpResponse.json({ total: items.length, limit: 10, offset: 0, items }) : HttpResponse.json({ message: "x" }, { status });
    }),
  );
}

beforeEach(() => {
  search = "";
  useAuthStore.setState({ token: "admin-jwt" });
});

describe("AdminCctpPage", () => {
  it("lists transfers with the route, the amount in USDC (not micro-units), progress and owner", async () => {
    mock([t(), t({ id: "b2", reference: "BRG-2", fromChain: "Base_Sepolia", toChain: "Stellar_Testnet", amount: "3000000", status: "FAILED", userEmail: null, merchantName: "MihasPay" })]);
    renderWithClient(<AdminCctpPage />);
    const table = await screen.findByRole("table", { name: "CCTP transfers" });
    const main = within(table).getByText("Base → Stellar").closest("tr") as HTMLElement;
    expect(within(main).getByText("10.00 USDC")).toBeInTheDocument();
    expect(within(main).getByText("ada@x.co")).toBeInTheDocument();
    expect(within(main).queryByText("Test")).not.toBeInTheDocument();
    const test = within(table).getByText(/Base Sepolia → Stellar Testnet/).closest("tr") as HTMLElement;
    expect(within(test).getByText("Test")).toBeInTheDocument(); // the chain names say it is a test network
    expect(within(test).getByText("3.00 USDC")).toBeInTheDocument();
    expect(within(test).getByText("MihasPay")).toBeInTheDocument();
  });

  it("opens a transfer: burn hash linked to the chain explorer, addresses, the failure and a trace link", async () => {
    mock([t({ fromChain: "Base_Sepolia", toChain: "Stellar_Testnet", status: "FAILED", failedStep: "attestation", failureReason: "timed out", offrampReference: "off_9" })]);
    renderWithClient(<AdminCctpPage />);
    await userEvent.click(await screen.findByText(/Base Sepolia → Stellar Testnet/));
    const panel = await screen.findByRole("dialog", { name: "Base Sepolia to Stellar Testnet" });
    expect(within(panel).getByRole("alert")).toHaveTextContent("Failed at attestation");
    expect(within(panel).getByRole("alert")).toHaveTextContent("timed out");
    expect(within(panel).getByRole("link", { name: /0xabc/ })).toHaveAttribute("href", "https://sepolia.basescan.org/tx/0xabc");
    expect(within(panel).getByRole("link", { name: "off_9" })).toHaveAttribute("href", "/admin/transactions/off_9");
    expect(within(panel).getByRole("link", { name: "Trace this transfer" })).toHaveAttribute("href", "/admin/transactions/BRG-1");
  });

  it("lists off-ramps funded over CCTP next to bridge transfers, and says which is which", async () => {
    mock([t(), t({ id: "o1", reference: "off_9", kind: "offramp_relay", fromChain: "Stellar", toChain: "Base", amount: "15000760", status: "PENDING", sourceAddress: "", offrampReference: "off_9" })]);
    renderWithClient(<AdminCctpPage />);
    const table = await screen.findByRole("table", { name: "CCTP transfers" });
    const relay = within(table).getByText("Stellar → Base").closest("tr") as HTMLElement;
    expect(within(relay).getByText("Off-ramp")).toBeInTheDocument();
    expect(within(relay).getByText("15.00076 USDC")).toBeInTheDocument();
    await userEvent.click(within(relay).getByText("Stellar → Base"));
    const panel = await screen.findByRole("dialog", { name: "Stellar to Base" });
    expect(within(panel).getByText("Off-ramp funded over CCTP")).toBeInTheDocument();
    expect(within(panel).queryByText("From address")).not.toBeInTheDocument(); // not recorded for a relay: no empty row
  });

  it("filters by status from the first page", async () => {
    mock([t()]);
    renderWithClient(<AdminCctpPage />);
    await screen.findByRole("table", { name: "CCTP transfers" });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "FAILED");
    const { waitFor } = await import("@testing-library/react");
    await waitFor(() => expect(seen.at(-1)!.get("status")).toBe("FAILED"));
    expect(seen.at(-1)!.get("offset")).toBe("0");
  });

  it("opens already searching for a reference from the link", async () => {
    mock([t()]);
    search = "q=BRG-1";
    renderWithClient(<AdminCctpPage />);
    expect(await screen.findByDisplayValue("BRG-1")).toBeInTheDocument();
    await vi.waitFor(() => expect(seen.at(-1)!.get("q")).toBe("BRG-1"));
  });

  it("explains an empty list and a failed load", async () => {
    mock([]);
    const { unmount } = renderWithClient(<AdminCctpPage />);
    expect(await screen.findByText("No CCTP transfers yet")).toBeInTheDocument();
    unmount();
    mock([], 500);
    renderWithClient(<AdminCctpPage />);
    expect(await screen.findByText("Couldn't load CCTP transfers")).toBeInTheDocument();
  });
});
