import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { WebhookController } from './webhook.controller';
import { WebhookQueueService } from './webhook-queue.service';

describe('WebhookController — inbound webhook routes', () => {
  let controller: WebhookController;
  let prisma: any;
  let webhookQueue: { enqueue: jest.Mock };

  const bitnobSecret = 'test-bitnob-secret';

  beforeEach(async () => {
    prisma = {
      inboundWebhook: {
        create: jest.fn().mockResolvedValue({ id: 'wh-123' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    webhookQueue = { enqueue: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: WebhookQueueService, useValue: webhookQueue },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'BITNOB_WEBHOOK_SECRET' ? bitnobSecret : undefined,
          },
        },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
  });

  describe('POST /webhook/sh (SafeHaven)', () => {
    it('persists an inbound webhook and enqueues it', async () => {
      const payload = {
        eventType: 'account.credit',
        data: { creditAccountNumber: '0117964837', amount: 500 },
      };

      const result = await controller.handleMFBWebhook(payload);

      expect(prisma.inboundWebhook.create).toHaveBeenCalledWith({
        data: {
          provider: 'safehaven',
          endpoint: 'sh',
          payload,
          signature: null,
          status: 'pending',
        },
      });

      expect(webhookQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'safehaven',
          endpoint: 'sh',
          payload,
          inboundWebhookId: 'wh-123',
        }),
      );

      expect(result).toEqual({ status: 'accepted', id: 'wh-123' });
    });
  });

  describe('POST /webhook/pulse (Pulse MFB)', () => {
    it('persists signature and enqueues with signature', async () => {
      const payload = {
        event: 'account.created',
        data: { account_number: '0117964837' },
      };

      const result = await controller.handlePulseMfbWebhook(payload, 'sig_abc123');

      expect(prisma.inboundWebhook.create).toHaveBeenCalledWith({
        data: {
          provider: 'pulse',
          endpoint: 'pulse',
          payload,
          signature: 'sig_abc123',
          status: 'pending',
        },
      });

      expect(webhookQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'pulse',
          signature: 'sig_abc123',
          inboundWebhookId: 'wh-123',
        }),
      );

      expect(result).toEqual({ status: 'accepted', id: 'wh-123' });
    });
  });

  describe('POST /webhook/bitnob', () => {
    it('persists and enqueues a bitnob webhook with a valid signature', async () => {
      const payload = { event: 'deposit.completed', data: { amount: 10 } };
      const rawBody = JSON.stringify(payload);
      const signature = createHmac('sha512', bitnobSecret)
        .update(rawBody)
        .digest('hex');

      const result = await controller.handleBitNobWebhook(
        payload,
        { rawBody: Buffer.from(rawBody) },
        signature,
      );

      expect(prisma.inboundWebhook.create).toHaveBeenCalledWith({
        data: {
          provider: 'bitnob',
          endpoint: 'bitnob',
          payload,
          signature,
          status: 'pending',
        },
      });
      expect(webhookQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'bitnob' }),
      );
      expect(result).toEqual({ status: 'accepted', id: 'wh-123' });
    });

    it('rejects a webhook with an invalid signature', async () => {
      const payload = { event: 'deposit.completed', data: { amount: 10 } };
      const rawBody = Buffer.from(JSON.stringify(payload));
      await expect(
        controller.handleBitNobWebhook(payload, { rawBody }, 'deadbeef'),
      ).rejects.toThrow('Invalid Bitnob webhook signature');
      expect(prisma.inboundWebhook.create).not.toHaveBeenCalled();
      expect(webhookQueue.enqueue).not.toHaveBeenCalled();
    });

    it('rejects a webhook signed with the wrong secret', async () => {
      const payload = { event: 'deposit.completed', data: { amount: 10 } };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = createHmac('sha512', 'wrong-secret')
        .update(rawBody)
        .digest('hex');
      await expect(
        controller.handleBitNobWebhook(payload, { rawBody }, signature),
      ).rejects.toThrow('Invalid Bitnob webhook signature');
    });
  });

  describe('POST /webhook/blockradar', () => {
    it('persists and enqueues a blockradar webhook', async () => {
      const payload = { event: 'address.credit', data: { amount: 10 } };

      const result = await controller.handleBlockRadarWebhook(payload);

      expect(prisma.inboundWebhook.create).toHaveBeenCalledWith({
        data: {
          provider: 'blockradar',
          endpoint: 'blockradar',
          payload,
          signature: null,
          status: 'pending',
        },
      });
      expect(webhookQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'blockradar' }),
      );
      expect(result).toEqual({ status: 'accepted', id: 'wh-123' });
    });
  });

  describe('POST /webhook/ramp (Flint)', () => {
    it('persists and enqueues a flint webhook', async () => {
      const payload = { event: 'offramp.completed', data: { amount: 10 } };

      const result = await controller.handleRampWebhook(payload);

      expect(prisma.inboundWebhook.create).toHaveBeenCalledWith({
        data: {
          provider: 'flint',
          endpoint: 'ramp',
          payload,
          signature: null,
          status: 'pending',
        },
      });
      expect(webhookQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'flint' }),
      );
      expect(result).toEqual({ status: 'accepted', id: 'wh-123' });
    });
  });

  describe('enqueue failure handling', () => {
    it('marks the inbound webhook failed when enqueue throws', async () => {
      webhookQueue.enqueue.mockRejectedValue(new Error('redis down'));

      await expect(
        controller.handleMFBWebhook({ eventType: 'account.credit' }),
      ).rejects.toThrow('redis down');

      expect(prisma.inboundWebhook.update).toHaveBeenCalledWith({
        where: { id: 'wh-123' },
        data: {
          status: 'failed',
          error: 'enqueue failed: redis down',
        },
      });
    });
  });
});
