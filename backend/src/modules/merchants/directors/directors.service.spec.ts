import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DirectorsService } from './directors.service';
import { PrismaService } from '../../../database/prisma.service';

jest.mock('../../../utils/encryption.util', () => ({
  encrypt: jest.fn((text: string) => `encrypted_${text}`),
  decrypt: jest.fn((text: string) => text.replace('encrypted_', '')),
}));

describe('DirectorsService', () => {
  let service: DirectorsService;
  let prisma: { merchant: any; merchantDirector: any };

  const mockMerchant = { id: 'merchant-1', name: 'ACME' };
  const mockDirector = {
    id: 'dir-1',
    merchantId: 'merchant-1',
    firstName: 'John',
    lastName: 'Doe',
    bvn: '22222222222',
  };

  const mockPrisma = {
    merchant: { findUnique: jest.fn() },
    merchantDirector: {
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
        DirectorsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DirectorsService>(DirectorsService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a director and encrypt BVN', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);
      prisma.merchantDirector.create.mockResolvedValue({
        ...mockDirector,
        bvn: 'encrypted_22222222222',
      });

      const result = await service.create({
        merchantId: 'merchant-1',
        firstName: 'John',
        lastName: 'Doe',
        bvn: '22222222222',
      });

      expect(result.bvn).toBe('22222222222');
      expect(prisma.merchantDirector.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if merchant not found', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ merchantId: 'nonexistent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all directors for a merchant', async () => {
      prisma.merchantDirector.findMany.mockResolvedValue([mockDirector]);

      const result = await service.findAll('merchant-1');

      expect(result).toHaveLength(1);
    });

    it('should decrypt BVN in results', async () => {
      prisma.merchantDirector.findMany.mockResolvedValue([
        { ...mockDirector, bvn: 'encrypted_33333333333' },
      ]);

      const result = await service.findAll('merchant-1');

      expect(result[0].bvn).toBe('33333333333');
    });
  });

  describe('findOne', () => {
    it('should return a director by id', async () => {
      prisma.merchantDirector.findUnique.mockResolvedValue(mockDirector);

      const result = await service.findOne('dir-1');

      expect(result.id).toBe('dir-1');
    });

    it('should throw NotFoundException if director not found', async () => {
      prisma.merchantDirector.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a director', async () => {
      prisma.merchantDirector.findUnique.mockResolvedValue(mockDirector);
      prisma.merchantDirector.update.mockResolvedValue({
        ...mockDirector,
        firstName: 'Jane',
      });

      const result = await service.update('dir-1', { firstName: 'Jane' });

      expect(result.firstName).toBe('Jane');
    });

    it('should throw NotFoundException if director not found', async () => {
      prisma.merchantDirector.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { firstName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a director', async () => {
      prisma.merchantDirector.findUnique.mockResolvedValue(mockDirector);
      prisma.merchantDirector.delete.mockResolvedValue(mockDirector);

      const result = await service.remove('dir-1');

      expect(result.id).toBe('dir-1');
    });

    it('should throw NotFoundException if director not found', async () => {
      prisma.merchantDirector.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
