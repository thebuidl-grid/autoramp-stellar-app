import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { resolveCountry } from '../bitnob/bitnob-countries';
import { ConfigService } from '@nestjs/config';
import { BitNobService, deepPick } from '../bitnob/bitnob.service';
import { isStellarOfframpRelayEnabled } from '../ramp/cctp-stellar-relay.util';

export type RateDirection = 'onramp' | 'offramp';
export const RATE_NETWORKS = ['base', 'bsc', 'stellar'] as const;
export type RateNetwork = (typeof RATE_NETWORKS)[number];

export interface ChainRate {
  rate: number;
  network: RateNetwork;
  direction: RateDirection;
  source: 'bitnob';
  country: string;
  currency: string;
}

// Bitnob's chain identifiers for each supported network.
const BITNOB_CHAIN: Record<RateNetwork, string> = {
  base: 'BASE',
  bsc: 'BSC',
  stellar: 'STELLAR',
};

// Quote size used to read the rate (NGN). Above the 2,000 NGN payout minimum.
const PROBE_NGN = 2000;

const positive = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Pull a USD/NGN rate out of a Bitnob payout quote, whichever shape it has.
 *
 * Current shape: `data.payout.exchange_rate = { rate, effective_rate, ... }` plus `amount` (USDC
 * owed) and `settlement_amount` (NGN). The effective rate is what a customer really gets per USDC,
 * so it wins over the market `rate`. Older shapes (a plain `exchange_rate` / `rate` number, or just
 * the USDC amount to pay) are still understood.
 */
export function extractBitnobRate(quote: unknown): number | undefined {
  const exchangeRate = deepPick(
    [quote as any],
    ['exchange_rate', 'exchangeRate'],
  );
  const fromObject =
    exchangeRate && typeof exchangeRate === 'object'
      ? (positive(exchangeRate.effective_rate) ??
        positive(exchangeRate.effectiveRate) ??
        positive(exchangeRate.rate))
      : positive(exchangeRate);
  const direct =
    fromObject ?? positive(deepPick([quote as any], ['rate', 'price']));
  if (direct) return direct;

  const usdc = positive(
    deepPick(
      [quote as any],
      [
        'amount_to_pay',
        'source_amount',
        'from_amount',
        'crypto_amount',
        'deposit_amount',
        'total_amount',
        'amount',
      ],
    ),
  );
  if (!usdc) return undefined;
  // NGN settled / USDC owed, when the quote says how much NGN it covers; else the probe amount.
  const ngn = positive(deepPick([quote as any], ['settlement_amount']));
  return (ngn ?? PROBE_NGN) / usdc;
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

  constructor(
    private readonly bitnob: BitNobService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  /** Stellar off-ramps run over CCTP to a Base payout while the relay is on, so the rate comes from a Base quote. */
  private payoutChain(network: RateNetwork): string {
    return network === 'stellar' && this.config && isStellarOfframpRelayEnabled(this.config)
      ? BITNOB_CHAIN.base
      : BITNOB_CHAIN[network];
  }

  async getRate(
    network: RateNetwork,
    direction: RateDirection,
    countryCode?: string,
  ): Promise<ChainRate> {
    const country = resolveCountry(countryCode);
    const key = `${network}:${country.code}`;
    const hit = this.cache.get(key);
    const meta = { country: country.code, currency: country.currency };
    if (hit && Date.now() - hit.at < ChainRateService.TTL_MS) {
      return { rate: hit.rate, network, direction, source: 'bitnob', ...meta };
    }
    try {
      const quote = await this.bitnob.createPayoutQuote({
        fromAsset: 'USDC',
        toCurrency: country.currency,
        country: country.code,
        source: 'onchain',
        settlementAmount: PROBE_NGN,
        reference: `rate-${network}-${Date.now()}`,
        chain: this.payoutChain(network),
      });
      const rate = extractBitnobRate(quote);
      if (!rate) {
        this.logger.warn(`Bitnob quote for ${network} had no usable rate`);
        throw new Error('Bitnob returned no usable rate');
      }
      this.cache.set(key, { rate, at: Date.now() });
      return { rate, network, direction, source: 'bitnob', ...meta };
    } catch (error: any) {
      this.logger.warn(`Bitnob rate for ${network} failed: ${error?.message}`);
      throw new ServiceUnavailableException(
        'Rate temporarily unavailable from the payout provider. Please retry.',
      );
    }
  }
}
