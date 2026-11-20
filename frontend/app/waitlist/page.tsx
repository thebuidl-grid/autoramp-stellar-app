"use client";

import { useState } from "react";
import { isAxiosError } from "axios";
import { CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { HeroBackground } from "@/components/hero/hero-background";
import { waitlistApi } from "@/lib/api";
import { COUNTRIES, detectFromInternational, findCountry } from "@/lib/countries";
import {
  EMPTY_WAITLIST_FORM,
  WAITLIST_USER_TYPES,
  composePhone,
  readOrigin,
  validateWaitlistForm,
  type WaitlistErrors,
  type WaitlistForm,
} from "@/lib/waitlist";

export default function WaitlistPage() {
  const [form, setForm] = useState<WaitlistForm>(EMPTY_WAITLIST_FORM);
  const [errors, setErrors] = useState<WaitlistErrors>({});
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof WaitlistForm>(key: K, value: WaitlistForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear a field's error as soon as the person edits it.
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  /** Typing is kept as-is, but pasting a full "+234 801 ..." number switches the country for you. */
  function onPhoneChange(value: string) {
    const detected = detectFromInternational(value, form.phoneCountry);
    if (detected) {
      setForm((f) => ({ ...f, phoneCountry: detected.country.iso, phoneNumber: detected.national }));
    } else {
      set("phoneNumber", value);
    }
    setErrors((e) => (e.phoneNumber ? { ...e, phoneNumber: undefined } : e));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validateWaitlistForm(form);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setStatus("loading");
    try {
      await waitlistApi.join({
        name: form.name.trim(),
        email: form.email.trim(),
        phoneNumber: composePhone(form),
        phoneCountry: form.phoneCountry,
        userType: form.userType,
        ...readOrigin(window.location, document.referrer),
        source: "waitlist-page",
      });
      setStatus("done");
    } catch (err) {
      setStatus("idle");
      const code = isAxiosError(err) ? err.response?.status : undefined;
      setFormError(
        code === 429
          ? "Too many attempts. Please wait a minute and try again."
          : code === 400
            ? "Please check your details and try again."
            : "Something went wrong. Please try again.",
      );
    }
  }

  const busy = status === "loading";

  return (
    <main className="relative min-h-dvh flex items-center justify-center px-4 py-10 overflow-x-hidden bg-background">
      <HeroBackground />
      <Card className="relative z-10 w-full max-w-md">
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Join the Autoramp waitlist</h1>
            <p className="text-muted-foreground">
              Be first in line for on/off-ramps and swaps across Africa. We&apos;ll reach out when
              your spot opens up.
            </p>
          </div>

          {status === "done" ? (
            <div role="status" className="flex flex-col items-center gap-2 text-center py-4">
              <CheckCircle className="h-10 w-10 text-green-500" />
              <p className="font-medium">You&apos;re on the list.</p>
              <p className="text-sm text-muted-foreground">We&apos;ll be in touch soon.</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <Field id="wl-name" label="Name" error={errors.name}>
                <Input
                  id="wl-name"
                  autoComplete="name"
                  placeholder="Ada Lovelace"
                  className="h-11 text-base"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  disabled={busy}
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "wl-name-error" : undefined}
                />
              </Field>

              <Field id="wl-email" label="Email" error={errors.email}>
                <Input
                  id="wl-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="h-11 text-base"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  disabled={busy}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "wl-email-error" : undefined}
                />
              </Field>

              <Field id="wl-phone" label="Phone number" error={errors.phoneNumber}>
                <div className="flex gap-2">
                  <select
                    aria-label="Country code"
                    className="h-11 w-[8.5rem] shrink-0 rounded-md border border-input bg-background px-2 text-base"
                    value={form.phoneCountry}
                    onChange={(e) => set("phoneCountry", e.target.value)}
                    disabled={busy}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.iso} value={c.iso}>
                        {c.iso} +{c.dial}
                      </option>
                    ))}
                  </select>
                  <Input
                    id="wl-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="801 234 5678"
                    className="h-11 min-w-0 flex-1 text-base"
                    value={form.phoneNumber}
                    onChange={(e) => onPhoneChange(e.target.value)}
                    disabled={busy}
                    aria-invalid={!!errors.phoneNumber}
                    aria-describedby={errors.phoneNumber ? "wl-phone-error" : "wl-phone-hint"}
                  />
                </div>
                <p id="wl-phone-hint" className="text-xs text-muted-foreground">
                  {findCountry(form.phoneCountry)?.name} (+{findCountry(form.phoneCountry)?.dial}). You can also
                  paste the full number starting with +.
                </p>
              </Field>

              <fieldset className="space-y-2" disabled={busy}>
                <legend className="text-sm font-medium mb-2">What do you do?</legend>
                <div className="grid gap-2 min-[420px]:grid-cols-2" role="radiogroup" aria-label="What do you do?">
                  {WAITLIST_USER_TYPES.map((t) => {
                    const selected = form.userType === t.value;
                    return (
                      <label
                        key={t.value}
                        className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary ${
                          selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="userType"
                          value={t.value}
                          checked={selected}
                          onChange={() => set("userType", t.value)}
                          className="sr-only"
                        />
                        <span className="text-sm font-medium">{t.label}</span>
                        <span className="text-xs text-muted-foreground">{t.hint}</span>
                      </label>
                    );
                  })}
                </div>
                {errors.userType && (
                  <p id="wl-type-error" role="alert" className="text-sm text-red-500">
                    {errors.userType}
                  </p>
                )}
              </fieldset>

              {formError && (
                <p role="alert" className="text-sm text-red-500">
                  {formError}
                </p>
              )}
              <Button type="submit" className="w-full h-11" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join the waitlist"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
