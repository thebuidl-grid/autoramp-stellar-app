/** Countries offered in the phone-number picker: ISO 3166-1 alpha-2, name and international dial code. */
export interface Country {
  iso: string;
  name: string;
  dial: string; // digits only, no "+"
}

export const COUNTRIES: Country[] = [
  // Africa first: Autoramp's core market
  { iso: "NG", name: "Nigeria", dial: "234" },
  { iso: "GH", name: "Ghana", dial: "233" },
  { iso: "KE", name: "Kenya", dial: "254" },
  { iso: "ZA", name: "South Africa", dial: "27" },
  { iso: "EG", name: "Egypt", dial: "20" },
  { iso: "TZ", name: "Tanzania", dial: "255" },
  { iso: "UG", name: "Uganda", dial: "256" },
  { iso: "RW", name: "Rwanda", dial: "250" },
  { iso: "ET", name: "Ethiopia", dial: "251" },
  { iso: "SN", name: "Senegal", dial: "221" },
  { iso: "CI", name: "Côte d'Ivoire", dial: "225" },
  { iso: "CM", name: "Cameroon", dial: "237" },
  { iso: "BJ", name: "Benin", dial: "229" },
  { iso: "TG", name: "Togo", dial: "228" },
  { iso: "ML", name: "Mali", dial: "223" },
  { iso: "BF", name: "Burkina Faso", dial: "226" },
  { iso: "NE", name: "Niger", dial: "227" },
  { iso: "GN", name: "Guinea", dial: "224" },
  { iso: "SL", name: "Sierra Leone", dial: "232" },
  { iso: "LR", name: "Liberia", dial: "231" },
  { iso: "GM", name: "Gambia", dial: "220" },
  { iso: "MA", name: "Morocco", dial: "212" },
  { iso: "DZ", name: "Algeria", dial: "213" },
  { iso: "TN", name: "Tunisia", dial: "216" },
  { iso: "ZM", name: "Zambia", dial: "260" },
  { iso: "ZW", name: "Zimbabwe", dial: "263" },
  { iso: "MW", name: "Malawi", dial: "265" },
  { iso: "MZ", name: "Mozambique", dial: "258" },
  { iso: "AO", name: "Angola", dial: "244" },
  { iso: "BW", name: "Botswana", dial: "267" },
  { iso: "NA", name: "Namibia", dial: "264" },
  { iso: "MU", name: "Mauritius", dial: "230" },
  { iso: "CD", name: "DR Congo", dial: "243" },
  // Rest of the world
  { iso: "US", name: "United States", dial: "1" },
  { iso: "CA", name: "Canada", dial: "1" },
  { iso: "GB", name: "United Kingdom", dial: "44" },
  { iso: "IE", name: "Ireland", dial: "353" },
  { iso: "DE", name: "Germany", dial: "49" },
  { iso: "FR", name: "France", dial: "33" },
  { iso: "ES", name: "Spain", dial: "34" },
  { iso: "IT", name: "Italy", dial: "39" },
  { iso: "NL", name: "Netherlands", dial: "31" },
  { iso: "PT", name: "Portugal", dial: "351" },
  { iso: "CH", name: "Switzerland", dial: "41" },
  { iso: "SE", name: "Sweden", dial: "46" },
  { iso: "AE", name: "United Arab Emirates", dial: "971" },
  { iso: "SA", name: "Saudi Arabia", dial: "966" },
  { iso: "TR", name: "Türkiye", dial: "90" },
  { iso: "IN", name: "India", dial: "91" },
  { iso: "PK", name: "Pakistan", dial: "92" },
  { iso: "BD", name: "Bangladesh", dial: "880" },
  { iso: "PH", name: "Philippines", dial: "63" },
  { iso: "ID", name: "Indonesia", dial: "62" },
  { iso: "SG", name: "Singapore", dial: "65" },
  { iso: "CN", name: "China", dial: "86" },
  { iso: "JP", name: "Japan", dial: "81" },
  { iso: "AU", name: "Australia", dial: "61" },
  { iso: "NZ", name: "New Zealand", dial: "64" },
  { iso: "BR", name: "Brazil", dial: "55" },
  { iso: "MX", name: "Mexico", dial: "52" },
  { iso: "CO", name: "Colombia", dial: "57" },
  { iso: "AR", name: "Argentina", dial: "54" },
];

export const DEFAULT_COUNTRY = "NG";

export function findCountry(iso: string | null | undefined): Country | undefined {
  return iso ? COUNTRIES.find((c) => c.iso === iso.toUpperCase()) : undefined;
}

/** Display name for an ISO code; falls back to Intl, then to the code itself. */
export function countryName(iso: string | null | undefined): string {
  if (!iso || iso === "unknown") return "Unknown";
  const known = findCountry(iso)?.name;
  if (known) return known;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(iso.toUpperCase()) ?? iso;
  } catch {
    return iso;
  }
}

/**
 * If `value` starts with "+" followed by a known dial code, returns that country and the rest.
 * Longest dial code wins ("+234..." is Nigeria, not "+2"). `preferIso` breaks ties for shared
 * codes (+1 is US/CA), so pasting "+1 555..." keeps the country already selected.
 */
export function detectFromInternational(
  value: string,
  preferIso?: string,
): { country: Country; national: string } | null {
  const compact = value.replace(/[\s\-().]/g, "");
  if (!compact.startsWith("+")) return null;
  const digits = compact.slice(1);
  const matches = COUNTRIES.filter((c) => digits.startsWith(c.dial));
  if (matches.length === 0) return null;
  const longest = Math.max(...matches.map((c) => c.dial.length));
  const best = matches.filter((c) => c.dial.length === longest);
  const country = best.find((c) => c.iso === preferIso) ?? best[0];
  return { country, national: digits.slice(country.dial.length) };
}

/** Country + what the person typed -> E.164 ("+2348012345678"). A leading trunk "0" is dropped. */
export function toE164(iso: string, typed: string): string {
  const country = findCountry(iso);
  if (!country) return "";
  const digits = typed.replace(/[^0-9]/g, "").replace(/^0+/, "");
  return digits ? `+${country.dial}${digits}` : "";
}
