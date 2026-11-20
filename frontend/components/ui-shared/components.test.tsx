import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CopyableId, DataTable, EmptyState, ErrorState, FreshnessLabel, Money, ProviderBadge, StatusBadge, StatusTrack, relativeAge, shortenId, type Column } from "./index";

afterEach(cleanup);

describe("StatusBadge", () => {
  it("always shows the label (colour is never the only signal) and exposes the tone", () => {
    render(<StatusBadge status="PARTIALLY_SETTLED" />);
    const badge = screen.getByText("Partly settled");
    expect(badge.closest("[data-tone]")).toHaveAttribute("data-tone", "warn");
  });
  it("lets a caller override the tone for a status that needs more weight", () => {
    render(<StatusBadge status="PENDING" tone="warn" label="Pending review" />);
    expect(screen.getByText("Pending review").closest("[data-tone]")).toHaveAttribute("data-tone", "warn");
  });
  it("lets a caller override the label", () => {
    render(<StatusBadge status="COMPLETED" label="Paid" />);
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });
});

describe("StatusTrack", () => {
  it("renders one node per step and marks the live step with aria-current", () => {
    render(<StatusTrack kind="OFFRAMP" status="PAYOUT_PENDING" />);
    const list = screen.getByRole("list", { name: "Step 5 of 6: Paying out" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    expect(items[4]).toHaveAttribute("aria-current", "step");
    expect(items.map((i) => i.getAttribute("data-state"))).toEqual(["done", "done", "done", "done", "current", "upcoming"]);
  });
  it("marks where a failure stopped and says so in its accessible name", () => {
    render(<StatusTrack kind="OFFRAMP" status="FAILED" reachedStatus="PAYOUT_PENDING" />);
    expect(screen.getByRole("list", { name: "Failed at Paying out" })).toBeInTheDocument();
    expect(screen.getByText("Paying out").closest("li")).toHaveAttribute("data-state", "failed");
  });
  it("only pulses the live node, and the pulse is motion-safe so reduced motion turns it off", () => {
    const { container } = render(<StatusTrack kind="SWAP" status="PROCESSING" />);
    const pulses = container.querySelectorAll(".motion-safe\\:animate-ping");
    expect(pulses).toHaveLength(1);
    cleanup();
    const done = render(<StatusTrack kind="SWAP" status="COMPLETED" />);
    expect(done.container.querySelectorAll(".motion-safe\\:animate-ping")).toHaveLength(0);
  });
  it("compact mode keeps step names for screen readers but hides them visually", () => {
    render(<StatusTrack kind="SWAP" status="PROCESSING" compact />);
    expect(screen.getByText("Swapping: current")).toHaveClass("sr-only");
  });
});

describe("DataTable", () => {
  type Row = { id: string; name: string };
  const columns: Column<Row>[] = [{ key: "name", header: "Name", cell: (r) => r.name }];
  const base = { columns, getRowId: (r: Row) => r.id, caption: "People" };

  it("shows a loading skeleton, not an empty message, while the first load is in flight", () => {
    render(<DataTable {...base} rows={undefined} isLoading />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("Nothing to show")).not.toBeInTheDocument();
  });
  it("shows the error with a retry that calls back, instead of an empty table", () => {
    const onRetry = vi.fn();
    render(<DataTable {...base} rows={undefined} error={{ message: "Bitnob is unreachable." }} onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load this list");
    expect(screen.getByRole("alert")).toHaveTextContent("Bitnob is unreachable.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it("shows an empty state with a hint when there are no rows", () => {
    render(<DataTable {...base} rows={[]} emptyTitle="No transactions yet" emptyHint="They appear here once a customer pays." />);
    expect(screen.getByText("No transactions yet")).toBeInTheDocument();
    expect(screen.getByText("They appear here once a customer pays.")).toBeInTheDocument();
  });
  it("renders rows with a named table and column headers", () => {
    render(<DataTable {...base} rows={[{ id: "1", name: "Ada" }, { id: "2", name: "Bayo" }]} />);
    expect(screen.getByRole("table", { name: "People" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });
  it("makes clickable rows keyboard operable (Enter and Space)", () => {
    const onRowClick = vi.fn();
    render(<DataTable {...base} rows={[{ id: "1", name: "Ada" }]} onRowClick={onRowClick} />);
    const row = screen.getByText("Ada").closest("tr")!;
    expect(row).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    fireEvent.click(row);
    expect(onRowClick).toHaveBeenCalledTimes(3);
    expect(onRowClick).toHaveBeenCalledWith({ id: "1", name: "Ada" });
  });
  it("hides the footer when the load failed", () => {
    render(<DataTable {...base} rows={[]} error={{}} footer={<span>Page 1</span>} />);
    expect(screen.queryByText("Page 1")).not.toBeInTheDocument();
  });
});

describe("Money", () => {
  it("formats from the string and aligns digits", () => {
    const { container } = render(<Money value="149700" currency="NGN" />);
    expect(container).toHaveTextContent("₦149,700.00");
    expect(container.firstChild).toHaveClass("tabular-nums");
  });
  it("shows direction for statements without double signs", () => {
    const { container, rerender } = render(<Money value="149700" currency="NGN" direction="out" />);
    expect(container).toHaveTextContent("−₦149,700.00");
    rerender(<Money value="-149700" currency="NGN" direction="out" />);
    expect(container).toHaveTextContent("−₦149,700.00");
    rerender(<Money value="100" currency="USDC" direction="in" />);
    expect(container).toHaveTextContent("+100.00 USDC");
  });
});

describe("CopyableId", () => {
  it("shortens long ids but keeps the full value reachable", () => {
    render(<CopyableId value="off_9f2c4a1b7d3e5566" label="reference" />);
    expect(screen.getByTitle("off_9f2c4a1b7d3e5566")).toHaveTextContent(shortenId("off_9f2c4a1b7d3e5566"));
    expect(shortenId("short")).toBe("short");
  });
  it("copies the full value and confirms", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyableId value="off_9f2c4a1b7d3e5566" label="reference" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy reference" }));
    expect(writeText).toHaveBeenCalledWith("off_9f2c4a1b7d3e5566");
    expect(await screen.findByRole("button", { name: "Copied reference" })).toBeInTheDocument();
  });
  it("shows a dash for a missing value", () => {
    render(<CopyableId value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("FreshnessLabel", () => {
  it("describes age in plain words", () => {
    expect(relativeAge(1000)).toBe("just now");
    expect(relativeAge(12_000)).toBe("12s ago");
    expect(relativeAge(4 * 60_000)).toBe("4m ago");
    expect(relativeAge(3 * 3_600_000)).toBe("3h ago");
    expect(relativeAge(2 * 86_400_000)).toBe("2d ago");
  });
  it("says when nothing has loaded, so a blank dashboard can't look current", () => {
    render(<FreshnessLabel updatedAt={undefined} />);
    expect(screen.getByText("Not loaded yet")).toBeInTheDocument();
  });
  it("shows the age of the data", () => {
    render(<FreshnessLabel updatedAt={Date.now() - 30_000} />);
    expect(screen.getByText(/Updated (29|30|31)s ago/)).toBeInTheDocument();
  });
});

describe("misc", () => {
  it("names providers and identifies them by name, not colour", () => {
    render(<ProviderBadge provider="PULSE_MFB" role="payout" />);
    expect(screen.getByText("Pulse MFB")).toBeInTheDocument();
    expect(screen.getByText("payout")).toBeInTheDocument();
  });
  it("EmptyState and ErrorState speak plainly", () => {
    render(
      <>
        <EmptyState title="No payouts yet" hint="Payouts appear after your first settlement." />
        <ErrorState title="Couldn't reach the server" message="Check your connection and try again." />
      </>,
    );
    expect(screen.getByText("No payouts yet")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Check your connection and try again.");
  });
});
