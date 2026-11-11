import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { PrismaService } from '../../../database/prisma.service';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let prisma: { merchant: any; merchantApiKey: any };

  const mockMerchant = { id: 'merchant-1', name: 'ACME' };

  const mockPrisma = {
    merchant: {
      findUnique: jest.fn(),
    },
    merchantApiKey: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should generate an API key with raw key returned once', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);
      prisma.merchantApiKey.create.mockResolvedValue({
        id: 'key-1',
        merchantId: 'merchant-1',
        keyPrefix: 'sk_live_',
        name: 'Test Key',
        isActive: true,
        createdAt: new Date(),
        expiresAt: null,
        metadata: {},
      });

      const result = await service.create({
        merchantId: 'merchant-1',
        name: 'Test Key',
      });

      expect(result.key).toMatch(/^sk_live_/);
      expect(result.message).toContain('save this API key');
      expect(prisma.merchantApiKey.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if merchant not found', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ merchantId: 'nonexistent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all API keys for a merchant', async () => {
      prisma.merchantApiKey.findMany.mockResolvedValue([
        { id: 'key-1', keyPrefix: 'sk_live_', name: 'Key 1' },
      ]);

      const result = await service.findAll('merchant-1');

      expect(result).toHaveLength(1);
    });

    it('should return all keys when no merchantId', async () => {
      prisma.merchantApiKey.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return an API key by id', async () => {
      prisma.merchantApiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        keyPrefix: 'sk_live_',
      });

      const result = await service.findOne('key-1');

      expect(result.id).toBe('key-1');
    });

    it('should throw NotFoundException if key not found', async () => {
      prisma.merchantApiKey.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update an API key', async () => {
      prisma.merchantApiKey.findUnique.mockResolvedValue({ id: 'key-1' });
      prisma.merchantApiKey.update.mockResolvedValue({
        id: 'key-1',
        name: 'Updated',
      });

      const result = await service.update('key-1', { name: 'Updated' });

      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException if key not found', async () => {
      prisma.merchantApiKey.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete an API key', async () => {
      prisma.merchantApiKey.findUnique.mockResolvedValue({ id: 'key-1' });
      prisma.merchantApiKey.delete.mockResolvedValue({ id: 'key-1' });

      const result = await service.remove('key-1');

      expect(result.id).toBe('key-1');
    });

    it('should throw NotFoundException if key not found', async () => {
      prisma.merchantApiKey.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
