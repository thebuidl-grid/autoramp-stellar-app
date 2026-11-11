import { BadRequestException } from '@nestjs/common';
import { SwapService } from './swap.service';

/** USD/NGN rate resilience: a failed live quote falls back to the last good rate (up to 1h), else errors. */
describe('SwapService.getUsdNgnRate fallback', () => {
  const make = (swapper: any, cache: any) => {
    const svc: any = Object.create(SwapService.prototype);
    svc.logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn() };
    svc.swapper = swapper;
    svc.usdNgnRateCache = cache;
    svc.CACHE_TTL_MS = 60 * 1000;
    svc.STALE_RATE_MAX_MS = 60 * 60 * 1000;
    return svc as SwapService & { logger: any };
  };
  const failing = { getQuote: jest.fn().mockRejectedValue(new Error('server response 525')) };

  it('serves the last good rate when the live quote fails and the cache is under an hour old', async () => {
    const svc = make(failing, { rate: 1600, timestamp: Date.now() - 10 * 60 * 1000 });
    await expect(svc.getUsdNgnRate()).resolves.toBe(1600);
    expect((svc as any).logger.warn).toHaveBeenCalled();
  });

  it('still throws when there is no cached rate', async () => {
    const svc = make(failing, null);
    await expect(svc.getUsdNgnRate()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still throws when the cached rate is older than an hour', async () => {
    const svc = make(failing, { rate: 1600, timestamp: Date.now() - 2 * 60 * 60 * 1000 });
    await expect(svc.getUsdNgnRate()).rejects.toBeInstanceOf(BadRequestException);
  });
});
