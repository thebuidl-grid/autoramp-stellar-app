import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CursorPagination, Pagination, pageWindow, rangeLabel } from "./pagination";

afterEach(cleanup);

describe("pageWindow", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it("keeps first, last and the neighbourhood, with gaps where pages are skipped", () => {
    expect(pageWindow(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
    expect(pageWindow(1, 20)).toEqual([1, 2, "gap", 20]);
    expect(pageWindow(20, 20)).toEqual([1, "gap", 19, 20]);
  });
  it("never hides a single page behind a gap", () => {
    expect(pageWindow(4, 20)).toEqual([1, 2, 3, 4, 5, "gap", 20]); // page 2 shown, not "…"
    expect(pageWindow(17, 20)).toEqual([1, "gap", 16, 17, 18, 19, 20]);
  });
  it("clamps out-of-range input", () => {
    expect(pageWindow(99, 5)).toEqual([1, "gap", 4, 5]); // clamped to the last page
    expect(pageWindow(-3, 0)).toEqual([1]);
  });
});

describe("rangeLabel", () => {
  it("says which rows are on screen", () => {
    expect(rangeLabel(1, 25, 381)).toBe("1–25 of 381");
    expect(rangeLabel(16, 25, 381)).toBe("376–381 of 381");
    expect(rangeLabel(1, 10, 1234)).toBe("1–10 of 1,234");
    expect(rangeLabel(1, 10, 0)).toBe("0 results");
  });
});

describe("<Pagination />", () => {
  const setup = (over: Partial<Parameters<typeof Pagination>[0]> = {}) => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    render(<Pagination page={3} pageSize={10} total={95} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} {...over} />);
    return { onPageChange, onPageSizeChange };
  };

  it("shows the range, names every control, and marks the current page", () => {
    setup();
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
    expect(screen.getByText("21–30 of 95")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 3" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Page 4" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Page 10" })).toBeInTheDocument(); // last page of 10
  });

  it("goes to a page, the previous page and the next page", async () => {
    const { onPageChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Page 10" }));
    await userEvent.click(screen.getByRole("button", { name: "Previous page" }));
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange.mock.calls.map((c) => c[0])).toEqual([10, 2, 4]);
  });

  it("disables Previous on the first page and Next on the last", () => {
    setup({ page: 1 });
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    cleanup();
    setup({ page: 10 });
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("changes the page size", async () => {
    const { onPageSizeChange } = setup();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "50");
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it("hides the page buttons when everything fits on one page, but still says how many rows", () => {
    setup({ page: 1, total: 7 });
    expect(screen.getByText("1–7 of 7")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
  });

  it("freezes the controls while a page loads", () => {
    setup({ disabled: true });
    expect(screen.getByRole("button", { name: "Page 4" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });
});

describe("<CursorPagination />", () => {
  const base = { pageIndex: 2, pageSize: 25, total: 381, hasNewer: true, hasOlder: true };

  it("says where you are and moves newer or older", async () => {
    const onNewer = vi.fn();
    const onOlder = vi.fn();
    render(<CursorPagination {...base} onNewer={onNewer} onOlder={onOlder} />);
    expect(screen.getByText("26–50 of 381")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 16")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Newer" }));
    await userEvent.click(screen.getByRole("button", { name: "Older" }));
    expect(onNewer).toHaveBeenCalledTimes(1);
    expect(onOlder).toHaveBeenCalledTimes(1);
  });

  it("disables the ends and copes with an unknown total", () => {
    render(<CursorPagination pageIndex={1} pageSize={25} hasNewer={false} hasOlder={false} onNewer={() => undefined} onOlder={() => undefined} />);
    expect(screen.getByText("Page 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Newer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Older" })).toBeDisabled();
    expect(screen.queryByText(/of \d+$/)).not.toBeInTheDocument();
  });

  it("changes the page size", async () => {
    const onPageSizeChange = vi.fn();
    render(<CursorPagination {...base} onNewer={() => undefined} onOlder={() => undefined} onPageSizeChange={onPageSizeChange} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "10");
    expect(onPageSizeChange).toHaveBeenCalledWith(10);
  });
});
