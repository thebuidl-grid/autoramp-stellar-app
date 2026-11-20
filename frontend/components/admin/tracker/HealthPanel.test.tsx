import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import { useAuthStore } from "@/lib/store";
import { HealthPanel, stoppedAt } from "./HealthPanel";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const API = "http://localhost/api";

const row = (over: Record<string, unknown> = {}) => ({
  id: "o1", reference: "off_stuck1", type: "offramp", status: "PAYOUT_PENDING", amount: "5", currency: "USDC", ownerId: "u",
  createdAt: "2026-11-20T09:00:00.000Z", updatedAt: "2026-11-20T10:00:00.000Z", ageMinutes: 125, lastStep: "burn_confirmed",
  providers: [{ provider: "CCTP", role: "BRIDGE", status: "PENDING", failedStep: "attestation", failureReason: "timed out" }], ...over,
});
const page = (items: unknown[], total = items.length) => ({ total, limit: 10, offset: 0, items });

let seen: URLSearchParams[] = [];
function mock(kind: "stuck" | "failed", body: unknown, status = 200) {
  seen = [];
  server.use(http.get(`${API}/admin/transactions/${kind}`, ({ request }) => { seen.push(new URL(request.url).searchParams); return HttpResponse.json(body as never, { status }); }));
}

beforeEach(() => {
  push.mockClear();
  useAuthStore.setState({ token: "admin-jwt" });
});

describe("stoppedAt", () => {
  it("names a failed provider step first, else the last recorded step", () => {
    expect(stoppedAt(row())).toBe("attestation (CCTP)");
    expect(stoppedAt({ providers: [], lastStep: "burn_confirmed" })).toBe("burn confirmed");
    expect(stoppedAt({ providers: [], lastStep: null })).toBeNull();
  });
});

describe("<HealthPanel kind='stuck' />", () => {
  it("lists what is stuck with how long, where it stopped and who handled it", async () => {
    mock("stuck", page([row()]));
    renderWithClient(<HealthPanel kind="stuck" />);
    const table = await screen.findByRole("table", { name: "Stuck transactions" });
    const r = within(table).getByText("Off-ramp").closest("tr") as HTMLElement;
    expect(within(r).getByText("5.00 USDC")).toBeInTheDocument();
    expect(within(r).getByText("attestation (CCTP)")).toBeInTheDocument();
    expect(within(r).getByText("CCTP")).toBeInTheDocument();
    expect(within(r).getByText("2h 5m")).toBeInTheDocument();
    expect(within(table).getByText("Stuck for")).toBeInTheDocument();
  });

  it("opens the trace when a row is clicked", async () => {
    mock("stuck", page([row()]));
    renderWithClient(<HealthPanel kind="stuck" />);
    const table = await screen.findByRole("table", { name: "Stuck transactions" });
    await userEvent.click(within(table).getByText("Off-ramp"));
    expect(push).toHaveBeenCalledWith("/admin/transactions/off_stuck1");
  });

  it("sends the type and provider filters and asks to include abandoned ones when ticked, back on page 1", async () => {
    mock("stuck", page([row()], 40));
    renderWithClient(<HealthPanel kind="stuck" />);
    await screen.findByRole("table", { name: "Stuck transactions" });
    await userEvent.click(screen.getByRole("button", { name: "Page 2" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Type" }), "offramp");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Provider" }), "CCTP");
    await userEvent.click(screen.getByRole("checkbox", { name: /Include abandoned/ }));
    await vi.waitFor(() => expect(seen.at(-1)!.get("includeAbandoned")).toBe("true"));
    const last = seen.at(-1)!;
    expect(last.get("type")).toBe("offramp");
    expect(last.get("provider")).toBe("CCTP");
    expect(last.get("offset")).toBe("0");
  });

  it("says nothing is stuck, in plain words", async () => {
    mock("stuck", page([]));
    renderWithClient(<HealthPanel kind="stuck" />);
    expect(await screen.findByText("Nothing is stuck")).toBeInTheDocument();
  });

  it("explains a failed load and can retry", async () => {
    mock("stuck", { message: "boom" }, 500);
    renderWithClient(<HealthPanel kind="stuck" />);
    expect(await screen.findByText("Couldn't load stuck transactions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("<HealthPanel kind='failed' />", () => {
  it("lists failures with 'Failed at' and no abandoned toggle", async () => {
    mock("failed", page([row({ status: "FAILED", reference: "off_f1" })]));
    renderWithClient(<HealthPanel kind="failed" />);
    const table = await screen.findByRole("table", { name: "Failed transactions" });
    expect(within(table).getByText("Failed at")).toBeInTheDocument();
    expect(within(table).getByText("Failed")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Include abandoned/ })).not.toBeInTheDocument();
  });
  it("says nothing has failed when it is empty", async () => {
    mock("failed", page([]));
    renderWithClient(<HealthPanel kind="failed" />);
    expect(await screen.findByText("Nothing has failed")).toBeInTheDocument();
  });
});
