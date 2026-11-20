import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { NotificationsService } from './notifications.service';

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
