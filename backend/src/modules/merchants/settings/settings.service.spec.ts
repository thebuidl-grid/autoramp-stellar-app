import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: any;
  let notificationsService: any;

  const mockPrisma = {
    merchantWebhook: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    merchantSettlementAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockNotifications = {
    generateWebhookSecret: jest.fn().mockReturnValue('whsec_test123'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
    prisma = module.get(PrismaService);
    notificationsService = module.get(NotificationsService);

    jest.clearAllMocks();
  });

  describe('getWebhooks', () => {
    it('should return all webhooks for a merchant', async () => {
      prisma.merchantWebhook.findMany.mockResolvedValue([
        { id: 'wh-1', url: 'https://example.com', secret: 'whsec_...', active: true },
      ]);

      const result = await service.getWebhooks('merchant-1');
      expect(result).toHaveLength(1);
      expect(prisma.merchantWebhook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { merchantId: 'merchant-1' } }),
      );
    });
  });

  describe('addWebhook', () => {
    it('should create a new webhook with auto-generated secret', async () => {
      prisma.merchantWebhook.findFirst.mockResolvedValue(null);
      prisma.merchantWebhook.create.mockResolvedValue({
        id: 'wh-1',
        url: 'https://new-webhook.example.com',
        secret: 'whsec_test123',
        active: true,
        label: null,
        createdAt: new Date(),
      });

      const result = await service.addWebhook('merchant-1', {
        url: 'https://new-webhook.example.com',
      });

      expect(result.url).toBe('https://new-webhook.example.com');
      expect(result.secret).toBe('whsec_test123');
      expect(notificationsService.generateWebhookSecret).toHaveBeenCalled();
    });

    it('should throw ConflictException for duplicate URL', async () => {
      prisma.merchantWebhook.findFirst.mockResolvedValue({
        id: 'existing',
        url: 'https://dup.example.com',
      });

      await expect(
        service.addWebhook('merchant-1', { url: 'https://dup.example.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteWebhook', () => {
    it('should delete a webhook', async () => {
      prisma.merchantWebhook.findFirst.mockResolvedValue({ id: 'wh-1' });
      prisma.merchantWebhook.delete.mockResolvedValue({});

      const result = await service.deleteWebhook('merchant-1', 'wh-1');
      expect(result).toEqual({ deleted: true });
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.merchantWebhook.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteWebhook('merchant-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rotateWebhookSecret', () => {
    it('should generate a new secret', async () => {
      prisma.merchantWebhook.findFirst.mockResolvedValue({ id: 'wh-1' });
      prisma.merchantWebhook.update.mockResolvedValue({});

      const result = await service.rotateWebhookSecret('merchant-1', 'wh-1');
      expect(result.secret).toBe('whsec_test123');
    });
  });

  describe('getCallbackUrl', () => {
    it('should return first active webhook URL', async () => {
      prisma.merchantWebhook.findFirst.mockResolvedValue({
        url: 'https://active.example.com',
      });

      const result = await service.getCallbackUrl('merchant-1');
      expect(result).toBe('https://active.example.com');
    });

    it('should return null if no active webhooks', async () => {
      prisma.merchantWebhook.findFirst.mockResolvedValue(null);

      const result = await service.getCallbackUrl('merchant-1');
      expect(result).toBeNull();
    });
  });

  describe('getSettlementAccount', () => {
    it('should return settlement account', async () => {
      prisma.merchantSettlementAccount.findUnique.mockResolvedValue({
        id: 'sa-1',
        merchantId: 'merchant-1',
        bankCode: '011',
        accountNumber: '1234567890',
      });

      const result = await service.getSettlementAccount('merchant-1');
      expect(result.bankCode).toBe('011');
    });
  });
});
