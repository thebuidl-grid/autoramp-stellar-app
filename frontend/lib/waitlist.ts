/** What a waitlist signup does. Slugs match the backend (waitlist.constants.ts). */
export const WAITLIST_USER_TYPES = [
  { value: "crypto_native", label: "Crypto-native", hint: "I already use crypto and stablecoins" },
  { value: "freelancer", label: "Freelancer", hint: "I get paid by clients abroad" },
  { value: "cross_border", label: "Cross-border", hint: "I send or receive money across borders" },
  { value: "fintech", label: "Fintech", hint: "I build or run a payments product" },
] as const;

export type WaitlistUserType = (typeof WAITLIST_USER_TYPES)[number]["value"];

/** Label for a stored type; `unknown` is shown for signups made before types existed. */
export function userTypeLabel(value: string | null | undefined): string {
  if (!value || value === "unknown") return "Not provided";
  return WAITLIST_USER_TYPES.find((t) => t.value === value)?.label ?? value;
}

import { DEFAULT_COUNTRY, toE164 } from "./countries";

/** How often the admin waitlist page re-reads the database while it is open and visible. */
export const WAITLIST_AUTO_REFRESH_MS = 15_000;
export const AUTO_REFRESH_STORAGE_KEY = "ar_admin_waitlist_autorefresh";

/** "just now" / "12s ago" / "3m ago" / "2h ago" for the "Updated ..." indicator. */
export function timeAgo(thenMs: number, nowMs: number): string {
  if (!thenMs) return "never";
  const s = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[0-9]{7,15}$/;

export interface WaitlistForm {
  name: string;
  email: string;
  /** ISO code of the country picked in the phone selector */
  phoneCountry: string;
  /** The national part exactly as typed (no country code) */
  phoneNumber: string;
  userType: WaitlistUserType | "";
}

export const EMPTY_WAITLIST_FORM: WaitlistForm = {
  name: "",
  email: "",
  phoneCountry: DEFAULT_COUNTRY,
  phoneNumber: "",
  userType: "",
};

export type WaitlistErrors = Partial<Record<keyof WaitlistForm, string>>;

/** The full international number the API receives, e.g. "+2348012345678". */
export function composePhone(form: Pick<WaitlistForm, "phoneCountry" | "phoneNumber">): string {
  return toE164(form.phoneCountry, form.phoneNumber);
}

/** Every field is required. Returns an empty object when the form is valid. */
export function validateWaitlistForm(form: WaitlistForm): WaitlistErrors {
  const errors: WaitlistErrors = {};
  const name = form.name.trim();
  if (name.length < 2) errors.name = "Enter your name (at least 2 characters).";
  else if (name.length > 80) errors.name = "Name is too long (80 characters max).";
  if (!EMAIL_RE.test(form.email.trim())) errors.email = "Enter a valid email address.";
  if (!form.phoneNumber.trim()) errors.phoneNumber = "Enter your phone number.";
  else if (/[^0-9\s\-().+]/.test(form.phoneNumber) || !E164_RE.test(composePhone(form)))
    errors.phoneNumber = "Enter a valid phone number for the selected country.";
  if (!form.userType) errors.userType = "Choose what best describes you.";
  return errors;
}

export interface SignupOrigin {
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

/**
 * Where the visitor came from, read in the browser at submit time: the referring site's hostname
 * (ignored when it is our own site) and any utm_* tags on the URL. Missing values are omitted.
 */
export function readOrigin(
  location: Pick<Location, "search" | "hostname">,
  referrer: string,
): SignupOrigin {
  const params = new URLSearchParams(location.search);
  const clean = (v: string | null) => v?.trim().slice(0, 100) || undefined;
  let referrerHost: string | undefined;
  try {
    const host = referrer ? new URL(referrer).hostname.replace(/^www\./, "") : "";
    const own = location.hostname.replace(/^www\./, "");
    if (host && host !== own) referrerHost = host.slice(0, 255);
  } catch {
    /* malformed referrer: ignore */
  }
  const origin: SignupOrigin = {
    referrer: referrerHost,
    utmSource: clean(params.get("utm_source")),
    utmMedium: clean(params.get("utm_medium")),
    utmCampaign: clean(params.get("utm_campaign")),
  };
  return Object.fromEntries(Object.entries(origin).filter(([, v]) => v)) as SignupOrigin;
}
