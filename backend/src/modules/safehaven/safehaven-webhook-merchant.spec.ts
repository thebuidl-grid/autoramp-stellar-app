import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { MFBWebhookService } from './safehaven-webhook.service';
import { WebhookHandlers } from './webhook-handlers.service';
import { MFBService } from './safehaven.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../merchants/notifications/notifications.service';
import { BalanceCacheService } from '../../common/services/balance-cache.service';

describe('SafeHaven webhooks — merchant sub-account & delivery routing', () => {
  let service: MFBWebhookService;
  let prisma: any;
  let notificationsService: NotificationsService;

  const merchantSubAccount = {
    id: 'sub-1',
    merchantId: 'merchant-martins',
    accountNumber: '0117964837',
    accountName: 'MARTINS',
  };

  beforeEach(async () => {
    prisma = {
      otcUser: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn() },
      merchantSubAccount: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      merchantBankAccount: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      merchantSettlementAccount: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      merchantBankTransfer: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      onrampTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      merchantOnrampTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      offrampTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      merchantOfframpTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      bridgeTransaction: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      otcTransaction: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      virtualAccount: { findFirst: jest.fn().mockResolvedValue(null) },
      vasTransaction: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      webhookEvent: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      transactionLog: { create: jest.fn().mockResolvedValue({}) },
      transactionFee: { createMany: jest.fn().mockResolvedValue({}) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookHandlers,
        MFBWebhookService,
        { provide: PrismaService, useValue: prisma },
        { provide: MFBService, useValue: { transfer: jest.fn() } },
        { provide: MailService, useValue: { sendOtcInflowNotification: jest.fn() } },
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
            invalidate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MFBWebhookService>(MFBWebhookService);
    notificationsService = module.get<NotificationsService>(NotificationsService);
  });

  describe('account.credit (eventType discriminator)', () => {
    const creditWebhook = {
      eventType: 'account.credit',
      type: 'transfer',
      data: {
        _id: '69ca8144d1972300241afb5b',
        paymentReference: 'SHW-300326145723770',
        creditAccountNumber: '0117964837',
        creditAccountName: 'MARTINS',
        debitAccountNumber: '0114012524',
        debitAccountName: 'SALIUTECH',
        amount: 500,
        status: 'Completed',
        responseCode: '00',
      },
    };

    it('routes to the credit handler using eventType and notifies the merchant sub-account', async () => {
      prisma.merchantSubAccount.findFirst.mockResolvedValue(merchantSubAccount);

      const result = await service.processWebhook(creditWebhook);

      expect(result).toEqual({ status: 'success', merchantId: 'merchant-martins' });
      expect(notificationsService.notifyMerchant).toHaveBeenCalledWith(
        'merchant-martins',
        'account.credit',
        expect.objectContaining({
          amount: 500,
          creditAccountNumber: '0117964837',
          eventType: 'account.credit',
        }),
      );
      expect(prisma.webhookEvent.create).toHaveBeenCalled();
    });

    it('resolves the merchant via bank account when no sub-account matches', async () => {
      prisma.merchantBankAccount.findFirst.mockResolvedValue({
        merchantId: 'merchant-martins',
      });

      await service.processWebhook(creditWebhook);

      expect(notificationsService.notifyMerchant).toHaveBeenCalledWith(
        'merchant-martins',
        'account.credit',
        expect.anything(),
      );
    });

    it('does not notify when no merchant owns the credited account', async () => {
      const result = await service.processWebhook(creditWebhook);

      expect(result).toEqual({ status: 'ignored', message: 'No account owner found' });
      expect(notificationsService.notifyMerchant).not.toHaveBeenCalled();
    });
  });

  describe('account.debit (Outwards → bank transfer result)', () => {
    const debitWebhook = {
      eventType: 'account.debit',
      type: 'transfer',
      data: {
        _id: '69ca80284b70e6002412d9de',
        paymentReference: 'SHW-300326145239643',
        debitAccountNumber: '0117964837',
        debitAccountName: 'MARTINS',
        creditAccountNumber: '0117071135',
        amount: 1000,
        type: 'Outwards',
        status: 'Completed',
        responseCode: '00',
      },
    };

    it('updates the matching bank transfer and notifies the merchant', async () => {
      prisma.merchantBankTransfer.findMany.mockResolvedValue([
        {
          id: 'trx-1',
          merchantId: 'merchant-martins',
          reference: 'SHW-300326145239643',
          debitAccountNumber: '0117964837',
          status: 'PENDING',
          metadata: {},
        },
      ]);

      const result = await service.processWebhook(debitWebhook);

      expect(result).toEqual({ status: 'success', transferId: 'trx-1' });
      expect(prisma.merchantBankTransfer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'trx-1' },
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
      expect(notificationsService.notifyMerchant).toHaveBeenCalledWith(
        'merchant-martins',
        'bank_transfer.completed',
        expect.objectContaining({ status: 'COMPLETED' }),
      );
    });

    it('marks an initiated (Created) transfer as PROCESSING, not FAILED', async () => {
      prisma.merchantBankTransfer.findMany.mockResolvedValue([
        {
          id: 'trx-1',
          merchantId: 'merchant-martins',
          reference: 'SHW-300326145239643',
          debitAccountNumber: '0117964837',
          status: 'PENDING',
          metadata: {},
        },
      ]);

      const createdWebhook = {
        ...debitWebhook,
        data: { ...debitWebhook.data, status: 'Created', responseCode: null },
      };

      const result = await service.processWebhook(createdWebhook);

      expect(result).toEqual({ status: 'success', transferId: 'trx-1' });
      expect(prisma.merchantBankTransfer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'trx-1' },
          data: expect.objectContaining({ status: 'PROCESSING' }),
        }),
      );
    });
  });

  describe('account.debit (Inwards → merchant debit notification)', () => {
    it('resolves the merchant via sub-account and notifies account.debit', async () => {
      const debitWebhook = {
        eventType: 'account.debit',
        data: {
          paymentReference: 'SHW-300326145239644',
          debitAccountNumber: '0117964837',
          debitAccountName: 'MARTINS',
          amount: 250,
          type: 'Inwards',
          status: 'Completed',
        },
      };

      prisma.merchantSubAccount.findFirst.mockResolvedValue(merchantSubAccount);

      const result = await service.processWebhook(debitWebhook);

      expect(result).toEqual({ status: 'success', merchantId: 'merchant-martins' });
      expect(notificationsService.notifyMerchant).toHaveBeenCalledWith(
        'merchant-martins',
        'account.debit',
        expect.objectContaining({ amount: 250, eventType: 'account.debit', status: 'COMPLETED' }),
      );
    });
  });

  describe('account.credit (sub-account deposit)', () => {
    it('notifies the merchant when money lands in a sub-account', async () => {
      const subAccountCredit = {
        eventType: 'account.credit',
        type: 'transfer',
        data: {
          destinationAccountNumber: '0117964837',
          creditAccountNumber: '0117964837',
          creditAccountName: 'MARTINS',
          debitAccountNumber: '0114012524',
          debitAccountName: 'SENDER',
          amount: 700,
          paymentReference: 'SHW-INFLOW-1',
          status: 'Completed',
        },
      };

      prisma.merchantSubAccount.findFirst.mockResolvedValue(merchantSubAccount);

      const result = await service.processWebhook(subAccountCredit);

      expect(result).toEqual({ status: 'success', merchantId: 'merchant-martins' });
      expect(notificationsService.notifyMerchant).toHaveBeenCalledWith(
        'merchant-martins',
        'account.credit',
        expect.objectContaining({
          amount: 700,
          creditAccountNumber: '0117964837',
        }),
      );
    });
  });

  describe('virtualAccount.transfer', () => {
    it('still routes via type discriminator when eventType is absent', async () => {
      const vaWebhook = {
        type: 'virtualAccount.transfer',
        data: {
          _id: '65b76ed3c0a4440024e45e75',
          virtualAccount: '65b76ebbc0a4440024e45e52',
          paymentReference: '999240240129092434550231308787',
          creditAccountNumber: '8060376145',
          creditAccountName: 'MARTINS',
          debitAccountNumber: '0119536306',
          amount: 100,
          status: 'Completed',
        },
      };

      prisma.onrampTransaction.findFirst.mockResolvedValue({
        id: 'onramp-1',
        reference: '999240240129092434550231308787',
        userId: 'u-1',
        status: 'PENDING',
        amount: 100,
        depositAccount: { bankCode: '090267', accountNumber: '2041363986' },
      });
      prisma.onrampTransaction.update.mockResolvedValue({ id: 'onramp-1', status: 'PROCESSING' });

      await service.processWebhook(vaWebhook);

      expect(prisma.webhookEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provider: 'safehaven',
            eventType: 'virtualAccount.transfer',
          }),
        }),
      );
    });
  });
});
