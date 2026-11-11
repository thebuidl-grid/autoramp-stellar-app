import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Decimal } = require('@prisma/client/runtime/library');
import { PrismaService } from '../../../database/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService — webhook delivery logs', () => {
  let service: NotificationsService;
  let prisma: any;
  let httpService: { post: jest.Mock };

  beforeEach(async () => {
    prisma = {
      merchantWebhook: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      merchantWebhookLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    httpService = { post: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: HttpService, useValue: httpService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('notifyMerchant with no active webhook', () => {
    it('records a failed delivery log so the attempt is auditable', async () => {
      prisma.merchantWebhook.findMany.mockResolvedValue([]);
      prisma.merchantWebhookLog.create.mockResolvedValue({ id: 'log-1' });

      await service.notifyMerchant('merchant-martins', 'account.credit', {
        amount: 500,
      });

      expect(httpService.post).not.toHaveBeenCalled();
      expect(prisma.merchantWebhookLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          merchantId: 'merchant-martins',
          event: 'account.credit',
          url: null,
          success: false,
          errorMessage: 'No active webhook endpoint configured',
        }),
      });
    });

    it('does not send any HTTP request when no endpoint exists', async () => {
      prisma.merchantWebhook.findMany.mockResolvedValue([]);

      await service.notifyMerchant('merchant-martins', 'account.debit', {});

      expect(httpService.post).not.toHaveBeenCalled();
    });
  });

  describe('notifyMerchant with an active webhook', () => {
    const webhook = {
      id: 'wh-1',
      url: 'https://martins.example.com/hooks',
      secret: 'whsec_secret',
      label: 'primary',
    };

    it('records a successful delivery log when the endpoint responds', async () => {
      prisma.merchantWebhook.findMany.mockResolvedValue([webhook]);
      prisma.merchantWebhookLog.create.mockResolvedValue({ id: 'log-1' });
      httpService.post.mockReturnValue(
        of({ status: 200, data: { received: true } }),
      );

      await service.notifyMerchant('merchant-martins', 'account.credit', {
        amount: 500,
      });

      expect(httpService.post).toHaveBeenCalledWith(
        'https://martins.example.com/hooks',
        expect.objectContaining({
          event: 'account.credit',
          data: expect.objectContaining({ amount: 500 }),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Webhook-Event': 'account.credit',
            'X-Webhook-Signature': expect.any(String),
          }),
        }),
      );

      expect(prisma.merchantWebhookLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          merchantId: 'merchant-martins',
          event: 'account.credit',
          url: 'https://martins.example.com/hooks',
          statusCode: 200,
          success: true,
        }),
      });
    });

    it('records a failed delivery log when the endpoint errors', async () => {
      prisma.merchantWebhook.findMany.mockResolvedValue([webhook]);
      prisma.merchantWebhookLog.create.mockResolvedValue({ id: 'log-2' });

      const err: any = new Error('connect ECONNREFUSED');
      err.response = { status: 500, data: { error: 'down' } };
      httpService.post.mockReturnValue(throwError(() => err));

      await service.notifyMerchant('merchant-martins', 'account.credit', {
        amount: 500,
      });

      expect(prisma.merchantWebhookLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          merchantId: 'merchant-martins',
          event: 'account.credit',
          url: 'https://martins.example.com/hooks',
          statusCode: 500,
          success: false,
          errorMessage: 'connect ECONNREFUSED',
        }),
      });
    });

    it('fans out to multiple active webhooks', async () => {
      const webhooks = [
        webhook,
        { ...webhook, id: 'wh-2', url: 'https://backup.example.com/hooks' },
      ];
      prisma.merchantWebhook.findMany.mockResolvedValue(webhooks);
      prisma.merchantWebhookLog.create.mockResolvedValue({ id: 'log-1' });
      httpService.post.mockReturnValue(
        of({ status: 200, data: { received: true } }),
      );

      await service.notifyMerchant('merchant-martins', 'account.credit', {});

      expect(httpService.post).toHaveBeenCalledTimes(2);
      expect(prisma.merchantWebhookLog.create).toHaveBeenCalledTimes(2);
    });

    it('serializes Prisma Decimal amounts so the delivery log can be stored', async () => {
      prisma.merchantWebhook.findMany.mockResolvedValue([webhook]);
      prisma.merchantWebhookLog.create.mockResolvedValue({ id: 'log-1' });
      httpService.post.mockReturnValue(
        of({ status: 200, data: { received: true } }),
      );

      await service.notifyMerchant('merchant-martins', 'bank_transfer.completed', {
        id: 'trx-1',
        amount: new Decimal(100),
        status: 'COMPLETED',
      });

      const logged =
        prisma.merchantWebhookLog.create.mock.calls[0][0].data.payload;
      expect(logged.data.amount).toBe('100');
      expect(() => JSON.stringify(logged)).not.toThrow();
      expect(JSON.stringify(logged)).not.toContain('constructor');
    });
  });

  describe('retry paths guard against null endpoint URL', () => {
    it('retryWebhookLog throws a clear error for a log without a URL', async () => {
      prisma.merchantWebhookLog.findUnique.mockResolvedValue({
        id: 'log-null',
        merchantId: 'merchant-martins',
        event: 'account.credit',
        url: null,
        payload: {},
        retryCount: 0,
      });

      await expect(service.retryWebhookLog('log-null')).rejects.toThrow(
        'No endpoint URL recorded for this webhook log',
      );
      expect(httpService.post).not.toHaveBeenCalled();
    });
  });
});
