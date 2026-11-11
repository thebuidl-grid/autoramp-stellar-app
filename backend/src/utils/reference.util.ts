/**
 * Generate transaction reference
 *
 * Generates a unique transaction reference with a typed prefix:
 *   onr_  - onramp (fiat -> crypto)
 *   off_  - offramp (crypto -> fiat)
 *   swp_  - swap (token -> token)
 *   bnk_  - bank transfer
 *   vas_  - value-added services (airtime, data, cable, utility)
 *   otc_  - OTC trades
 *   txn_  - generic / legacy (default)
 *
 * @param length - Length of the random string (default: 16)
 * @param prefix - Optional prefix override (e.g. 'onr', 'off'). If null, uses 'txn'
 * @returns Transaction reference string
 */
export function generateTrxReference(
  length = 16,
  prefix: string | null = null,
): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `${prefix || 'txn'}_${result}`;
}
