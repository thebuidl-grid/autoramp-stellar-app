import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithClient } from "@/test/test-utils";
import WaitlistPage from "./page";

const API = "http://localhost/api";

type Fields = Partial<Record<"name" | "email" | "phone", string>>;

async function fill(overrides: Fields = {}, type: string | null = "Freelancer") {
  await userEvent.type(screen.getByLabelText("Name"), overrides.name ?? "Ada Lovelace");
  await userEvent.type(screen.getByLabelText("Email"), overrides.email ?? "ada@example.com");
  await userEvent.type(screen.getByLabelText("Phone number"), overrides.phone ?? "801 234 5678");
  if (type) await userEvent.click(screen.getByRole("radio", { name: new RegExp(type) }));
}
const submit = () => userEvent.click(screen.getByRole("button", { name: "Join the waitlist" }));
const countrySelect = () => screen.getByLabelText("Country code") as HTMLSelectElement;

function captureBody() {
  const seen: { body?: Record<string, unknown> } = {};
  server.use(
    http.post(`${API}/waitlist`, async ({ request }) => {
      seen.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ status: "success", message: "ok" });
    }),
  );
  return seen;
}

afterEach(() => window.history.replaceState({}, "", "/"));

describe("WaitlistPage", () => {
  it("offers the four 'what do you do' choices", () => {
    renderWithClient(<WaitlistPage />);
    const labels = screen.getAllByRole("radio").map((r) => r.closest("label")?.textContent ?? "");
    expect(labels).toHaveLength(4);
    for (const name of ["Crypto-native", "Freelancer", "Cross-border", "Fintech"]) {
      expect(labels.some((l) => l.includes(name))).toBe(true);
    }
  });

  it("starts on Nigeria (+234) and lets the person pick another country code", async () => {
    renderWithClient(<WaitlistPage />);
    expect(countrySelect().value).toBe("NG");
    expect(screen.getByRole("option", { name: "NG +234" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "GH +233" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "KE +254" })).toBeInTheDocument();

    await userEvent.selectOptions(countrySelect(), "GH");
    expect(countrySelect().value).toBe("GH");
    expect(screen.getByText(/Ghana \(\+233\)/)).toBeInTheDocument();
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

  it("sends the full international number built from the chosen country code", async () => {
    const seen = captureBody();
    renderWithClient(<WaitlistPage />);

    await userEvent.selectOptions(countrySelect(), "GH");
    await fill({ name: "  Ada Lovelace ", email: " ada@example.com ", phone: "024 123 4567" }, "Cross-border");
    await submit();

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("on the list"));
    expect(seen.body).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
      phoneNumber: "+233241234567", // leading 0 dropped, +233 added
      phoneCountry: "GH",
      userType: "cross_border",
      source: "waitlist-page",
    });
  });

  it("switches country when a full +international number is pasted", async () => {
    const seen = captureBody();
    renderWithClient(<WaitlistPage />);

    await userEvent.type(screen.getByLabelText("Name"), "Wanjiru Kamau");
    await userEvent.type(screen.getByLabelText("Email"), "w@example.com");
    await userEvent.click(screen.getByLabelText("Phone number"));
    await userEvent.paste("+254 712 345 678");
    expect(countrySelect().value).toBe("KE");
    expect((screen.getByLabelText("Phone number") as HTMLInputElement).value).toBe("712345678");

    await userEvent.click(screen.getByRole("radio", { name: /Fintech/ }));
    await submit();

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(seen.body).toMatchObject({ phoneNumber: "+254712345678", phoneCountry: "KE" });
  });

  it("sends where the visitor came from (utm tags and referring site)", async () => {
    const seen = captureBody();
    window.history.replaceState({}, "", "/waitlist?utm_source=twitter&utm_medium=social&utm_campaign=launch");
    Object.defineProperty(document, "referrer", { value: "https://t.co/abc", configurable: true });
    renderWithClient(<WaitlistPage />);

    await fill();
    await submit();

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(seen.body).toMatchObject({
      referrer: "t.co",
      utmSource: "twitter",
      utmMedium: "social",
      utmCampaign: "launch",
    });
    Object.defineProperty(document, "referrer", { value: "", configurable: true });
  });

  it("omits origin fields for a direct visit", async () => {
    const seen = captureBody();
    renderWithClient(<WaitlistPage />);

    await fill();
    await submit();

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    for (const key of ["referrer", "utmSource", "utmMedium", "utmCampaign"]) {
      expect(seen.body).not.toHaveProperty(key);
    }
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
