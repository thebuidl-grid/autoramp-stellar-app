/**
 * Generate transaction reference
 * 
 * Generates a unique transaction reference in the format: txn_ref_xxxxxxxx
 * 
 * @param length - Length of the random string (default: 16)
 * @returns Transaction reference string
 */
export function generateTrxReference(length = 16): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `txn_ref_${result}`;
}
