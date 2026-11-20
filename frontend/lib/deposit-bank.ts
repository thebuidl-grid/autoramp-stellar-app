export const DEFAULT_DEPOSIT_BANK_NAME = "Safe Haven Microfinance Bank";

/**
 * Bank name to show on the "pay into this account" screen. The NGN deposit accounts are SafeHaven virtual
 * accounts whose API response carries no bank name, so fall back to SafeHaven rather than render a blank row.
 */
export function depositBankName(account?: { bankName?: string | null } | null): string {
  const name = typeof account?.bankName === "string" ? account.bankName.trim() : "";
  return name || DEFAULT_DEPOSIT_BANK_NAME;
}
