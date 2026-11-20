export interface SetupInput {
  onboarding: "VERIFIED" | "PENDING" | "REJECTED" | null | undefined;
  hasMerchantRecord: boolean | undefined;
  hasBankAccount: boolean | undefined;
  apiKeyCount: number | undefined;
}

export interface SetupStep {
  key: "business" | "bank" | "keys";
  title: string;
  hint: string;
  href: string;
  done: boolean;
}

/** What is left before the account is fully set up. Unknown (still loading) counts as not done only once the data is in. */
export function setupSteps(i: SetupInput): SetupStep[] {
  const verified = i.onboarding === "VERIFIED";
  return [
    {
      key: "business",
      title: "Verify your business",
      hint: i.onboarding === "PENDING" ? "Under review. We'll email you when it's done." : i.onboarding === "REJECTED" ? "We couldn't verify your details. Update them and resubmit." : "Tell us about your business so you can accept payments.",
      href: "/merchant/onboardingkkn",
      done: verified,
    },
    { key: "bank", title: "Open your business account", hint: "The account your balance is held in.", href: "/merchant/dashboard/bank", done: !!i.hasBankAccount },
    { key: "keys", title: "Create an API key", hint: "Needed to take payments from your own app.", href: "/merchant/dashboard/api-keys", done: (i.apiKeyCount ?? 0) > 0 },
  ];
}

export const remainingSteps = (steps: SetupStep[]) => steps.filter((s) => !s.done);
