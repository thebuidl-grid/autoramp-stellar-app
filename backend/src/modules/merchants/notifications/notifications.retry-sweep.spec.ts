import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { NotificationsService, clipResponse } from './notifications.service';

const URL_A = 'https://mihaspay-backend.example.run.app/api/webhooks/autoramp';
const URL_B = 'https://merchant.example.com:8443/hooks';

const failedLog = (over: Record<string, unknown> = {}) => ({
  id: 'log-1',
  merchantId: 'merchant-1',
  url: URL_A,
  event: 'account.credit',
  payload: { event: 'account.credit', data: { amount: 5 } },
  success: false,
  retryCount: 0,
  ...over,
});

describe('NotificationsService retry sweep', () => {
  let svc: NotificationsService;
  let prisma: any;
  let http: { post: jest.Mock };
  let warn: jest.SpyInstance;

  const sweep = () => (svc as any).retryFailedWebhooks();

  beforeEach(() => {
    prisma = {
      merchantWebhook: { findMany: jest.fn().mockResolvedValue([]) },
      merchantWebhookLog: {
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    http = { post: jest.fn() };
    svc = new NotificationsService(http as unknown as HttpService, prisma);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('looks up the active webhook by the FULL url (a ":" in the url must not truncate it)', async () => {
    prisma.merchantWebhookLog.findMany.mockResolvedValue([
      failedLog(),
      failedLog({ id: 'log-2', merchantId: 'merchant-2', url: URL_B }),
    ]);

    await sweep();

    const where = prisma.merchantWebhook.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { merchantId: 'merchant-1', url: URL_A, active: true },
        { merchantId: 'merchant-2', url: URL_B, active: true },
      ]),
    );
  });

  it('delivers the retry, signed with the matching secret, and marks the log successful', async () => {
    prisma.merchantWebhookLog.findMany.mockResolvedValue([failedLog()]);
    prisma.merchantWebhook.findMany.mockResolvedValue([
      { merchantId: 'merchant-1', url: URL_A, secret: 's3cret' },
    ]);
    http.post.mockReturnValue(of({ status: 200, data: { ok: true } }));

    await sweep();

    expect(http.post).toHaveBeenCalledTimes(1);
    const [url, body, opts] = http.post.mock.calls[0];
    expect(url).toBe(URL_A);
    expect(body).toEqual({ event: 'account.credit', data: { amount: 5 } });
    expect(opts.headers['X-Webhook-Signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(prisma.merchantWebhookLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: expect.objectContaining({
        success: true,
        nextRetryAt: null,
        retryCount: 1,
      }),
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('stops retrying a delivery whose webhook is gone, instead of re-warning every sweep', async () => {
    prisma.merchantWebhookLog.findMany.mockResolvedValue([failedLog()]);
    prisma.merchantWebhook.findMany.mockResolvedValue([]); // webhook deleted/disabled

    await sweep();

    expect(http.post).not.toHaveBeenCalled();
    // nextRetryAt: null drops it from the sweep query (nextRetryAt <= now), so it is not picked again
    expect(prisma.merchantWebhookLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: expect.objectContaining({
        nextRetryAt: null,
        errorMessage: expect.stringContaining('No active webhook'),
      }),
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not let an orphaned delivery block a valid one in the same sweep', async () => {
    prisma.merchantWebhookLog.findMany.mockResolvedValue([
      failedLog({ id: 'orphan', merchantId: 'merchant-gone' }),
      failedLog({ id: 'valid' }),
    ]);
    prisma.merchantWebhook.findMany.mockResolvedValue([
      { merchantId: 'merchant-1', url: URL_A, secret: 's3cret' },
    ]);
    http.post.mockReturnValue(of({ status: 200, data: {} }));

    await sweep();

    expect(http.post).toHaveBeenCalledTimes(1);
    const updated = prisma.merchantWebhookLog.update.mock.calls.map(
      (c: any) => c[0].where.id,
    );
    expect(updated.sort()).toEqual(['orphan', 'valid']);
  });

  it('schedules the next retry in the FUTURE using the backoff (not a 1970 date)', async () => {
    prisma.merchantWebhookLog.findMany.mockResolvedValue([
      failedLog({ retryCount: 0 }),
    ]);
    prisma.merchantWebhook.findMany.mockResolvedValue([
      { merchantId: 'merchant-1', url: URL_A, secret: 's' },
    ]);
    http.post.mockReturnValue(
      throwError(() =>
        Object.assign(new Error('boom'), { response: { status: 500 } }),
      ),
    );

    const before = Date.now();
    await sweep();
    const after = Date.now();

    const data = prisma.merchantWebhookLog.update.mock.calls[0][0].data;
    expect(data.retryCount).toBe(1);
    const at = (data.nextRetryAt as Date).getTime();
    expect(at).toBeGreaterThanOrEqual(before + 30_000); // delay after the first failed retry
    expect(at).toBeLessThanOrEqual(after + 30_000);
  });

  it('gives up (nextRetryAt null) after the last allowed retry fails', async () => {
    prisma.merchantWebhookLog.findMany.mockResolvedValue([
      failedLog({ retryCount: 2 }),
    ]);
    prisma.merchantWebhook.findMany.mockResolvedValue([
      { merchantId: 'merchant-1', url: URL_A, secret: 's' },
    ]);
    http.post.mockReturnValue(throwError(() => new Error('still down')));

    await sweep();

    expect(
      prisma.merchantWebhookLog.update.mock.calls[0][0].data,
    ).toMatchObject({
      retryCount: 3,
      nextRetryAt: null,
    });
  });

  describe('manual retry (retryWebhookLog)', () => {
    it('also schedules the next automatic retry in the future after a failure', async () => {
      prisma.merchantWebhookLog.findUnique = jest
        .fn()
        .mockResolvedValue(failedLog({ retryCount: 0 }));
      prisma.merchantWebhook.findFirst = jest
        .fn()
        .mockResolvedValue({ secret: 's' });
      http.post.mockReturnValue(throwError(() => new Error('down')));

      const before = Date.now();
      await expect(svc.retryWebhookLog('log-1')).rejects.toThrow('down');

      const data = prisma.merchantWebhookLog.update.mock.calls[0][0].data;
      expect((data.nextRetryAt as Date).getTime()).toBeGreaterThanOrEqual(
        before + 30_000,
      );
    });

    it('stops scheduling once the retries are used up', async () => {
      prisma.merchantWebhookLog.findUnique = jest
        .fn()
        .mockResolvedValue(failedLog({ retryCount: 2 }));
      prisma.merchantWebhook.findFirst = jest
        .fn()
        .mockResolvedValue({ secret: 's' });
      http.post.mockReturnValue(throwError(() => new Error('down')));

      await expect(svc.retryWebhookLog('log-1')).rejects.toThrow('down');

      expect(
        prisma.merchantWebhookLog.update.mock.calls[0][0].data.nextRetryAt,
      ).toBeNull();
    });
  });

  it('does nothing when there is nothing to retry', async () => {
    prisma.merchantWebhookLog.findMany.mockResolvedValue([]);
    await sweep();
    expect(prisma.merchantWebhook.findMany).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });
});

describe('merchant webhook SSRF protections', () => {
  const make = () => {
    const http = { post: jest.fn() };
    const prisma: any = {
      merchantWebhookLog: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn(),
      },
    };
    return { http, prisma, svc: new NotificationsService(http as any, prisma) };
  };
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it.each([
    'https://169.254.169.254/latest/meta-data/',
    'https://127.0.0.1:8080/hook',
    'https://localhost/hook',
    'https://[::1]/hook',
    'https://10.0.0.5/hook',
    'https://intranet.internal/hook',
    'ftp://example.com/hook',
    'file:///etc/passwd',
    'https://user:pass@example.com/hook',
  ])('refuses %s', async (url) => {
    const { svc } = make();
    await expect(svc.assertSafeWebhookTarget(url)).rejects.toThrow(
      /Invalid webhook URL/,
    );
  });

  it('accepts a normal public https URL', async () => {
    const { svc } = make();
    await expect(
      svc.assertSafeWebhookTarget('https://merchant.example.com/hooks'),
    ).resolves.toBeUndefined();
  });

  it('requires https in production, allows http elsewhere', async () => {
    const { svc } = make();
    process.env.NODE_ENV = 'development';
    await expect(
      svc.assertSafeWebhookTarget('http://merchant.example.com/hooks'),
    ).resolves.toBeUndefined();
    process.env.NODE_ENV = 'production';
    jest
      .spyOn(require('dns').promises, 'lookup')
      .mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    await expect(
      svc.assertSafeWebhookTarget('http://merchant.example.com/hooks'),
    ).rejects.toThrow(/https/);
  });

  it('in production also rejects a public-looking name that resolves to a private IP', async () => {
    const { svc } = make();
    process.env.NODE_ENV = 'production';
    jest
      .spyOn(require('dns').promises, 'lookup')
      .mockResolvedValue([{ address: '10.0.0.7', family: 4 }]);
    await expect(
      svc.assertSafeWebhookTarget('https://sneaky.example.com/hooks'),
    ).rejects.toThrow(/private/);
  });

  it('never sends a request to an unsafe URL, and records the failed attempt', async () => {
    const { svc, http, prisma } = make();
    await (svc as any).sendWebhook(
      'wh',
      'm1',
      'https://169.254.169.254/',
      'sec',
      'account.credit',
      { a: 1 },
    );
    expect(http.post).not.toHaveBeenCalled();
    expect(prisma.merchantWebhookLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        success: false,
        errorMessage: expect.stringContaining('Invalid webhook URL'),
      }),
    });
  });

  it('sends with redirects disabled, a size cap and the SSRF-safe agents', async () => {
    const { svc, http } = make();
    http.post.mockReturnValue(of({ status: 200, data: 'ok' }));
    await (svc as any).sendWebhook(
      'wh',
      'm1',
      'https://merchant.example.com/hooks',
      'sec',
      'e',
      { a: 1 },
    );
    const opts = http.post.mock.calls[0][2];
    expect(opts.maxRedirects).toBe(0);
    expect(opts.maxContentLength).toBeGreaterThan(0);
    expect(opts.httpsAgent).toBeDefined();
    expect(opts.httpAgent).toBeDefined();
  });

  it('allows private targets only with the explicit development flag', async () => {
    const { svc } = make();
    process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'true';
    await expect(
      svc.assertSafeWebhookTarget('http://localhost:4000/hook'),
    ).resolves.toBeUndefined();
    await expect(svc.assertSafeWebhookTarget('gopher://x')).rejects.toThrow();
  });
});

describe('clipResponse', () => {
  it('keeps small responses and truncates huge ones', () => {
    expect(clipResponse({ ok: true })).toEqual({ ok: true });
    expect(clipResponse(null)).toBeNull();
    const big = 'x'.repeat(10_000);
    const clipped = clipResponse(big) as string;
    expect(clipped.length).toBeLessThan(4100);
    expect(clipped).toContain('[truncated]');
  });
});
