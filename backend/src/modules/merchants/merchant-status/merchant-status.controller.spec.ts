import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { MerchantStatusController } from './merchant-status.controller';
import { PrismaService } from '../../../database/prisma.service';
import { MerchantBankService } from '../bank/merchant-bank.service';

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: jest.fn().mockImplementation(() => ({})),
}));

describe('MerchantStatusController', () => {
  let controller: MerchantStatusController;
  let prisma: { merchant: any };

  const mockPrisma = {
    merchant: {
      findUnique: jest.fn(),
    },
  };

  const mockMerchantBankService = {
    getWebhookLogs: jest.fn(),
    getWebhookLogDetail: jest.fn(),
    retryWebhookLog: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MerchantStatusController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MerchantBankService, useValue: mockMerchantBankService },
      ],
    }).compile();

    controller = module.get<MerchantStatusController>(MerchantStatusController);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('status', () => {
    it('should return merchant status with record', async () => {
      prisma.merchant.findUnique.mockResolvedValue({
        id: 'merchant-1',
        status: 'VERIFIED',
      });

      const result = await controller.status({
        id: 'user-1',
        isMerchant: true,
      });

      expect(result.isMerchant).toBe(true);
      expect(result.hasMerchantRecord).toBe(true);
      expect(result.onboardingStaus).toBe('VERIFIED');
      expect(result.merchantId).toBe('merchant-1');
    });

    it('should return status when no merchant record exists', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      const result = await controller.status({
        id: 'user-1',
        isMerchant: false,
      });

      expect(result.isMerchant).toBe(false);
      expect(result.hasMerchantRecord).toBe(false);
      expect(result.merchantId).toBeNull();
    });

    it('should handle missing user gracefully', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      const result = await controller.status(undefined);

      expect(result.isMerchant).toBeUndefined();
      expect(result.hasMerchantRecord).toBe(false);
    });
  });

  describe('onboarded', () => {
    it('should return completed onboarding when all steps done', async () => {
      prisma.merchant.findUnique.mockResolvedValue({
        id: 'merchant-1',
        user: {
          bankAccounts: [{ id: 'ba-1' }],
        },
        documentations: [{ id: 'doc-1' }],
        directors: [{ id: 'dir-1' }],
        shareholders: [{ id: 'sh-1' }],
      });

      const result = await controller.onboarded({ id: 'user-1' });

      expect(result.completed).toBe(true);
      expect(result.detailsSubmitted).toBe(true);
      expect(result.documentationsSubmitted).toBe(true);
      expect(result.directorsSubmitted).toBe(true);
      expect(result.shareholdersSubmitted).toBe(true);
      expect(result.bankAccountSubmitted).toBe(true);
    });

    it('should return incomplete when steps are missing', async () => {
      prisma.merchant.findUnique.mockResolvedValue({
        id: 'merchant-1',
        user: { bankAccounts: [] },
        documentations: [],
        directors: [{ id: 'dir-1' }],
        shareholders: [{ id: 'sh-1' }],
      });

      const result = await controller.onboarded({ id: 'user-1' });

      expect(result.completed).toBe(false);
      expect(result.documentationsSubmitted).toBe(false);
      expect(result.bankAccountSubmitted).toBe(false);
    });

    it('should return all false when no merchant record', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      const result = await controller.onboarded({ id: 'user-1' });

      expect(result.completed).toBe(false);
      expect(result.detailsSubmitted).toBe(false);
      expect(result.merchantId).toBeNull();
    });
  });
});
