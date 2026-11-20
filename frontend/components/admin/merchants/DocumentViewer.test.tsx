import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { useAuthStore } from "@/lib/store";
import { DocumentViewer } from "./DocumentViewer";

const DOC = "https://res.cloudinary.com/demo/image/upload/v1/kyc/id.png";

describe("<DocumentViewer /> (authenticated KYC documents)", () => {
  const created: string[] = [];
  const revoked: string[] = [];

  beforeEach(() => {
    created.length = 0;
    revoked.length = 0;
    URL.createObjectURL = vi.fn(() => {
      const u = `blob:test/${created.length + 1}`;
      created.push(u);
      return u;
    });
    URL.revokeObjectURL = vi.fn((u: string) => { revoked.push(u); });
    useAuthStore.setState({ token: "admin-token", user: { id: "a1", email: "a@x.co", role: "ADMIN" } as never, _hasHydrated: true });
  });
  afterEach(() => useAuthStore.setState({ token: null, user: null }));

  function proxy(status = 200) {
    const seen = { auth: null as string | null, url: null as string | null, hits: 0 };
    server.use(
      http.get("/api/docs/proxy", ({ request }) => {
        seen.hits += 1;
        seen.auth = request.headers.get("authorization");
        seen.url = new URL(request.url).searchParams.get("url");
        return status === 200
          ? HttpResponse.arrayBuffer(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer, { headers: { "content-type": "image/png" } })
          : new HttpResponse(null, { status });
      }),
    );
    return seen;
  }

  it("fetches the document with the admin token and shows it from a blob URL (an <img> cannot send headers)", async () => {
    const seen = proxy();
    render(<DocumentViewer url={DOC} label="ID card" />);

    const img = await screen.findByAltText("ID card");
    expect(img).toHaveAttribute("src", "blob:test/1");
    expect(seen.auth).toBe("Bearer admin-token");
    expect(seen.url).toBe(DOC);
    // the proxy URL itself is never put in the DOM, so there is no anonymous way to hit it from the page
    expect(document.body.innerHTML).not.toContain("/api/docs/proxy");
  });

  it("shows a clear message when the session is not authorized", async () => {
    proxy(401);
    render(<DocumentViewer url={DOC} label="ID card" />);
    expect(await screen.findByText("Failed to load preview")).toBeInTheDocument();
    expect(screen.queryByAltText("ID card")).not.toBeInTheDocument();
  });

  it("sends no Authorization header when logged out (and the proxy refuses)", async () => {
    useAuthStore.setState({ token: null, user: null });
    const seen = proxy(401);
    render(<DocumentViewer url={DOC} label="ID card" />);
    await screen.findByText("Failed to load preview");
    expect(seen.auth).toBeNull();
  });

  it("releases the blob URL when it unmounts", async () => {
    proxy();
    const { unmount } = render(<DocumentViewer url={DOC} label="ID card" />);
    await screen.findByAltText("ID card");
    unmount();
    expect(revoked).toContain("blob:test/1");
  });

  it("makes no request when there is no document", () => {
    const seen = proxy();
    render(<DocumentViewer url={null} label="ID card" />);
    expect(screen.getByText("Not uploaded")).toBeInTheDocument();
    expect(seen.hits).toBe(0);
  });
});
