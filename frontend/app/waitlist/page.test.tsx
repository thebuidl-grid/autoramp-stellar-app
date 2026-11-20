import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import WaitlistPage from "./page";

const API = "http://localhost/api";

async function fill(overrides: Partial<Record<"name" | "email" | "phone", string>> = {}, type: string | null = "Freelancer") {
  await userEvent.type(screen.getByLabelText("Name"), overrides.name ?? "Ada Lovelace");
  await userEvent.type(screen.getByLabelText("Email"), overrides.email ?? "ada@example.com");
  await userEvent.type(screen.getByLabelText("Phone number"), overrides.phone ?? "+234 801 234 5678");
  if (type) await userEvent.click(screen.getByRole("radio", { name: new RegExp(type) }));
}
const submit = () => userEvent.click(screen.getByRole("button", { name: "Join the waitlist" }));

describe("WaitlistPage", () => {
  it("offers the four 'what do you do' choices", () => {
    renderWithClient(<WaitlistPage />);
    const labels = screen.getAllByRole("radio").map((r) => r.closest("label")?.textContent ?? "");
    expect(labels).toHaveLength(4);
    for (const name of ["Crypto-native", "Freelancer", "Cross-border", "Fintech"]) {
      expect(labels.some((l) => l.includes(name))).toBe(true);
    }
  });

  it("requires every field and calls the API for none of them when empty", async () => {
    let called = false;
    server.use(http.post(`${API}/waitlist`, () => { called = true; return HttpResponse.json({}); }));
    renderWithClient(<WaitlistPage />);

    await submit();

    const alerts = (await screen.findAllByRole("alert")).map((a) => a.textContent);
    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.stringContaining("name"),
        expect.stringContaining("valid email"),
        expect.stringContaining("phone number"),
        expect.stringContaining("what best describes you"),
      ]),
    );
    expect(called).toBe(false);
  });

  it.each([
    ["a missing phone number", { phone: " " }, "Freelancer", "phone number"],
    ["an invalid phone number", { phone: "12ab" }, "Freelancer", "valid phone"],
    ["a missing type", {}, null, "what best describes you"],
    ["an invalid email", { email: "nope" }, "Fintech", "valid email"],
  ])("does not submit with %s", async (_l, overrides, type, message) => {
    let called = false;
    server.use(http.post(`${API}/waitlist`, () => { called = true; return HttpResponse.json({}); }));
    renderWithClient(<WaitlistPage />);

    await fill(overrides, type);
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(called).toBe(false);
  });

  it("clears a field's error once the person edits it", async () => {
    renderWithClient(<WaitlistPage />);
    await submit();
    expect(await screen.findByText(/Enter your name/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Name"), "Ad");
    expect(screen.queryByText(/Enter your name/)).not.toBeInTheDocument();
  });

  it("submits trimmed, normalised details and shows the confirmation", async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/waitlist`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ status: "success", message: "ok" });
      }),
    );
    renderWithClient(<WaitlistPage />);

    await fill({ name: "  Ada Lovelace ", email: " ada@example.com ", phone: "+234 (801) 234-5678" }, "Cross-border");
    await submit();

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("on the list"));
    expect(body).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      phoneNumber: "+2348012345678",
      userType: "cross_border",
      source: "waitlist-page",
    });
  });

  it("shows a rate-limit message on 429 and a details message on 400", async () => {
    server.use(http.post(`${API}/waitlist`, () => HttpResponse.json({}, { status: 429 })));
    renderWithClient(<WaitlistPage />);
    await fill();
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");

    server.use(http.post(`${API}/waitlist`, () => HttpResponse.json({}, { status: 400 })));
    await submit();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("check your details"));
  });
});
