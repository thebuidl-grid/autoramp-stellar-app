import { beforeAll, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import AdminWaitlistPage from "./page";

const API = "http://localhost/api";

beforeAll(() => {
  // recharts' ResponsiveContainer needs ResizeObserver, absent in jsdom.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const entry = (i: number) => ({
  id: `w${i}`,
  name: `User Number${i}`,
  phoneNumber: `+23480000000${i}`,
  userType: ["freelancer", "fintech", "cross_border"][i - 1] ?? null,
  email: `user${i}@example.com`,
  source: i % 2 ? "waitlist-page" : null,
  createdAt: "2026-11-10T09:30:00.000Z",
});

function mockApi(onStats?: (days: string | null) => void) {
  server.use(
    http.get(`${API}/admin/waitlist/stats`, ({ request }) => {
      onStats?.(new URL(request.url).searchParams.get("days"));
      return HttpResponse.json({
        total: 42, today: 5, inRange: 30, averagePerDay: 1.5, days: 30,
        change: { previous: 20, percent: 50 },
        series: [
          { date: "2026-11-11", count: 3, cumulative: 37 },
          { date: "2026-11-12", count: 5, cumulative: 42 },
        ],
        heatmap: Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => (d === 2 && h === 14 ? 4 : 0))),
        bySource: [{ source: "waitlist-page", count: 22 }, { source: "unknown", count: 8 }],
        byType: [
          { type: "crypto_native", count: 9 },
          { type: "freelancer", count: 20 },
          { type: "cross_border", count: 4 },
          { type: "fintech", count: 6 },
          { type: "unknown", count: 3 },
        ],
        conversion: { registered: 10, total: 42, rate: 23.8 },
      });
    }),
    http.get(`${API}/admin/waitlist`, ({ request }) => {
      const q = new URL(request.url).searchParams;
      const search = q.get("search");
      const all = [entry(1), entry(2), entry(3)].filter((e) => !search || [e.email, e.name, e.phoneNumber].some((v) => v.toLowerCase().includes(search.toLowerCase())));
      return HttpResponse.json({
        data: all,
        meta: { total: all.length, page: 1, limit: 20, totalPages: 1 },
      });
    }),
  );
}

describe("AdminWaitlistPage", () => {
  it("shows the heatmap, source breakdown and chart mode toggle", async () => {
    mockApi();
    renderWithClient(<AdminWaitlistPage />);

    expect(await screen.findByTitle("Tue 14:00 UTC: 4 signups")).toBeInTheDocument();
    expect(screen.getByTitle("Sun 00:00 UTC: 0 signups")).toBeInTheDocument();
    expect(screen.getByText("waitlist-page", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("22")).toBeInTheDocument();

    expect(screen.getByText("Signups per day")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "cumulative" }));
    expect(screen.getByText("Total signups over time")).toBeInTheDocument();
  });

  it("shows n/a for the change when there is no previous period", async () => {
    mockApi();
    server.use(
      http.get(`${API}/admin/waitlist/stats`, () =>
        HttpResponse.json({
          total: 3, today: 3, inRange: 3, averagePerDay: 0.1, days: 30,
          change: { previous: 0, percent: null }, series: [], heatmap: [], bySource: [],
          byType: [
            { type: "crypto_native", count: 0 },
            { type: "freelancer", count: 0 },
            { type: "cross_border", count: 0 },
            { type: "fintech", count: 0 },
            { type: "unknown", count: 0 },
          ],
          conversion: { registered: 0, total: 3, rate: 0 },
        }),
      ),
    );
    renderWithClient(<AdminWaitlistPage />);
    expect(await screen.findByText("n/a")).toBeInTheDocument();
    expect(screen.getByText("No signups in this range.")).toBeInTheDocument();
  });

  it("downloads the CSV export", async () => {
    mockApi();
    server.use(
      http.get(`${API}/admin/waitlist/export`, () =>
        new HttpResponse("email,source,signed_up_at_utc\n", { headers: { "Content-Type": "text/csv" } }),
      ),
    );
    const created = vi.fn(() => "blob:x");
    URL.createObjectURL = created;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderWithClient(<AdminWaitlistPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Export CSV/ }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(created).toHaveBeenCalled();
    click.mockRestore();
  });

  it("shows totals, today's signups and the signup rows", async () => {
    mockApi();
    renderWithClient(<AdminWaitlistPage />);

    await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument());
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("1.5")).toBeInTheDocument();
    expect(screen.getByText("+50%")).toBeInTheDocument();
    expect(screen.getByText("30 vs 20")).toBeInTheDocument();
    expect(screen.getByText("23.8%")).toBeInTheDocument();
    expect(screen.getByText("10 of 42")).toBeInTheDocument();
    expect(await screen.findByText("user1@example.com")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 to 3 of 3 signups")).toBeInTheDocument();
  });

  it("shows each signup's name, email, phone and type", async () => {
    mockApi();
    renderWithClient(<AdminWaitlistPage />);

    const row = (await screen.findByText("User Number2")).closest("tr") as HTMLElement;
    expect(within(row).getByText("user2@example.com")).toBeInTheDocument();
    expect(within(row).getByText("+234800000002")).toBeInTheDocument();
    expect(within(row).getByText("Fintech")).toBeInTheDocument();
  });

  it("shows dashes for older signups without name, phone or type", async () => {
    mockApi();
    server.use(
      http.get(`${API}/admin/waitlist`, () =>
        HttpResponse.json({
          data: [{ id: "old", email: "old@example.com", name: null, phoneNumber: null, userType: null, source: null, createdAt: "2026-11-01T09:00:00.000Z" }],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
    );
    renderWithClient(<AdminWaitlistPage />);

    const row = (await screen.findByText("old@example.com")).closest("tr") as HTMLElement;
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("shows who is signing up by type, labelling older signups as not provided", async () => {
    mockApi();
    renderWithClient(<AdminWaitlistPage />);

    const card = (await screen.findByText("Who is signing up (all time)")).closest("div.rounded-xl, div[class*='rounded']") as HTMLElement;
    await waitFor(() => expect(within(card).getByText("Freelancer")).toBeInTheDocument());
    expect(within(card).getByText("20")).toBeInTheDocument();
    expect(within(card).getByText("Crypto-native")).toBeInTheDocument();
    expect(within(card).getByText("Not provided")).toBeInTheDocument();
  });

  it("searches by name and phone, not only email", async () => {
    mockApi();
    renderWithClient(<AdminWaitlistPage />);
    await screen.findByText("User Number1");

    await userEvent.type(screen.getByLabelText("Search signups"), "number3");
    await waitFor(() => expect(screen.queryByText("User Number1")).not.toBeInTheDocument());
    expect(await screen.findByText("User Number3")).toBeInTheDocument();
  });

  it("does not crash when an older backend does not return byType", async () => {
    mockApi();
    server.use(
      http.get(`${API}/admin/waitlist/stats`, () =>
        HttpResponse.json({
          total: 3, today: 1, inRange: 3, averagePerDay: 0.1, days: 30,
          change: { previous: 0, percent: null }, series: [], heatmap: [], bySource: [],
          conversion: { registered: 0, total: 3, rate: 0 },
        }),
      ),
    );
    renderWithClient(<AdminWaitlistPage />);
    expect(await screen.findByText("Who is signing up (all time)")).toBeInTheDocument();
    expect(await screen.findByText("No signups yet.")).toBeInTheDocument();
  });

  it("re-queries stats when the range changes", async () => {
    const seen: (string | null)[] = [];
    mockApi((d) => seen.push(d));
    renderWithClient(<AdminWaitlistPage />);
    await waitFor(() => expect(seen).toContain("30"));

    await userEvent.click(screen.getByRole("button", { name: "7d" }));
    await waitFor(() => expect(seen).toContain("7"));
  });

  it("searches by email", async () => {
    mockApi();
    renderWithClient(<AdminWaitlistPage />);
    await screen.findByText("user1@example.com");

    await userEvent.type(screen.getByLabelText("Search signups"), "user2");
    await waitFor(() => expect(screen.queryByText("user1@example.com")).not.toBeInTheDocument());
    expect(await screen.findByText("user2@example.com")).toBeInTheDocument();
    expect(screen.queryByText("user3@example.com")).not.toBeInTheDocument();
  });
});
