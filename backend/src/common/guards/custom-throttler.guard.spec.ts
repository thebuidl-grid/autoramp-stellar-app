import { CustomThrottlerGuard } from './custom-throttler.guard';

describe('CustomThrottlerGuard.getTracker', () => {
  // getTracker doesn't touch constructor deps, so skip DI.
  const guard = Object.create(
    CustomThrottlerGuard.prototype,
  ) as CustomThrottlerGuard;
  const track = (req: Record<string, any>) =>
    (guard as any).getTracker(req) as Promise<string>;

  it('uses cf-connecting-ip when present', async () => {
    await expect(
      track({ ip: '10.0.1.5', headers: { 'cf-connecting-ip': '102.89.1.2' } }),
    ).resolves.toBe('102.89.1.2');
  });

  it('gives different visitors behind the same proxy different keys', async () => {
    const a = await track({
      ip: '10.0.1.5',
      headers: { 'cf-connecting-ip': '102.89.1.2' },
    });
    const b = await track({
      ip: '10.0.1.5',
      headers: { 'cf-connecting-ip': '81.2.3.4' },
    });
    expect(a).not.toBe(b);
  });

  it('takes the first value if the header is an array', async () => {
    await expect(
      track({ ip: '10.0.1.5', headers: { 'cf-connecting-ip': ['1.1.1.1'] } }),
    ).resolves.toBe('1.1.1.1');
  });

  it('falls back to req.ip when the header is missing or blank', async () => {
    await expect(track({ ip: '127.0.0.1', headers: {} })).resolves.toBe(
      '127.0.0.1',
    );
    await expect(
      track({ ip: '127.0.0.1', headers: { 'cf-connecting-ip': '  ' } }),
    ).resolves.toBe('127.0.0.1');
  });
});
