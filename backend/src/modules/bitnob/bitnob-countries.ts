import { BadRequestException } from '@nestjs/common';

export type BitnobCountryCode = 'NG' | 'GH' | 'KE';

export interface BitnobCountryConfig {
  /** ISO 3166-1 alpha-2, as Bitnob payout/bank endpoints expect. */
  code: BitnobCountryCode;
  /** ISO 3166-1 alpha-3, as Bitnob customer KYC expects. */
  iso3: string;
  name: string;
  currency: string;
  dialCode: string;
  /** Sandbox-only synthetic KYC id type. */
  idType: string;
  /** Local-currency deposit bounds accepted by the on-ramp trading pipeline. */
  minDeposit: number;
  maxDeposit: number;
  /** Minor units per major unit (kobo, pesewas, cents all = 100). */
  minorUnits: number;
}

export const DEFAULT_COUNTRY: BitnobCountryCode = 'NG';

export const BITNOB_COUNTRIES: Record<BitnobCountryCode, BitnobCountryConfig> =
  {
    NG: {
      code: 'NG',
      iso3: 'NGA',
      name: 'Nigeria',
      currency: 'NGN',
      dialCode: '+234',
      idType: 'bvn',
      minDeposit: 500,
      maxDeposit: 10_000_000,
      minorUnits: 100,
    },
    GH: {
      code: 'GH',
      iso3: 'GHA',
      name: 'Ghana',
      currency: 'GHS',
      dialCode: '+233',
      idType: 'ghana_card',
      minDeposit: 10,
      maxDeposit: 500_000,
      minorUnits: 100,
    },
    KE: {
      code: 'KE',
      iso3: 'KEN',
      name: 'Kenya',
      currency: 'KES',
      dialCode: '+254',
      idType: 'national_id',
      minDeposit: 100,
      maxDeposit: 5_000_000,
      minorUnits: 100,
    },
  };

export const SUPPORTED_COUNTRY_CODES = Object.keys(
  BITNOB_COUNTRIES,
) as BitnobCountryCode[];

/** Resolve a country code (default NG). Throws 400 for unsupported countries. */
export function resolveCountry(code?: string | null): BitnobCountryConfig {
  const key = (code || DEFAULT_COUNTRY).trim().toUpperCase();
  const cfg = BITNOB_COUNTRIES[key as BitnobCountryCode];
  if (!cfg) {
    throw new BadRequestException(
      `Unsupported country '${code}'. Supported: ${SUPPORTED_COUNTRY_CODES.join(', ')}`,
    );
  }
  return cfg;
}

/**
 * Stable per-country virtual account reference. Nigeria keeps the legacy
 * reference so existing accounts are untouched.
 */
export function virtualAccountReference(
  base: string,
  country: BitnobCountryCode,
): string {
  return country === DEFAULT_COUNTRY ? base : `${base}_${country}`;
}

export function countryFromVirtualAccountReference(
  reference?: string | null,
): BitnobCountryConfig {
  const suffix = reference?.match(/_([A-Z]{2})$/)?.[1];
  return (
    BITNOB_COUNTRIES[suffix as BitnobCountryCode] ??
    BITNOB_COUNTRIES[DEFAULT_COUNTRY]
  );
}
