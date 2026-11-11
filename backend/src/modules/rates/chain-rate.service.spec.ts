import { ChainRateService, extractBitnobRate } from './chain-rate.service';

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
});

describe('ChainRateService', () => {
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
