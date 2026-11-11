import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MerchantBankService } from './merchant-bank.service';
import { PrismaService } from '../../../database/prisma.service';
import { FiatProviderService } from '../../providers/fiat-provider.service';
import { AuditService } from '../../../common/services/audit.service';
import { BalanceCacheService } from '../../../common/services/balance-cache.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProviderType } from '../../providers/provider-type.enum';

describe('MerchantBankService', () => {
  let service: MerchantBankService;
  let prisma: { merchant: any; merchantSubAccount: any; merchantBankAccount: any; merchantApiRequestLog: any; merchantWebhookLog: any; merchantBankTransfer: any; transactionFee: any };
  let fiatProvider: {
    getSubAccount: jest.Mock;
    createAccount: jest.Mock;
    createVirtualAccount: jest.Mock;
    nameEnquiry: jest.Mock;
    transfer: jest.Mock;
    getBanks: jest.Mock;
    getTransfers: jest.Mock;
    initiateVerification: jest.Mock;
    validateVerification: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let settingsService: { getCallbackUrl: jest.Mock };

  const verifiedMerchant = {
    id: 'merchant-1',
    status: 'VERIFIED',
    userId: 'user-1',
    bankAccount: {
      bankCode: '090286',
      accountNumber: '1000000001',
      accountName: 'ACME Corp',
      bankName: 'Safe Haven MFB',
      fiatProvider: ProviderType.SAFEHAVEN,
      metadata: { _id: 'sh-merchant-1' },
      pulseMfbDetails: { _id: 'sh-merchant-1' },
    },
  };

  const mockPrisma = {
    merchant: {
      findUnique: jest.fn(),
    },
    merchantBankAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    merchantSubAccount: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    merchantOnrampTransaction: {
      findMany: jest.fn(),
    },
    merchantOfframpTransaction: {
      findMany: jest.fn(),
    },
    merchantSwapTransaction: {
      findMany: jest.fn(),
    },
    merchantApiRequestLog: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    merchantBankTransfer: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    transactionFee: {
      findMany: jest.fn(),
    },
    merchantWebhookLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    virtualAccount: {
      create: jest.fn(),
    },
  };

  const mockFiatProvider = {
    getSubAccount: jest.fn(),
    createAccount: jest.fn(),
    createVirtualAccount: jest.fn(),
    nameEnquiry: jest.fn(),
    transfer: jest.fn(),
    getBanks: jest.fn(),
    getTransfers: jest.fn(),
    initiateVerification: jest.fn(),
    validateVerification: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  const mockSettingsService = {
    getCallbackUrl: jest.fn().mockResolvedValue('https://webhook.example.com'),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('https://webhook.example.com'),
  };

  const mockNotificationsService = {
    retryWebhookLog: jest.fn(),
  };

  const mockBalanceCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantBankService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FiatProviderService, useValue: mockFiatProvider },
        { provide: AuditService, useValue: mockAuditService },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: BalanceCacheService, useValue: mockBalanceCacheService },
      ],
    }).compile();

    service = module.get<MerchantBankService>(MerchantBankService);
    prisma = module.get(PrismaService);
    fiatProvider = module.get(FiatProviderService);
    auditService = module.get(AuditService);
    settingsService = module.get(SettingsService);

    jest.clearAllMocks();
  });

  describe('resolveMerchantAccount (indirectly via public methods)', () => {
    it('should throw ForbiddenException if merchant not found', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.getMyAccount('nonexistent')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if merchant is not verified', async () => {
      prisma.merchant.findUnique.mockResolvedValue({
        ...verifiedMerchant,
        status: 'PENDING',
      });

      await expect(service.getMyAccount('merchant-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException if no bank account exists', async () => {
      prisma.merchant.findUnique.mockResolvedValue({
        ...verifiedMerchant,
        bankAccount: null,
      });

      await expect(service.getMyAccount('merchant-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getMyAccount', () => {
    it('should return account balance from fiat provider', async () => {
      prisma.merchant.findUnique.mockResolvedValue(verifiedMerchant);
      prisma.merchantBankAccount.findUnique.mockResolvedValue({
        metadata: {},
      });
      mockFiatProvider.getSubAccount.mockResolvedValue({
        data: {
          accountBalance: 50000,
          bookBalance: 49800,
          accountName: 'ACME Corp',
          status: 'active',
        },
      });
      prisma.merchantBankAccount.update.mockResolvedValue({});

      const result = await service.getMyAccount('merchant-1');

      expect(mockFiatProvider.getSubAccount).toHaveBeenCalledWith(
        { subAccountId: 'sh-merchant-1' },
        ProviderType.SAFEHAVEN,
      );
      expect(result.accountBalance).toBe(50000);
      expect(result.bookBalance).toBe(49800);
      expect(result.accountNumber).toBe('1000000001');
    });

    it('should return cached balance when fresh', async () => {
      prisma.merchant.findUnique.mockResolvedValue(verifiedMerchant);
      prisma.merchantBankAccount.findUnique.mockResolvedValue({
        metadata: {
          balance: { accountBalance: 12345, bookBalance: 12300, accountName: 'ACME Corp', status: 'active' },
          balanceFetchedAt: new Date().toISOString(),
        },
      });

      const result = await service.getMyAccount('merchant-1');

      expect(mockFiatProvider.getSubAccount).not.toHaveBeenCalled();
      expect(result.accountBalance).toBe(12345);
    });

    it('should throw BadRequestException if safehavenId is missing', async () => {
      prisma.merchant.findUnique.mockResolvedValue({
        ...verifiedMerchant,
        bankAccount: {
          ...verifiedMerchant.bankAccount,
          pulseMfbDetails: null,
          metadata: {},
        },
      });

      await expect(service.getMyAccount('merchant-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('createSubAccount', () => {
    const subAccountDto = {
      phoneNumber: '08012345678',
      emailAddress: 'user@example.com',
      externalReference: 'ref-1',
      identityType: 'BVN' as const,
      identityNumber: '22222222222',
    };

    it('should create sub-account and persist to DB', async () => {
      prisma.merchant.findUnique
        .mockResolvedValueOnce(verifiedMerchant)
        .mockResolvedValueOnce({ id: 'merchant-1' });
      mockSettingsService.getCallbackUrl.mockResolvedValue('https://webhook.example.com');
      mockFiatProvider.createAccount.mockResolvedValue({
        data: {
          _id: 'sh-sub-1',
          accountNumber: '2000000001',
          accountName: 'Jane Doe',
          bankCode: '090286',
          bankName: 'MFB MFB',
        },
      });
      prisma.merchantSubAccount.findFirst.mockResolvedValue(null);
      prisma.merchantSubAccount.create.mockResolvedValue({
        id: 'db-sub-1',
        accountNumber: '2000000001',
      });

      const result = await service.createSubAccount('merchant-1', subAccountDto);

      expect(mockFiatProvider.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          phoneNumber: '08012345678',
          emailAddress: 'user@example.com',
        }),
        ProviderType.SAFEHAVEN,
      );
      expect(prisma.merchantSubAccount.create).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 'merchant-1',
          action: 'create_sub_account',
          success: true,
        }),
      );
      expect(result).toBeDefined();
    });

    it('should not persist if response has no accountNumber', async () => {
      prisma.merchant.findUnique
        .mockResolvedValueOnce(verifiedMerchant)
        .mockResolvedValueOnce({ id: 'merchant-1' });
      mockSettingsService.getCallbackUrl.mockResolvedValue(null);
      mockFiatProvider.createAccount.mockResolvedValue({
        data: { message: 'Pending verification' },
      });

      await service.createSubAccount('merchant-1', subAccountDto);

      expect(prisma.merchantSubAccount.create).not.toHaveBeenCalled();
    });

    it('should log audit on failure', async () => {
      prisma.merchant.findUnique
        .mockResolvedValueOnce(verifiedMerchant)
        .mockResolvedValueOnce({ id: 'merchant-1' });
      mockSettingsService.getCallbackUrl.mockResolvedValue(null);
      const error = new Error('Provider error');
      (error as any).status = 500;
      mockFiatProvider.createAccount.mockRejectedValue(error);

      await expect(
        service.createSubAccount('merchant-1', subAccountDto),
      ).rejects.toThrow('Provider error');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 'merchant-1',
          action: 'create_sub_account',
          success: false,
        }),
      );
    });
  });

  describe('transfer', () => {
    const transferDto = {
      beneficiaryBankCode: '011',
      beneficiaryAccountNumber: '0123456789',
      amount: 5000,
      narration: 'Test transfer',
      paymentReference: 'ref-tx-1',
      saveBeneficiary: false,
    };

    it('should transfer from own account by default', async () => {
      prisma.merchant.findUnique.mockResolvedValue(verifiedMerchant);
      prisma.merchantBankTransfer.create.mockResolvedValue({});
      mockFiatProvider.transfer.mockResolvedValue({ status: 'success' });

      await service.transfer('merchant-1', transferDto);

      expect(mockFiatProvider.transfer).toHaveBeenCalledWith(
        expect.objectContaining({
          debitAccountNumber: '1000000001',
          amount: 5000,
          beneficiaryBankCode: '011',
        }),
        ProviderType.SAFEHAVEN,
      );
    });

    it('should transfer from a sub-account if specified and owned', async () => {
      prisma.merchant.findUnique.mockResolvedValue(verifiedMerchant);
      prisma.merchantBankTransfer.create.mockResolvedValue({});
      prisma.merchantSubAccount.findFirst.mockResolvedValue({
        accountNumber: '2000000001',
      });
      mockFiatProvider.transfer.mockResolvedValue({ status: 'success' });

      await service.transfer('merchant-1', {
        ...transferDto,
        debitAccountNumber: '2000000001',
      });

      expect(mockFiatProvider.transfer).toHaveBeenCalledWith(
        expect.objectContaining({
          debitAccountNumber: '2000000001',
        }),
        ProviderType.SAFEHAVEN,
      );
    });

    it('should throw BadRequestException if debit account is not owned', async () => {
      prisma.merchant.findUnique.mockResolvedValue(verifiedMerchant);
      prisma.merchantSubAccount.findFirst.mockResolvedValue(null);

      await expect(
        service.transfer('merchant-1', {
          ...transferDto,
          debitAccountNumber: '9999999999',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockFiatProvider.transfer).not.toHaveBeenCalled();
    });

    it('should reject debit from another merchant\u2019s sub-account', async () => {
      prisma.merchant.findUnique.mockResolvedValue(verifiedMerchant);
      // Sub-account "2000000002" exists in the DB but belongs to merchant-2,
      // so a lookup scoped to merchant-1 returns nothing.
      prisma.merchantSubAccount.findFirst.mockImplementation(
        async (args: any) => {
          if (
            args?.where?.merchantId === 'merchant-1' &&
            args?.where?.accountNumber === '2000000002'
          ) {
            return null;
          }
          return { accountNumber: '2000000002', merchantId: 'merchant-2' };
        },
      );

      await expect(
        service.transfer('merchant-1', {
          ...transferDto,
          debitAccountNumber: '2000000002',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.merchantSubAccount.findFirst).toHaveBeenCalledWith({
        where: { merchantId: 'merchant-1', accountNumber: '2000000002' },
      });
      expect(mockFiatProvider.transfer).not.toHaveBeenCalled();
      expect(prisma.merchantBankTransfer.create).not.toHaveBeenCalled();
    });

    it('should scope the sub-account lookup by merchantId', async () => {
      prisma.merchant.findUnique.mockResolvedValue(verifiedMerchant);
      prisma.merchantBankTransfer.create.mockResolvedValue({});
      prisma.merchantSubAccount.findFirst.mockResolvedValue({
        accountNumber: '2000000001',
      });
      mockFiatProvider.transfer.mockResolvedValue({ status: 'success' });

      await service.transfer('merchant-1', {
        ...transferDto,
        debitAccountNumber: '2000000001',
      });

      expect(prisma.merchantSubAccount.findFirst).toHaveBeenCalledWith({
        where: { merchantId: 'merchant-1', accountNumber: '2000000001' },
      });
      expect(mockFiatProvider.transfer).toHaveBeenCalledWith(
        expect.objectContaining({ debitAccountNumber: '2000000001' }),
        ProviderType.SAFEHAVEN,
      );
    });
  });

  describe('createVirtualAccount', () => {
    it('should create virtual account using merchant SafeHaven account as settlement', async () => {
      prisma.merchant.findUnique.mockResolvedValue(verifiedMerchant);
      mockFiatProvider.createVirtualAccount.mockResolvedValue({
        data: { accountNumber: '3000000001' },
      });

      await service.createVirtualAccount('merchant-1', {
        amount: 5000,
        validFor: 1800,
        callbackUrl: 'https://webhook.example.com',
      });

      expect(mockFiatProvider.createVirtualAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 5000,
          bankCode: '090286',
          accountNumber: '1000000001',
          callbackUrl: 'https://webhook.example.com',
        }),
      );
    });

    it('should default amountControl to OverPayment', async () => {
      prisma.merchant.findUnique.mockResolvedValue(verifiedMerchant);
      mockFiatProvider.createVirtualAccount.mockResolvedValue({});

      await service.createVirtualAccount('merchant-1', { amount: 1000 });

      expect(mockFiatProvider.createVirtualAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          amountControl: 'OverPayment',
        }),
      );
    });
  });

  describe('nameEnquiry', () => {
    it('should proxy to fiat provider name enquiry', async () => {
      mockFiatProvider.nameEnquiry.mockResolvedValue({
        data: { accountName: 'JOHN DOE' },
      });

      await service.nameEnquiry('merchant-id', { bankCode: '011', accountNumber: '1234567890' });

      expect(mockFiatProvider.nameEnquiry).toHaveBeenCalledWith({
        bankCode: '011',
        accountNumber: '1234567890',
      });
    });
  });

  describe('getBanks', () => {
    it('should return mapped bank list', async () => {
      mockFiatProvider.getBanks.mockResolvedValue({
        data: [
          { bankCode: '011', name: 'First Bank' },
          { bankCode: '044', name: 'Access Bank' },
        ],
      });

      const result = await service.getBanks();

      expect(result).toEqual([
        { institutionCode: '011', institutionName: 'First Bank' },
        { institutionCode: '044', institutionName: 'Access Bank' },
      ]);
    });

    it('should return empty array if no data', async () => {
      mockFiatProvider.getBanks.mockResolvedValue({});

      const result = await service.getBanks();

      expect(result).toEqual([]);
    });
  });

  describe('getSubAccounts', () => {
    it('should return list of merchant sub-accounts', async () => {
      prisma.merchant.findUnique.mockResolvedValue(verifiedMerchant);
      prisma.merchantSubAccount.findMany.mockResolvedValue([
        {
          id: 'db-1',
          safehavenId: 'sh-1',
          bankCode: '090286',
          accountNumber: '2000000001',
          accountName: 'Sub 1',
          bankName: 'MFB',
          createdAt: new Date(),
        },
      ]);

      const result = await service.getSubAccounts('merchant-1');

      expect(result).toHaveLength(1);
      expect(result[0].accountNumber).toBe('2000000001');
    });
  });

  describe('getSubAccount', () => {
    it('should return live balance for a single sub-account', async () => {
      prisma.merchant.findUnique.mockResolvedValue(verifiedMerchant);
      prisma.merchantSubAccount.findFirst.mockResolvedValue({
        id: 'db-1',
        safehavenId: 'sh-1',
        metadata: {},
        bankCode: '090286',
        accountNumber: '2000000001',
        accountName: 'Sub 1',
      });
      mockFiatProvider.getSubAccount.mockResolvedValue({
        data: { accountBalance: 10000, bookBalance: 9900, status: 'active' },
      });

      const result = await service.getSubAccount('merchant-1', 'db-1');

      expect(mockFiatProvider.getSubAccount).toHaveBeenCalledWith(
        { subAccountId: 'sh-1' },
        ProviderType.SAFEHAVEN,
      );
      expect(result.accountBalance).toBe(10000);
      expect(result.accountNumber).toBe('2000000001');
    });

    it('should throw BadRequestException if sub-account not found', async () => {
      prisma.merchant.findUnique.mockResolvedValue(verifiedMerchant);
      prisma.merchantSubAccount.findFirst.mockResolvedValue(null);

      await expect(
        service.getSubAccount('merchant-1', 'nonexistent'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTransfers', () => {
    it('should query MerchantBankTransfer by merchantId and include fees', async () => {
      const mockTransfers = [
        {
          id: 't1',
          reference: 'ref-1',
          amount: { toNumber: () => 5000 },
          currency: 'NGN',
          beneficiaryBankCode: '000011',
          beneficiaryAccountNumber: '1234567890',
          beneficiaryAccountName: 'John Doe',
          narration: 'Payment',
          status: 'COMPLETED',
          createdAt: new Date('2026-07-01'),
          completedAt: new Date('2026-07-01'),
        },
      ];
      const mockFees = [
        {
          id: 'f1',
          transactionId: 't1',
          feeAmount: { toNumber: () => 50 },
          feeType: 'platform_fee',
          feeCurrency: 'NGN',
        },
      ];
      prisma.merchantBankTransfer.findMany.mockResolvedValue(mockTransfers);
      prisma.merchantBankTransfer.count.mockResolvedValue(1);
      prisma.transactionFee.findMany.mockResolvedValue(mockFees);

      const result = await service.getTransfers('merchant-1', { page: 1, limit: 10 });

      expect(prisma.merchantBankTransfer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { merchantId: 'merchant-1' },
          skip: 0,
          take: 10,
        }),
      );
      expect(prisma.transactionFee.findMany).toHaveBeenCalledWith({
        where: {
          transactionId: { in: ['t1'] },
          transactionType: 'bank_transfer',
        },
      });
      expect(result).toEqual({
        data: [
          expect.objectContaining({
            id: 't1',
            amount: 5000,
            fees: [{ id: 'f1', feeAmount: 50, feeType: 'platform_fee', feeCurrency: 'NGN' }],
            totalFees: 50,
            netAmount: 4950,
          }),
        ],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      });
    });
  });

  describe('identity verification', () => {
    it('should initiate verification with merchant debit account', async () => {
      prisma.merchant.findUnique.mockResolvedValue(verifiedMerchant);
      mockFiatProvider.initiateVerification.mockResolvedValue({
        data: { _id: 'identity-1' },
      });

      await service.initiateVerification('merchant-1', {
        type: 'BVN',
        number: '22222222222',
      });

      expect(mockFiatProvider.initiateVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'BVN',
          number: '22222222222',
          debitAccountNumber: '1000000001',
        }),
        ProviderType.SAFEHAVEN,
      );
    });

    it('should validate verification via fiat provider', async () => {
      prisma.merchant.findUnique.mockResolvedValue(verifiedMerchant);
      mockFiatProvider.validateVerification.mockResolvedValue({
        data: { validated: true },
      });

      await service.validateVerification('merchant-1', {
        identityId: 'identity-1',
        type: 'BVN',
        otp: '123456',
      });

      expect(mockFiatProvider.validateVerification).toHaveBeenCalledWith(
        {
          identityId: 'identity-1',
          type: 'BVN',
          otp: '123456',
        },
        ProviderType.SAFEHAVEN,
      );
    });
  });

  describe('getStats', () => {
    it('should return usage stats and money moved', async () => {
      prisma.merchant.findUnique.mockResolvedValue(verifiedMerchant);
      prisma.merchantOnrampTransaction.findMany.mockResolvedValue([
        { id: 'on-1', amount: 1000, status: 'COMPLETED', createdAt: new Date() },
        { id: 'on-2', amount: 500, status: 'COMPLETED', createdAt: new Date() },
      ]);
      prisma.merchantOfframpTransaction.findMany.mockResolvedValue([
        { id: 'off-1', fiatAmount: 2000, status: 'COMPLETED', createdAt: new Date() },
      ]);
      prisma.merchantSwapTransaction.findMany.mockResolvedValue([
        { id: 'swap-1', fromAmount: 50, status: 'COMPLETED', createdAt: new Date() },
      ]);
      prisma.merchantBankTransfer.findMany.mockResolvedValue([
        {
          id: 'bt-1',
          amount: 5000,
          status: 'COMPLETED',
          createdAt: new Date(),
          beneficiaryAccountNumber: '0123456789',
          beneficiaryBankCode: '011',
          narration: 'Test transfer',
        },
      ]);

      const result = await service.getStats('merchant-1');

      expect(result.totalRequests).toBe(5);
      expect(result.successCount).toBe(5);
      expect(result.errorCount).toBe(0);
      expect(result.transferCount).toBe(1);
      expect(result.totalMoneyMoved).toBe(5000);
      expect(result.recentTransfers).toHaveLength(1);
    });

    it('should handle empty stats', async () => {
      prisma.merchant.findUnique.mockResolvedValue(verifiedMerchant);
      prisma.merchantOnrampTransaction.findMany.mockResolvedValue([]);
      prisma.merchantOfframpTransaction.findMany.mockResolvedValue([]);
      prisma.merchantSwapTransaction.findMany.mockResolvedValue([]);
      prisma.merchantBankTransfer.findMany.mockResolvedValue([]);

      const result = await service.getStats('merchant-1');

      expect(result.totalRequests).toBe(0);
      expect(result.totalMoneyMoved).toBe(0);
      expect(result.recentTransfers).toHaveLength(0);
    });
  });
});
