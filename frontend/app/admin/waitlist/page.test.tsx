import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import AdminWaitlistPage from "./page";

const API = "http://localhost/api";

// Polling interval is read at render time, so each test can choose it (default: effectively never).
const refresh = vi.hoisted(() => ({ ms: 3_600_000 }));
vi.mock("@/lib/waitlist", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/waitlist")>();
  return {
    ...actual,
    get WAITLIST_AUTO_REFRESH_MS() {
      return refresh.ms;
    },
  };
});

beforeEach(() => {
  refresh.ms = 3_600_000;
  window.localStorage.clear();
});
afterEach(() => window.localStorage.clear());

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
  phoneCountry: ["NG", "GH", "KE"][i - 1] ?? null,
  country: ["GH", "NG", null][i - 1] ?? null,
  referrer: ["twitter.com", null, "news.example.org"][i - 1] ?? null,
  utmSource: i === 1 ? "twitter" : null,
  utmMedium: i === 1 ? "social" : null,
  utmCampaign: i === 1 ? "launch" : null,
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
          { type: "crypto_native", count: 9, percent: 21.4 },
          { type: "freelancer", count: 20, percent: 47.6 },
          { type: "cross_border", count: 4, percent: 9.5 },
          { type: "fintech", count: 6, percent: 14.3 },
          { type: "unknown", count: 3, percent: 7.1 },
        ],
        byCountry: [
          { key: "NG", count: 25, percent: 59.5 },
          { key: "GH", count: 10, percent: 23.8 },
          { key: "unknown", count: 7, percent: 16.7 },
        ],
        byReferrer: [
          { key: "direct", count: 30, percent: 71.4 },
          { key: "twitter.com", count: 12, percent: 28.6 },
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
            { type: "crypto_native", count: 0, percent: 0 },
            { type: "freelancer", count: 0, percent: 0 },
            { type: "cross_border", count: 0, percent: 0 },
            { type: "fintech", count: 0, percent: 0 },
            { type: "unknown", count: 0, percent: 0 },
          ],
          byCountry: [],
          byReferrer: [],
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
    expect(screen.getByText("1–3 of 3")).toBeInTheDocument();
  });

  it("shows each signup's name, email and type", async () => {
    mockApi();
    renderWithClient(<AdminWaitlistPage />);

    const row = (await screen.findByText("User Number2")).closest("tr") as HTMLElement;
    expect(within(row).getByText("user2@example.com")).toBeInTheDocument();
    expect(within(row).getByText("Fintech")).toBeInTheDocument();
  });

  it("shows where each signup came from: referrer, utm tags and the page", async () => {
    mockApi();
    renderWithClient(<AdminWaitlistPage />);

    const row1 = (await screen.findByText("User Number1")).closest("tr") as HTMLElement;
    expect(within(row1).getByText("twitter.com")).toBeInTheDocument();
    expect(within(row1).getByText("utm: twitter / social / launch")).toBeInTheDocument();
    expect(within(row1).getByText("page: waitlist-page")).toBeInTheDocument();

    const row2 = screen.getByText("User Number2").closest("tr") as HTMLElement;
    expect(within(row2).getByText("Direct / unknown")).toBeInTheDocument();
    expect(within(row2).queryByText(/^utm:/)).not.toBeInTheDocument();

    const row3 = screen.getByText("User Number3").closest("tr") as HTMLElement;
    expect(within(row3).getByText("news.example.org")).toBeInTheDocument();
  });

  it("shows each option's share as a percentage in the what-people-do card", async () => {
    mockApi();
    renderWithClient(<AdminWaitlistPage />);

    const card = (await screen.findByText("What people do (all time)")).closest("div[class*='rounded']") as HTMLElement;
    await waitFor(() => expect(within(card).getByText("20 · 47.6%")).toBeInTheDocument());
    expect(within(card).getByText("9 · 21.4%")).toBeInTheDocument();
    expect(within(card).getByText("4 · 9.5%")).toBeInTheDocument();
    expect(within(card).getByText("6 · 14.3%")).toBeInTheDocument();
    expect(within(card).getByText("3 · 7.1%")).toBeInTheDocument(); // Not provided (older signups)
  });

  it("shows the where-from breakdowns with country names and a direct label", async () => {
    mockApi();
    renderWithClient(<AdminWaitlistPage />);

    const where = (await screen.findByText("Where they signed up from (all time)")).closest("div[class*='rounded']") as HTMLElement;
    await waitFor(() => expect(within(where).getByText("Nigeria")).toBeInTheDocument());
    expect(within(where).getByText("25 · 59.5%")).toBeInTheDocument();
    expect(within(where).getByText("Ghana")).toBeInTheDocument();
    expect(within(where).getByText("Unknown")).toBeInTheDocument();

    const from = screen.getByText("Where they came from (all time)").closest("div[class*='rounded']") as HTMLElement;
    expect(within(from).getByText("Direct / unknown")).toBeInTheDocument();
    expect(within(from).getByText("30 · 71.4%")).toBeInTheDocument();
    expect(within(from).getByText("twitter.com")).toBeInTheDocument();
  });

  it("shows dashes for older signups without name or type", async () => {
    mockApi();
    server.use(
      http.get(`${API}/admin/waitlist`, () =>
        HttpResponse.json({
          data: [{ id: "old", email: "old@example.com", name: null, phoneNumber: null, userType: null, phoneCountry: null, country: null, referrer: null, utmSource: null, utmMedium: null, utmCampaign: null, source: null, createdAt: "2026-11-01T09:00:00.000Z" }],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
    );
    renderWithClient(<AdminWaitlistPage />);

    const row = (await screen.findByText("old@example.com")).closest("tr") as HTMLElement;
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("labels older signups without a type as not provided in the what-people-do card", async () => {
    mockApi();
    renderWithClient(<AdminWaitlistPage />);

    const card = (await screen.findByText("What people do (all time)")).closest("div.rounded-xl, div[class*='rounded']") as HTMLElement;
    await waitFor(() => expect(within(card).getByText("Freelancer")).toBeInTheDocument());
    expect(within(card).getByText("20 · 47.6%")).toBeInTheDocument();
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

  it("does not crash when the backend has no byCountry / byReferrer yet", async () => {
    mockApi();
    server.use(
      http.get(`${API}/admin/waitlist/stats`, () =>
        HttpResponse.json({
          total: 3, today: 1, inRange: 3, averagePerDay: 0.1, days: 30,
          change: { previous: 0, percent: null }, series: [], heatmap: [], bySource: [],
          byType: [{ type: "freelancer", count: 3, percent: 100 }],
          conversion: { registered: 0, total: 3, rate: 0 },
        }),
      ),
    );
    renderWithClient(<AdminWaitlistPage />);
    expect(await screen.findByText("No location data yet.")).toBeInTheDocument();
    expect(screen.getByText("No referrer data yet.")).toBeInTheDocument();
    expect(screen.getByText("3 · 100%")).toBeInTheDocument();
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
    expect(await screen.findByText("What people do (all time)")).toBeInTheDocument();
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

  describe("live updates", () => {
    const statsBody = (total: number) => ({
      total, today: total, inRange: total, averagePerDay: 0.1, days: 30,
      change: { previous: 0, percent: null }, series: [], heatmap: [], bySource: [], byCountry: [], byReferrer: [],
      byType: [{ type: "freelancer", count: total, percent: 100 }],
      conversion: { registered: 0, total, rate: 0 },
    });
    const row = (n: number, createdAt: string) => ({ ...entry(n), createdAt, userType: "freelancer" });

    /** Serves `rows()` / `total()` live and counts how often each endpoint is called. */
    function liveApi(rows: () => ReturnType<typeof row>[], total: () => number) {
      const calls = { stats: 0, list: 0 };
      server.use(
        http.get(`${API}/admin/waitlist/stats`, () => { calls.stats += 1; return HttpResponse.json(statsBody(total())); }),
        http.get(`${API}/admin/waitlist`, () => {
          calls.list += 1;
          const data = rows();
          return HttpResponse.json({ data, meta: { total: data.length, page: 1, limit: 20, totalPages: 1 } });
        }),
      );
      return calls;
    }

    it("shows when the data was last updated", async () => {
      liveApi(() => [row(1, "2026-11-10T09:00:00.000Z")], () => 1);
      renderWithClient(<AdminWaitlistPage />);
      expect(await screen.findByText("Updated just now")).toBeInTheDocument();
    });

    it("the Refresh button re-reads both the stats and the signups", async () => {
      const calls = liveApi(() => [row(1, "2026-11-10T09:00:00.000Z")], () => 1);
      renderWithClient(<AdminWaitlistPage />);
      await screen.findByText("User Number1");
      const before = { ...calls };

      await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

      await waitFor(() => {
        expect(calls.stats).toBe(before.stats + 1);
        expect(calls.list).toBe(before.list + 1);
      });
    });

    it("polls on its own while auto-refresh is on", async () => {
      refresh.ms = 100;
      const calls = liveApi(() => [row(1, "2026-11-10T09:00:00.000Z")], () => 1);
      renderWithClient(<AdminWaitlistPage />);
      await screen.findByText("User Number1");

      await waitFor(() => { expect(calls.stats).toBeGreaterThanOrEqual(3); expect(calls.list).toBeGreaterThanOrEqual(3); }, { timeout: 4000 });
    });

    it("stops polling when switched off, remembers that, and resumes when switched on", async () => {
      refresh.ms = 100;
      const calls = liveApi(() => [row(1, "2026-11-10T09:00:00.000Z")], () => 1);
      renderWithClient(<AdminWaitlistPage />);
      await screen.findByText("User Number1");

      const toggle = screen.getByRole("switch", { name: "Auto-refresh" });
      expect(toggle).toHaveAttribute("aria-checked", "true");
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-checked", "false");
      expect(window.localStorage.getItem("ar_admin_waitlist_autorefresh")).toBe("off");

      await new Promise((r) => setTimeout(r, 150)); // let any in-flight request settle
      const frozen = { ...calls };
      await new Promise((r) => setTimeout(r, 500));
      expect(calls).toEqual(frozen);

      await userEvent.click(toggle);
      expect(window.localStorage.getItem("ar_admin_waitlist_autorefresh")).toBe("on");
      await waitFor(() => expect(calls.stats).toBeGreaterThan(frozen.stats), { timeout: 4000 });
    });

    it("starts switched off when that was the saved choice", async () => {
      refresh.ms = 100;
      window.localStorage.setItem("ar_admin_waitlist_autorefresh", "off");
      const calls = liveApi(() => [row(1, "2026-11-10T09:00:00.000Z")], () => 1);
      renderWithClient(<AdminWaitlistPage />);
      await screen.findByText("User Number1");

      expect(screen.getByRole("switch", { name: "Auto-refresh" })).toHaveAttribute("aria-checked", "false");
      const frozen = { ...calls };
      await new Promise((r) => setTimeout(r, 500));
      expect(calls).toEqual(frozen);
    });

    it("highlights signups that arrive after the page was opened, and counts them", async () => {
      let arrived = false;
      liveApi(
        () => [
          ...(arrived ? [row(2, "2026-11-13T12:00:00.000Z")] : []),
          row(1, "2026-11-10T09:00:00.000Z"),
        ],
        () => (arrived ? 2 : 1),
      );
      renderWithClient(<AdminWaitlistPage />);
      const first = (await screen.findByText("User Number1")).closest("tr") as HTMLElement;
      expect(within(first).queryByText("New")).not.toBeInTheDocument();
      expect(screen.queryByText(/new since you opened/)).not.toBeInTheDocument();

      arrived = true; // someone signs up while the page is open
      await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

      const added = (await screen.findByText("User Number2")).closest("tr") as HTMLElement;
      expect(within(added).getByText("New")).toBeInTheDocument();
      expect(screen.getByText("1 new since you opened this page")).toBeInTheDocument();
      // the signup that was already there is not flagged
      expect(within(screen.getByText("User Number1").closest("tr") as HTMLElement).queryByText("New")).not.toBeInTheDocument();
    });
  });
});
