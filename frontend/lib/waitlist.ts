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

/** "+234 (801) 234-5678" -> "+2348012345678". Mirrors the backend normalisation. */
export function normalizePhone(value: string): string {
  return value.replace(/[\s\-().]/g, "");
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

export interface WaitlistForm {
  name: string;
  email: string;
  phoneNumber: string;
  userType: WaitlistUserType | "";
}

export type WaitlistErrors = Partial<Record<keyof WaitlistForm, string>>;

/** Every field is required. Returns an empty object when the form is valid. */
export function validateWaitlistForm(form: WaitlistForm): WaitlistErrors {
  const errors: WaitlistErrors = {};
  const name = form.name.trim();
  if (name.length < 2) errors.name = "Enter your name (at least 2 characters).";
  else if (name.length > 80) errors.name = "Name is too long (80 characters max).";
  if (!EMAIL_RE.test(form.email.trim())) errors.email = "Enter a valid email address.";
  if (!form.phoneNumber.trim()) errors.phoneNumber = "Enter your phone number.";
  else if (!PHONE_RE.test(normalizePhone(form.phoneNumber)))
    errors.phoneNumber = "Enter a valid phone number (7-15 digits, you can start with +).";
  if (!form.userType) errors.userType = "Choose what best describes you.";
  return errors;
}
