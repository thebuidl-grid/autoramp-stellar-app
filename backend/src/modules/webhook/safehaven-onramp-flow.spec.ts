import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { MFBWebhookService } from '../safehaven/safehaven-webhook.service';
import { WebhookHandlers } from '../safehaven/webhook-handlers.service';
import { MFBService } from '../safehaven/safehaven.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../merchants/notifications/notifications.service';
import { BalanceCacheService } from '../../common/services/balance-cache.service';

describe('MFB Onramp Auto-Settle Flow', () => {
  let safeHavenWebhookService: MFBWebhookService;
  let prisma: PrismaService;
  let safehavenService: MFBService;

  const testOnrampTransaction = {
    id: 'test-onramp-id',
    reference: 'ref_onramp_test_001',
    userId: 'test-user-id',
    status: 'PENDING',
    amount: 100,
    depositAccount: {
      bankCode: '090267',
      accountNumber: '2041363986',
      accountName: 'Test Account',
      bankName: 'Test Bank',
    },
    safehavenAccount: {
      _id: '65b76ebbc0a4440024e45e52',
      accountNumber: '8060376145',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookHandlers,
        MFBWebhookService,
        {
          provide: PrismaService,
          useValue: {
            onrampTransaction: {
              findFirst: jest.fn().mockResolvedValue(null),
              findUnique: jest.fn(),
              update: jest.fn().mockResolvedValue(null),
            },
            merchantOnrampTransaction: {
              findFirst: jest.fn().mockResolvedValue(null),
              findUnique: jest.fn(),
              update: jest.fn().mockResolvedValue(null),
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
            transfer: jest.fn().mockResolvedValue({
              status: 'success',
              data: { transactionId: 'sh-trx-001' },
            }),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendOtcInflowNotification: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            notifyMerchant: jest.fn(),
            notifyMerchantForTransaction: jest.fn(),
            notifyMerchantForAccountCreation: jest.fn(),
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

    safeHavenWebhookService = module.get<MFBWebhookService>(MFBWebhookService);
    prisma = module.get<PrismaService>(PrismaService);
    safehavenService = module.get<MFBService>(MFBService);
  });

  describe('Successful auto-settle on onramp completion', () => {
    it('should call transfer with correct beneficiary details and amount 100', async () => {
      const webhookPayload = {
        type: 'virtualAccount.transfer',
        data: {
          _id: '65b76ed3c0a4440024e45e75',
          virtualAccount: '65b76ebbc0a4440024e45e52',
          paymentReference: '999240240129092434550231308787',
          creditAccountNumber: '2041363986',
          creditAccountName: 'Test User',
          debitAccountNumber: '0119536306',
          debitAccountName: 'Sender',
          amount: 100,
          status: 'Completed',
        },
      };

      (prisma.onrampTransaction.findFirst as jest.Mock).mockResolvedValue(testOnrampTransaction);
      (prisma.onrampTransaction.update as jest.Mock).mockResolvedValue({
        ...testOnrampTransaction,
        status: 'PROCESSING',
      });

      await safeHavenWebhookService.processWebhook(webhookPayload);

      expect(safehavenService.transfer).toHaveBeenCalledWith(
        {
          beneficiaryBankCode: '090267',
          beneficiaryAccountNumber: '2041363986',
          amount: 100,
          narration: 'Funding: 999240240129092434550231308787',
          paymentReference: '999240240129092434550231308787',
        },
        { transactionId: 'test-onramp-id', type: 'ONRAMP' },
      );

      expect(prisma.onrampTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'test-onramp-id' },
          data: expect.objectContaining({
            status: 'COMPLETED',
          }),
        }),
      );

      expect(prisma.webhookEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          transactionType: 'onramp',
          transactionId: 'test-onramp-id',
          processed: true,
        }),
      });
    });
  });

  describe('Onramp with missing amount in database', () => {
    it('should keep status as PROCESSING and NOT call transfer when amount is missing', async () => {
      const webhookPayload = {
        type: 'virtualAccount.transfer',
        data: {
          virtualAccount: '65b76ebbc0a4440024e45e52',
          paymentReference: '999240240129092434550231308788',
          creditAccountNumber: '2041363986',
          amount: 100,
          status: 'Completed',
        },
      };

      const txWithoutAmount = {
        ...testOnrampTransaction,
        amount: null,
      };

      (prisma.onrampTransaction.findFirst as jest.Mock).mockResolvedValue(txWithoutAmount);
      (prisma.onrampTransaction.update as jest.Mock).mockResolvedValue({
        ...txWithoutAmount,
        status: 'PROCESSING',
      });

      const result = await safeHavenWebhookService.processWebhook(webhookPayload);

      expect(safehavenService.transfer).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'success', transactionId: 'test-onramp-id' });

      expect(prisma.onrampTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'test-onramp-id' },
          data: expect.objectContaining({
            status: 'PROCESSING',
          }),
        }),
      );

      expect(prisma.transactionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            oldStatus: 'PENDING',
            newStatus: 'PROCESSING',
            description: expect.stringContaining('Settlement failed'),
          }),
        }),
      );
    });
  });

  describe('Onramp with zero amount', () => {
    it('should keep status as PROCESSING and NOT call transfer when amount is 0', async () => {
      const webhookPayload = {
        type: 'virtualAccount.transfer',
        data: {
          virtualAccount: '65b76ebbc0a4440024e45e52',
          paymentReference: '999240240129092434550231308789',
          creditAccountNumber: '2041363986',
          amount: 100,
          status: 'Completed',
        },
      };

      const txWithZeroAmount = {
        ...testOnrampTransaction,
        amount: 0,
      };

      (prisma.onrampTransaction.findFirst as jest.Mock).mockResolvedValue(txWithZeroAmount);
      (prisma.onrampTransaction.update as jest.Mock).mockResolvedValue({
        ...txWithZeroAmount,
        status: 'PROCESSING',
      });

      const result = await safeHavenWebhookService.processWebhook(webhookPayload);

      expect(safehavenService.transfer).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'success', transactionId: 'test-onramp-id' });

      expect(prisma.onrampTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'test-onramp-id' },
          data: expect.objectContaining({
            status: 'PROCESSING',
          }),
        }),
      );

      expect(prisma.transactionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            oldStatus: 'PENDING',
            newStatus: 'PROCESSING',
            description: expect.stringContaining('Settlement failed'),
          }),
        }),
      );
    });
  });

  describe('Onramp webhook with non-completed status', () => {
    it('should NOT trigger transfer when webhook status is Pending', async () => {
      const webhookPayload = {
        type: 'virtualAccount.transfer',
        data: {
          virtualAccount: '65b76ebbc0a4440024e45e52',
          paymentReference: '999240240129092434550231308790',
          creditAccountNumber: '2041363986',
          amount: 100,
          status: 'Pending',
        },
      };

      (prisma.onrampTransaction.findFirst as jest.Mock).mockResolvedValue(testOnrampTransaction);

      await safeHavenWebhookService.processWebhook(webhookPayload);

      expect(safehavenService.transfer).not.toHaveBeenCalled();
    });
  });

  describe('Case-insensitive status handling (regression)', () => {
    it('should trigger transfer when status is lowercase "completed"', async () => {
      const webhookPayload = {
        type: 'virtualAccount.transfer',
        data: {
          _id: '65b76ed3c0a4440024e45e76',
          virtualAccount: '65b76ebbc0a4440024e45e52',
          paymentReference: '999240240129092434550231308791',
          creditAccountNumber: '2041363986',
          creditAccountName: 'Test User',
          debitAccountNumber: '0119536306',
          debitAccountName: 'Sender',
          amount: 100,
          status: 'completed',
        },
      };

      (prisma.onrampTransaction.findFirst as jest.Mock).mockResolvedValue(testOnrampTransaction);
      (prisma.onrampTransaction.update as jest.Mock).mockResolvedValue({
        ...testOnrampTransaction,
        status: 'PROCESSING',
      });

      await safeHavenWebhookService.processWebhook(webhookPayload);

      expect(safehavenService.transfer).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 100 }),
        expect.objectContaining({ transactionId: 'test-onramp-id', type: 'ONRAMP' }),
      );
    });

    it('should trigger transfer when status is UPPERCASE "COMPLETED"', async () => {
      const webhookPayload = {
        type: 'virtualAccount.transfer',
        data: {
          _id: '65b76ed3c0a4440024e45e77',
          virtualAccount: '65b76ebbc0a4440024e45e52',
          paymentReference: '999240240129092434550231308792',
          creditAccountNumber: '2041363986',
          creditAccountName: 'Test User',
          debitAccountNumber: '0119536306',
          debitAccountName: 'Sender',
          amount: 100,
          status: 'COMPLETED',
        },
      };

      (prisma.onrampTransaction.findFirst as jest.Mock).mockResolvedValue(testOnrampTransaction);
      (prisma.onrampTransaction.update as jest.Mock).mockResolvedValue({
        ...testOnrampTransaction,
        status: 'PROCESSING',
      });

      await safeHavenWebhookService.processWebhook(webhookPayload);

      expect(safehavenService.transfer).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 100 }),
        expect.objectContaining({ transactionId: 'test-onramp-id', type: 'ONRAMP' }),
      );
    });

    it('should trigger transfer when status is "Success"', async () => {
      const webhookPayload = {
        type: 'virtualAccount.transfer',
        data: {
          _id: '65b76ed3c0a4440024e45e78',
          virtualAccount: '65b76ebbc0a4440024e45e52',
          paymentReference: '999240240129092434550231308793',
          creditAccountNumber: '2041363986',
          creditAccountName: 'Test User',
          debitAccountNumber: '0119536306',
          debitAccountName: 'Sender',
          amount: 100,
          status: 'Success',
        },
      };

      (prisma.onrampTransaction.findFirst as jest.Mock).mockResolvedValue(testOnrampTransaction);
      (prisma.onrampTransaction.update as jest.Mock).mockResolvedValue({
        ...testOnrampTransaction,
        status: 'PROCESSING',
      });

      await safeHavenWebhookService.processWebhook(webhookPayload);

      expect(safehavenService.transfer).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 100 }),
        expect.objectContaining({ transactionId: 'test-onramp-id', type: 'ONRAMP' }),
      );
    });
  });

  describe('Terminal state guard (regression)', () => {
    it('should ignore FAILED webhook when transaction is already COMPLETED', async () => {
      const completedTx = {
        ...testOnrampTransaction,
        status: 'COMPLETED',
      };

      const webhookPayload = {
        type: 'virtualAccount.transfer',
        data: {
          _id: '65b76ed3c0a4440024e45e79',
          virtualAccount: '65b76ebbc0a4440024e45e52',
          paymentReference: '999240240129092434550231308794',
          creditAccountNumber: '2041363986',
          creditAccountName: 'Test User',
          debitAccountNumber: '0119536306',
          debitAccountName: 'Sender',
          amount: 100,
          status: 'failed',
        },
      };

      (prisma.onrampTransaction.findFirst as jest.Mock).mockResolvedValue(completedTx);

      const result = await safeHavenWebhookService.processWebhook(webhookPayload);

      expect(result).toEqual({ status: 'ignored', message: 'Transaction already COMPLETED' });
      expect(safehavenService.transfer).not.toHaveBeenCalled();
      expect(prisma.onrampTransaction.update).not.toHaveBeenCalled();
    });

    it('should ignore PENDING webhook when transaction is already COMPLETED', async () => {
      const completedTx = {
        ...testOnrampTransaction,
        status: 'COMPLETED',
      };

      const webhookPayload = {
        type: 'virtualAccount.transfer',
        data: {
          _id: '65b76ed3c0a4440024e45e80',
          virtualAccount: '65b76ebbc0a4440024e45e52',
          paymentReference: '999240240129092434550231308795',
          creditAccountNumber: '2041363986',
          creditAccountName: 'Test User',
          debitAccountNumber: '0119536306',
          debitAccountName: 'Sender',
          amount: 100,
          status: 'Pending',
        },
      };

      (prisma.onrampTransaction.findFirst as jest.Mock).mockResolvedValue(completedTx);

      const result = await safeHavenWebhookService.processWebhook(webhookPayload);

      expect(result).toEqual({ status: 'ignored', message: 'Transaction already COMPLETED' });
      expect(safehavenService.transfer).not.toHaveBeenCalled();
      expect(prisma.onrampTransaction.update).not.toHaveBeenCalled();
    });
  });
});
