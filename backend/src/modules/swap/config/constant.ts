import { Asset } from '@stellar/stellar-sdk';
import type { Corridor } from '@prisma/client';

/**
 * Stellar asset definitions.
 *
 * CNGN is AutoRamp's own issued NGN-pegged asset — AutoRamp is the Stellar
 * anchor for NGN, so CNGN_ISSUER_PUBLIC_KEY is AutoRamp's own issuing account.
 *
 * USDC_ISSUER_PUBLIC_KEY must be confirmed against Circle's official Stellar
 * USDC docs (https://developers.circle.com/stablecoins/stellar-usdc) for the
 * target network (testnet vs mainnet use different issuer accounts) before
 * use. No address is hardcoded here to avoid shipping an unverified issuer
 * that money could be sent to/from by mistake — set it explicitly via env.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required in config`);
  }
  return value;
}

export const ASSET_CODES = {
  CNGN: 'CNGN',
  USDC: 'USDC',
} as const;

export function getCngnAsset(): Asset {
  return new Asset(ASSET_CODES.CNGN, requireEnv('CNGN_ISSUER_PUBLIC_KEY'));
}

export function getUsdcAsset(): Asset {
  return new Asset(ASSET_CODES.USDC, requireEnv('USDC_ISSUER_PUBLIC_KEY'));
}

/**
 * Circle's real USDC (classic Stellar asset, same code 'USDC' but a
 * DIFFERENT issuer than getUsdcAsset() above) — deliberately kept separate
 * from the app's own hub USDC, which stays self-issued for the NGN
 * on/offramp corridor. This is the asset the XLM<->USDC swap route (see
 * SwapService.resolveAsset's 'BRIDGE_USDC' case) trades into, so a user can
 * fund a wallet with real, CCTP-bridge-compatible USDC starting from just
 * testnet XLM (Friendbot) instead of Circle's reCAPTCHA-gated USDC faucet.
 */
export function getBridgeUsdcAsset(): Asset {
  return new Asset(ASSET_CODES.USDC, requireEnv('BRIDGE_USDC_ISSUER_PUBLIC_KEY'));
}

export function getAsset(code: 'CNGN' | 'USDC'): Asset {
  return code === 'CNGN' ? getCngnAsset() : getUsdcAsset();
}

/**
 * Builds a Stellar Asset from a corridor row's own stablecoinCode/
 * stablecoinIssuer — the corridor-aware counterpart to getCngnAsset(). Each
 * new corridor (e.g. GH/GHS -> CGHS) needs no new env vars: the issuer
 * lives in the corridors table, not in code/config.
 */
export function getAssetForCorridor(corridor: Pick<Corridor, 'stablecoinCode' | 'stablecoinIssuer'>): Asset {
  return new Asset(corridor.stablecoinCode, corridor.stablecoinIssuer);
}
