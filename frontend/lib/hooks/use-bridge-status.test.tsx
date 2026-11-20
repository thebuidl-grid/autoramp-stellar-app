import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import { useBridgeStatus } from "./use-bridge";

function Probe({ reference }: { reference: string }) {
  const q = useBridgeStatus(reference);
  return <p>{q.isError ? "error" : q.data ? "ok" : "loading"}</p>;
}

describe("useBridgeStatus", () => {
  it("does not retry straight away when it is rate limited (the next poll is the retry)", async () => {
    let calls = 0;
    server.use(http.get(/\/bridge\/status\//, () => (calls++, HttpResponse.json({ message: "Rate limit exceeded" }, { status: 429 }))));
    renderWithClient(<Probe reference="BRG-1" />);
    await waitFor(() => expect(screen.getByText("error")).toBeInTheDocument(), { timeout: 3000 });
    expect(calls).toBe(1);
  });

  it("still retries an ordinary failure", async () => {
    let calls = 0;
    server.use(http.get(/\/bridge\/status\//, () => (calls++, HttpResponse.json({ message: "boom" }, { status: 500 }))));
    renderWithClient(<Probe reference="BRG-2" />);
    await waitFor(() => expect(calls).toBeGreaterThan(1), { timeout: 5000 });
  });
});
