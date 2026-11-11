import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { WebhookService } from '../ramp/webhook.service';
import { MFBWebhookService } from '../safehaven/safehaven-webhook.service';
import { WebhookHandlers } from '../safehaven/webhook-handlers.service';
import { MFBService } from '../safehaven/safehaven.service';
import { MailService } from '../mail/mail.service';
import { SwapGateway } from '../swap/swap.gateway';
import { NotificationsService } from '../merchants/notifications/notifications.service';
import { BalanceCacheService } from '../../common/services/balance-cache.service';

describe('Webhook Integration Tests', () => {
  let webhookService: WebhookService;
  let safeHavenWebhookService: MFBWebhookService;
  let prisma: PrismaService;
  let testOfframpTransaction: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        WebhookHandlers,
        MFBWebhookService,
        {
          provide: PrismaService,
          useValue: {
            onrampTransaction: {
              findFirst: jest.fn().mockResolvedValue(null),
              findUnique: jest.fn(),
              update: jest.fn().mockReturnValue({
                catch: jest.fn().mockResolvedValue(undefined),
              }),
            },
            merchantOnrampTransaction: {
              findFirst: jest.fn().mockResolvedValue(null),
              findUnique: jest.fn(),
              update: jest.fn().mockReturnValue({
                catch: jest.fn().mockResolvedValue(undefined),
              }),
            },
            offrampTransaction: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
            },
            merchantOfframpTransaction: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            bridgeTransaction: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            otcTransaction: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            swapTransaction: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            merchantSwapTransaction: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            otcUser: {
              findFirst: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
            webhookEvent: {
              create: jest.fn(),
            },
            transactionLog: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: MFBService,
          useValue: {
            transfer: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendOtcInflowNotification: jest.fn(),
          },
        },
        {
          provide: SwapGateway,
          useValue: {
            emitTransactionUpdate: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            notifyMerchant: jest.fn(),
          },
        },
        {
          provide: BalanceCacheService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    webhookService = module.get<WebhookService>(WebhookService);
    safeHavenWebhookService = module.get<MFBWebhookService>(MFBWebhookService);
    prisma = module.get<PrismaService>(PrismaService);

    // Create test offramp transaction
    testOfframpTransaction = {
      id: 'test-offramp-id',
      reference: 'ref_merchantref000001',
      userId: 'test-user-id',
      status: 'PROCESSING',
      amount: 1000,
      safehavenAccount: {
        _id: '65b76ebbc0a4440024e45e52',
        accountNumber: '8060376145',
      },
    };
  });

  describe('Flint Offramp Webhook', () => {
    it('should process Flint webhook and create webhook event with provider flint', async () => {
      const flintWebhook = {
        event: 'offramp.completed',
        data: {
          transactionId: 'trx_longid123487654',
          reference: 'ref_merchantref000001',
          amount: 1000,
          processedAmount: 1000,
          status: 'completed',
          network: 'base',
        },
      };

      (prisma.offrampTransaction.findUnique as jest.Mock).mockResolvedValue(testOfframpTransaction);
      (prisma.offrampTransaction.update as jest.Mock).mockResolvedValue({
        ...testOfframpTransaction,
        status: 'COMPLETED',
      });

      await webhookService.processWebhook(flintWebhook);

      expect(prisma.webhookEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          transactionType: 'offramp',
          transactionId: 'test-offramp-id',
          provider: 'flint',
          eventType: 'offramp.completed',
          status: 'COMPLETED',
          processed: true,
        }),
      });
    });
  });

  describe('MFB Offramp Webhook', () => {
    it('should process MFB webhook and create webhook event with provider safehaven', async () => {
      const safeHavenWebhook = {
        type: 'virtualAccount.transfer',
        data: {
          _id: '65b76ed3c0a4440024e45e75',
          virtualAccount: '65b76ebbc0a4440024e45e52',
          paymentReference: '999240240129092434550231308787',
          creditAccountNumber: '8060376145',
          creditAccountName: 'BITAKOTECHNOLOG / OmaTech',
          debitAccountNumber: '0119536306',
          debitAccountName: 'ZEALVEND',
          amount: 100,
          status: 'Completed',
        },
      };

      (prisma.offrampTransaction.findFirst as jest.Mock).mockResolvedValue(testOfframpTransaction);
      (prisma.offrampTransaction.update as jest.Mock).mockResolvedValue({
        ...testOfframpTransaction,
        status: 'PROCESSING',
      });

      await safeHavenWebhookService.processWebhook(safeHavenWebhook);

      expect(prisma.webhookEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          transactionType: 'offramp',
          transactionId: 'test-offramp-id',
          provider: 'safehaven',
          eventType: 'virtualAccount.transfer',
          status: 'Completed',
          processed: true,
        }),
      });
    });
  });

  describe('Complete Offramp Webhook Flow', () => {
    it('should link both Flint and MFB webhooks to same offramp transaction', async () => {
      // First: Flint webhook
      const flintWebhook = {
        event: 'offramp.completed',
        data: {
          reference: 'ref_merchantref000001',
          status: 'completed',
        },
      };

      (prisma.offrampTransaction.findUnique as jest.Mock).mockResolvedValue(testOfframpTransaction);
      (prisma.offrampTransaction.update as jest.Mock).mockResolvedValue(testOfframpTransaction);

      await webhookService.processWebhook(flintWebhook);

      // Second: MFB webhook
      const safeHavenWebhook = {
        type: 'virtualAccount.transfer',
        data: {
          creditAccountNumber: '8060376145',
          status: 'Completed',
          paymentReference: '999240240129092434550231308787',
        },
      };

      (prisma.offrampTransaction.findFirst as jest.Mock).mockResolvedValue(testOfframpTransaction);

      await safeHavenWebhookService.processWebhook(safeHavenWebhook);

      // Both webhooks should create events for same transaction
      expect(prisma.webhookEvent.create).toHaveBeenCalledTimes(3);
      // Call 1: Flint webhook
      expect(prisma.webhookEvent.create).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          transactionId: 'test-offramp-id',
          provider: 'flint',
        }),
      });
      // Call 2: SafeHaven initial webhook persist
      expect(prisma.webhookEvent.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          provider: 'safehaven',
        }),
      });
      // Call 3: SafeHaven virtualAccount.transfer handler
      expect(prisma.webhookEvent.create).toHaveBeenNthCalledWith(3, {
        data: expect.objectContaining({
          transactionId: 'test-offramp-id',
          provider: 'safehaven',
        }),
      });
    });
  });
});