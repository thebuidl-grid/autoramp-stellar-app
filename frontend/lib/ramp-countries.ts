/**
 * Fiat corridors supported by the on-ramp / off-ramp API (backend `country` param).
 * All three are available on every network (Base, BSC, Stellar).
 * Tanzania is not offered by the backend yet.
 */
export type RampCountryCode = "NG" | "GH" | "KE";

export interface RampCountry {
  code: RampCountryCode;
  name: string;
  currency: string;
  symbol: string;
  locale: string;
  /** Backend DTO minimum for both on-ramp and off-ramp `amount`, in local currency. */
  minAmount: number;
  /** Min/max digits for a bank/mobile-money account number before we try to resolve it. */
  accountMin: number;
  accountMax: number;
}

export const RAMP_COUNTRIES: Record<RampCountryCode, RampCountry> = {
  NG: { code: "NG", name: "Nigeria", currency: "NGN", symbol: "₦", locale: "en-NG", minAmount: 2000, accountMin: 10, accountMax: 10 },
  GH: { code: "GH", name: "Ghana", currency: "GHS", symbol: "GH₵", locale: "en-GH", minAmount: 2000, accountMin: 6, accountMax: 20 },
  KE: { code: "KE", name: "Kenya", currency: "KES", symbol: "KSh", locale: "en-KE", minAmount: 2000, accountMin: 6, accountMax: 20 },
};

export const RAMP_COUNTRY_LIST = Object.values(RAMP_COUNTRIES);

export function getRampCountry(code?: string | null): RampCountry {
  return RAMP_COUNTRIES[(code ?? "NG") as RampCountryCode] ?? RAMP_COUNTRIES.NG;
}

/** The country used by the API for a given network (all networks support all countries). */
export function effectiveCountry(_network: string, code?: string | null): RampCountry {
  return getRampCountry(code);
}

export function isAccountNumberComplete(country: RampCountry, accountNumber: string): boolean {
  return accountNumber.length >= country.accountMin && accountNumber.length <= country.accountMax;
}
