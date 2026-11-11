import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ShareholdersService } from './shareholders.service';
import { PrismaService } from '../../../database/prisma.service';

jest.mock('../../../utils/encryption.util', () => ({
  encrypt: jest.fn((text: string) => `encrypted_${text}`),
  decrypt: jest.fn((text: string) => text.replace('encrypted_', '')),
}));

describe('ShareholdersService', () => {
  let service: ShareholdersService;
  let prisma: { merchant: any; merchantShareholder: any };

  const mockMerchant = { id: 'merchant-1', name: 'ACME' };
  const mockShareholder = {
    id: 'sh-1',
    merchantId: 'merchant-1',
    firstName: 'Jane',
    lastName: 'Smith',
    bvn: '33333333333',
  };

  const mockPrisma = {
    merchant: { findUnique: jest.fn() },
    merchantShareholder: {
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
        ShareholdersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ShareholdersService>(ShareholdersService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a shareholder and encrypt BVN', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);
      prisma.merchantShareholder.create.mockResolvedValue({
        ...mockShareholder,
        bvn: 'encrypted_33333333333',
      });

      const result = await service.create({
        merchantId: 'merchant-1',
        firstName: 'Jane',
        lastName: 'Smith',
        bvn: '33333333333',
      });

      expect(result.bvn).toBe('33333333333');
      expect(prisma.merchantShareholder.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if merchant not found', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ merchantId: 'nonexistent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all shareholders for a merchant', async () => {
      prisma.merchantShareholder.findMany.mockResolvedValue([mockShareholder]);

      const result = await service.findAll('merchant-1');

      expect(result).toHaveLength(1);
    });

    it('should decrypt BVN in results', async () => {
      prisma.merchantShareholder.findMany.mockResolvedValue([
        { ...mockShareholder, bvn: 'encrypted_44444444444' },
      ]);

      const result = await service.findAll('merchant-1');

      expect(result[0].bvn).toBe('44444444444');
    });
  });

  describe('findOne', () => {
    it('should return a shareholder by id', async () => {
      prisma.merchantShareholder.findUnique.mockResolvedValue(mockShareholder);

      const result = await service.findOne('sh-1');

      expect(result.id).toBe('sh-1');
    });

    it('should throw NotFoundException if shareholder not found', async () => {
      prisma.merchantShareholder.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a shareholder', async () => {
      prisma.merchantShareholder.findUnique.mockResolvedValue(mockShareholder);
      prisma.merchantShareholder.update.mockResolvedValue({
        ...mockShareholder,
        firstName: 'Janet',
      });

      const result = await service.update('sh-1', { firstName: 'Janet' });

      expect(result.firstName).toBe('Janet');
    });

    it('should throw NotFoundException if shareholder not found', async () => {
      prisma.merchantShareholder.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { firstName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a shareholder', async () => {
      prisma.merchantShareholder.findUnique.mockResolvedValue(mockShareholder);
      prisma.merchantShareholder.delete.mockResolvedValue(mockShareholder);

      const result = await service.remove('sh-1');

      expect(result.id).toBe('sh-1');
    });

    it('should throw NotFoundException if shareholder not found', async () => {
      prisma.merchantShareholder.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
