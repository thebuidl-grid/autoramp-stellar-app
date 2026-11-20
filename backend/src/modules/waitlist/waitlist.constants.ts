/** What a waitlist signup does. Stored as the slug; shown to people with the label. */
export const WAITLIST_USER_TYPES = [
  'crypto_native',
  'freelancer',
  'cross_border',
  'fintech',
] as const;

export type WaitlistUserType = (typeof WAITLIST_USER_TYPES)[number];

export const WAITLIST_USER_TYPE_LABELS: Record<WaitlistUserType, string> = {
  crypto_native: 'Crypto-native',
  freelancer: 'Freelancer',
  cross_border: 'Cross-border',
  fintech: 'Fintech',
};
