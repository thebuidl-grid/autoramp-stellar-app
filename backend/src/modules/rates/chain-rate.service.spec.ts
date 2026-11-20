import { ChainRateService, extractBitnobRate } from './chain-rate.service';

/** A real POST /api/payouts/quotes response from Bitnob (ids and timestamps shortened). */
export const BITNOB_QUOTE_RESPONSE = {
  success: true,
  message: 'Quote created successfully',
  data: {
    payout: {
      id: '01a1d56d-556b-76f9-b1e5-08f84b4f378d',
      quote_id: 'QT2_21878422',
      status: 'QUOTE',
      source: 'ONCHAIN',
      from_asset: 'USDC',
      chain: 'CHAIN_TYPE_BASE',
      to_currency: 'NGN',
      amount: '1.424498',
      settlement_amount: '2000',
      fees: '0',
      total_amount: '1.424498',
      exchange_rate: {
        rate: '1408.2279',
        btc_rate: '68986.05',
        currency: 'ngn',
        effective_rate: '1404.0033752241140388',
      },
      reference: 'probe-1',
    },
  },
};

describe('extractBitnobRate', () => {
  it('reads an explicit rate field', () => {
    expect(extractBitnobRate({ data: { exchange_rate: '1580.5' } })).toBe(
      1580.5,
    );
  });
  it('derives the rate from the USDC amount when no rate field exists', () => {
    expect(extractBitnobRate({ data: { amount_to_pay: '1.25' } })).toBe(1600);
  });
  it('returns undefined when nothing usable is present', () => {
    expect(extractBitnobRate({ data: {} })).toBeUndefined();
  });

  describe("Bitnob's current nested response (data.payout.exchange_rate.{rate,effective_rate})", () => {
    it('uses the effective rate: what a customer actually gets per USDC', () => {
      expect(extractBitnobRate(BITNOB_QUOTE_RESPONSE)).toBeCloseTo(
        1404.00337,
        4,
      );
    });

    it('falls back to the market rate when there is no effective rate', () => {
      const q = JSON.parse(JSON.stringify(BITNOB_QUOTE_RESPONSE));
      delete q.data.payout.exchange_rate.effective_rate;
      expect(extractBitnobRate(q)).toBeCloseTo(1408.2279, 4);
    });

    it('derives NGN per USDC from settlement_amount / amount when the rate object is missing', () => {
      const q = JSON.parse(JSON.stringify(BITNOB_QUOTE_RESPONSE));
      delete q.data.payout.exchange_rate;
      expect(extractBitnobRate(q)).toBeCloseTo(2000 / 1.424498, 4);
    });

    it('still reads a plain numeric exchange_rate', () => {
      expect(
        extractBitnobRate({ data: { payout: { exchange_rate: 1500 } } }),
      ).toBe(1500);
    });

    it('ignores a rate object with no usable numbers', () => {
      expect(
        extractBitnobRate({
          data: { payout: { exchange_rate: { rate: 'n/a' } } },
        }),
      ).toBeUndefined();
    });
  });
});

describe('ChainRateService', () => {
  it('turns a real Bitnob quote into a rate', async () => {
    const bitnob = {
      createPayoutQuote: jest.fn().mockResolvedValue(BITNOB_QUOTE_RESPONSE),
    };
    const svc = new ChainRateService(bitnob as any);
    const r = await svc.getRate('base', 'offramp');
    expect(r.rate).toBeCloseTo(1404.00337, 4);
  });

  it('quotes in the local currency for GH and caches per country', async () => {
    const bitnob = {
      createPayoutQuote: jest.fn().mockResolvedValue({ data: { rate: 15 } }),
    };
    const svc = new ChainRateService(bitnob as any);
    await expect(
      svc.getRate('stellar', 'offramp', 'gh'),
    ).resolves.toMatchObject({ rate: 15, country: 'GH', currency: 'GHS' });
    expect(bitnob.createPayoutQuote).toHaveBeenCalledWith(
      expect.objectContaining({ toCurrency: 'GHS', country: 'GH' }),
    );
    await svc.getRate('stellar', 'offramp', 'KE');
    expect(bitnob.createPayoutQuote).toHaveBeenCalledTimes(2);
  });

  it('asks Bitnob with the chain for the requested network', async () => {
    const bitnob = {
      createPayoutQuote: jest.fn().mockResolvedValue({ data: { rate: 1580 } }),
    };
    const svc = new ChainRateService(bitnob as any);
    await expect(svc.getRate('stellar', 'offramp')).resolves.toEqual({
      rate: 1580,
      network: 'stellar',
      direction: 'offramp',
      source: 'bitnob',
      country: 'NG',
      currency: 'NGN',
    });
    expect(bitnob.createPayoutQuote).toHaveBeenCalledWith(
      expect.objectContaining({ chain: 'STELLAR', fromAsset: 'USDC' }),
    );
  });

  it('caches a rate briefly per network', async () => {
    const bitnob = {
      createPayoutQuote: jest.fn().mockResolvedValue({ data: { rate: 1580 } }),
    };
    const svc = new ChainRateService(bitnob as any);
    await svc.getRate('base', 'onramp');
    await svc.getRate('base', 'offramp');
    expect(bitnob.createPayoutQuote).toHaveBeenCalledTimes(1);
  });

  it('fails with 503 (no on-chain fallback) when Bitnob fails', async () => {
    const bitnob = {
      createPayoutQuote: jest.fn().mockRejectedValue(new Error('403')),
    };
    await expect(
      new ChainRateService(bitnob as any).getRate('base', 'onramp'),
    ).rejects.toThrow(/temporarily unavailable/i);
  });

  it('fails when Bitnob returns no usable rate', async () => {
    const bitnob = {
      createPayoutQuote: jest.fn().mockResolvedValue({ data: {} }),
    };
    await expect(
      new ChainRateService(bitnob as any).getRate('bsc', 'offramp'),
    ).rejects.toThrow(/temporarily unavailable/i);
  });
});
