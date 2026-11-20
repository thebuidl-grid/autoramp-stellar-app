import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminTransferLogsRedirect from "./page";

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

beforeEach(() => redirect.mockClear());

describe("/admin/transfer-logs", () => {
  it("sends old links and bookmarks to the Transfer logs tab of Transactions", () => {
    AdminTransferLogsRedirect();
    expect(redirect).toHaveBeenCalledWith("/admin/transactions?tab=transfer-logs");
  });
});
