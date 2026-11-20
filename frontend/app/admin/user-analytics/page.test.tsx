import { beforeAll, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import AdminUserAnalyticsPage from "./page";

const API = "http://localhost/api";

beforeAll(() => {
  // recharts' ResponsiveContainer needs ResizeObserver, absent in jsdom.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const report = (over: Record<string, unknown> = {}) => ({
  days: 30,
  users: {
    total: 120,
    new: 18,
    newChange: { previous: 12, percent: 50 },
    signups: [{ date: "2026-11-12", count: 3, cumulative: 120 }],
  },
  active: { dau: 7, wau: 30, mau: 60, stickiness: 11.7, transactingPerDay: [{ date: "2026-11-12", users: 4 }] },
  funnel: [
    { step: "Registered", count: 120, percent: 100 },
    { step: "Started a transaction", count: 60, percent: 50 },
    { step: "Completed a transaction", count: 45, percent: 37.5 },
    { step: "Repeat user (2+ completed)", count: 20, percent: 16.7 },
  ],
  transactions: [
    { kind: "onramp", total: 40, completed: 30, failed: 5, successRate: 75, users: 25 },
    { kind: "offramp", total: 10, completed: 9, failed: 1, successRate: 90, users: 8 },
    { kind: "swap", total: 0, completed: 0, failed: 0, successRate: 0, users: 0 },
  ],
  volume: [
    { kind: "onramp", currency: "NGN", amount: 1250000.5 },
    { kind: "offramp", currency: "NGN", amount: 300000 },
  ],
  retention: [
    { day: 1, eligible: 100, retained: 40, percent: 40 },
    { day: 7, eligible: 80, retained: 20, percent: 25 },
    { day: 30, eligible: 0, retained: 0, percent: 0 },
  ],
  ...over,
});

function mock(onDays?: (d: string | null) => void, body = report()) {
  server.use(
    http.get(`${API}/admin/user-analytics`, ({ request }) => {
      onDays?.(new URL(request.url).searchParams.get("days"));
      return HttpResponse.json(body);
    }),
  );
}

describe("AdminUserAnalyticsPage", () => {
  it("shows headline stats, funnel, retention and per-type transactions", async () => {
    mock();
    renderWithClient(<AdminUserAnalyticsPage />);

    expect(await screen.findByText("120")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("+50% vs 12 before")).toBeInTheDocument();
    expect(screen.getByText("7 / 30 / 60")).toBeInTheDocument();
    expect(screen.getByText("Stickiness 11.7%")).toBeInTheDocument();

    expect(screen.getByText("Completed a transaction")).toBeInTheDocument();
    expect(screen.getByText("45 · 37.5%")).toBeInTheDocument();

    expect(screen.getByText("40 of 100")).toBeInTheDocument();
    expect(screen.getByText("1 day")).toBeInTheDocument();

    const onramp = screen.getByText("On-ramp").closest("tr") as HTMLElement;
    expect(within(onramp).getByText("75%")).toBeInTheDocument();
    expect(within(onramp).getByText("1,250,000.5 NGN")).toBeInTheDocument();
    const swap = screen.getByText("Swap").closest("tr") as HTMLElement;
    expect(within(swap).getByText("n/a (token swaps)")).toBeInTheDocument();
    expect(within(swap).getByText("—", { selector: "td" })).toBeInTheDocument();
  });

  it("handles no previous period and re-queries on range change", async () => {
    const seen: (string | null)[] = [];
    mock((d) => seen.push(d), report({ users: { total: 5, new: 5, newChange: { previous: 0, percent: null }, signups: [] } }));
    renderWithClient(<AdminUserAnalyticsPage />);

    expect(await screen.findByText("No previous period")).toBeInTheDocument();
    await waitFor(() => expect(seen).toContain("30"));
    await userEvent.click(screen.getByRole("button", { name: "90d" }));
    await waitFor(() => expect(seen).toContain("90"));
  });

  it("shows an error message when the request fails", async () => {
    server.use(http.get(`${API}/admin/user-analytics`, () => HttpResponse.json({}, { status: 500 })));
    renderWithClient(<AdminUserAnalyticsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load analytics");
  });
});
