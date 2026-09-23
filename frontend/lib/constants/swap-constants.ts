/**
 * Swap Constants
 *
 * Token decimal precision for display/parsing on Stellar. Asset codes and
 * issuers live on the backend (see backend/src/modules/swap/config/constant.ts)
 * and are returned as part of quote/swap API responses — the frontend
 * shouldn't hardcode issuer addresses.
 */
export const SWAP_CONSTANTS = {
  USDC_DECIMALS: 7,
  CNGN_DECIMALS: 7,
} as const;
