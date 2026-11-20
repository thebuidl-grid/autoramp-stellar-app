import { ConfigService } from '@nestjs/config';

/** Circle CCTP v2 domain ids. */
export const CCTP_DOMAIN_STELLAR = 27;
export const CCTP_DOMAIN_BASE = 6;

/** Fast transfer finality threshold (<= 1000); standard is >= 2000. */
export const CCTP_FAST_FINALITY = 1000;

/** Stellar USDC has 7 decimals, Base USDC has 6; CCTP only moves whole 6-decimal units. */
const STELLAR_DECIMALS = 7;

/**
 * Stellar off-ramps are normally served by a Bitnob payout on Stellar. When Bitnob's Stellar rail is unavailable
 * (or by choice), the payout is opened on Base instead and the user's Stellar USDC is bridged to Bitnob's Base
 * deposit address over CCTP, with our relayer paying the Base gas for the mint. On when a relayer key is set,
 * unless STELLAR_OFFRAMP_RELAY=false.
 */
export function isStellarOfframpRelayEnabled(config: ConfigService): boolean {
  const key = config.get<string>('BASE_RELAYER_PRIVATE_KEY')?.trim();
  const flag = String(
    config.get('STELLAR_OFFRAMP_RELAY') ?? 'true',
  ).toLowerCase();
  return Boolean(key) && flag !== 'false';
}

/** "12.3456789" -> 123456789n (7 dp). Rejects negatives / garbage / more than 7 decimals. */
export function decimalToUnits(
  value: string | number,
  decimals = STELLAR_DECIMALS,
): bigint {
  const s = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid decimal amount: ${s}`);
  const [whole, frac = ''] = s.split('.');
  // Extra precision is rounded UP so the user never under-sends.
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  let units = BigInt(whole + padded);
  if (frac.length > decimals && /[1-9]/.test(frac.slice(decimals))) units += 1n;
  return units;
}

export function unitsToDecimal(
  units: bigint,
  decimals = STELLAR_DECIMALS,
): string {
  const s = units.toString().padStart(decimals + 1, '0');
  return `${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
}

export interface BurnPlan {
  /** What the user burns on Stellar (7 dp units / decimal string). */
  burnAmountUnits: string;
  burnAmount: string;
  /** Fee ceiling passed to deposit_for_burn (7 dp units / decimal string). */
  maxFeeUnits: string;
  maxFee: string;
  /** Fee rate used for the plan, in basis points. */
  feeBps: number;
}

/**
 * Work out the burn so Bitnob receives AT LEAST `amountToPay` (it settles partially if it gets less):
 *   minted = burn - feeExecuted,  feeExecuted <= burn * bps / 10_000  (fast transfer, charged on the burn)
 * so burn = ceil(amountToPay / (1 - bps/10_000)), rounded up to a whole Base (6 dp) unit.
 * A 0.5 bps cushion over Circle's quoted fee absorbs small changes between planning and the burn.
 */
export function planStellarBurn(
  amountToPay: string | number,
  quotedFeeBps: number,
): BurnPlan {
  const target = decimalToUnits(amountToPay);
  if (target <= 0n) throw new Error('Amount to pay must be positive');
  const feeBps = Math.max(0, Number(quotedFeeBps) || 0) + 0.5;
  const bpsMilli = BigInt(Math.ceil(feeBps * 1000)); // bps scaled by 1e3 -> denominator 1e7
  const denom = 10_000_000n - bpsMilli;
  if (denom <= 0n) throw new Error('CCTP fee rate is out of range');
  let burn = (target * 10_000_000n + denom - 1n) / denom; // ceil
  burn = ((burn + 9n) / 10n) * 10n; // whole 6-dp units (7 dp -> multiple of 10)
  const maxFee = burn - target;
  return {
    burnAmountUnits: burn.toString(),
    burnAmount: unitsToDecimal(burn),
    maxFeeUnits: maxFee.toString(),
    maxFee: unitsToDecimal(maxFee),
    feeBps,
  };
}

export interface ParsedCctpBurnMessage {
  sourceDomain: number;
  destinationDomain: number;
  /** 0x-prefixed 32-byte nonce (key of MessageTransmitterV2.usedNonces). */
  nonce: string;
  /** Lower-cased 0x address the USDC is minted to. */
  mintRecipient: string;
  /** Burned amount in 6-dp USDC units. */
  amount: bigint;
  feeExecuted: bigint;
}

/**
 * Parse a CCTP v2 burn message (header 148 bytes, then BurnMessageV2). Used to make sure the relayer only
 * mints burns that really target the order's Bitnob deposit address.
 *   header: version(4) sourceDomain(4) destinationDomain(4) nonce(32) sender(32) recipient(32)
 *           destinationCaller(32) minFinality(4) finalityExecuted(4)
 *   body:   version(4) burnToken(32) mintRecipient(32) amount(32) messageSender(32) maxFee(32) feeExecuted(32) ...
 */
export function parseCctpV2BurnMessage(
  messageHex: string,
): ParsedCctpBurnMessage {
  const hex = messageHex.startsWith('0x') ? messageHex.slice(2) : messageHex;
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0)
    throw new Error('Malformed CCTP message');
  const b = Buffer.from(hex, 'hex');
  const HEADER = 148;
  if (b.length < HEADER + 228) throw new Error('CCTP message too short');
  const body = b.subarray(HEADER);
  return {
    sourceDomain: b.readUInt32BE(4),
    destinationDomain: b.readUInt32BE(8),
    nonce: `0x${b.subarray(12, 44).toString('hex')}`,
    mintRecipient: `0x${body.subarray(36 + 12, 68).toString('hex')}`,
    amount: BigInt(`0x${body.subarray(68, 100).toString('hex')}`),
    feeExecuted: BigInt(`0x${body.subarray(164, 196).toString('hex')}`),
  };
}
