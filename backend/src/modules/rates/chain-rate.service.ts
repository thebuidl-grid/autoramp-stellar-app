import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BitNobService, deepPick } from '../bitnob/bitnob.service';

export type RateDirection = 'onramp' | 'offramp';
export const RATE_NETWORKS = ['base', 'bsc', 'stellar'] as const;
export type RateNetwork = (typeof RATE_NETWORKS)[number];

export interface ChainRate {
  rate: number;
  network: RateNetwork;
  direction: RateDirection;
  source: 'bitnob';
}

// Bitnob's chain identifiers for each supported network.
const BITNOB_CHAIN: Record<RateNetwork, string> = {
  base: 'BASE',
  bsc: 'BSC',
  stellar: 'STELLAR',
};

// Quote size used to read the rate (NGN). Above the 2,000 NGN payout minimum.
const PROBE_NGN = 2000;

/** Pull a USD/NGN rate out of a Bitnob payout quote, whichever field it carries. */
export function extractBitnobRate(quote: unknown): number | undefined {
  const direct = Number(
    deepPick(
      [quote as any],
      ['exchange_rate', 'exchangeRate', 'rate', 'price'],
    ),
  );
  if (Number.isFinite(direct) && direct > 0) return direct;
  const usdc = Number(
    deepPick(
      [quote as any],
      [
        'amount_to_pay',
        'source_amount',
        'from_amount',
        'crypto_amount',
        'deposit_amount',
      ],
    ),
  );
  if (Number.isFinite(usdc) && usdc > 0) return PROBE_NGN / usdc;
  return undefined;
}

/**
 * USD/NGN rate for a chain, fetched from Bitnob (the provider that actually pays out).
 * Bitnob is the only source: no on-chain/RPC lookup, so a dead RPC can never break rates.
 * Results are cached briefly per network so a page of quotes does not create a payout quote per keystroke.
 */
@Injectable()
export class ChainRateService {
  private readonly logger = new Logger(ChainRateService.name);
  private readonly cache = new Map<string, { rate: number; at: number }>();
  private static readonly TTL_MS = 30_000;

  constructor(private readonly bitnob: BitNobService) {}

  async getRate(
    network: RateNetwork,
    direction: RateDirection,
  ): Promise<ChainRate> {
    const hit = this.cache.get(network);
    if (hit && Date.now() - hit.at < ChainRateService.TTL_MS) {
      return { rate: hit.rate, network, direction, source: 'bitnob' };
    }
    try {
      const quote = await this.bitnob.createPayoutQuote({
        fromAsset: 'USDC',
        toCurrency: 'NGN',
        country: 'NG',
        source: 'onchain',
        settlementAmount: PROBE_NGN,
        reference: `rate-${network}-${Date.now()}`,
        chain: BITNOB_CHAIN[network],
      });
      const rate = extractBitnobRate(quote);
      if (!rate) {
        this.logger.warn(`Bitnob quote for ${network} had no usable rate`);
        throw new Error('Bitnob returned no usable rate');
      }
      this.cache.set(network, { rate, at: Date.now() });
      return { rate, network, direction, source: 'bitnob' };
    } catch (error: any) {
      this.logger.warn(`Bitnob rate for ${network} failed: ${error?.message}`);
      throw new ServiceUnavailableException(
        'Rate temporarily unavailable from the payout provider. Please retry.',
      );
    }
  }
}
