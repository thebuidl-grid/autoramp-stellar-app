import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../../../database/prisma.service';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let prisma: { merchant: any };

  const mockMerchant = {
    id: 'merchant-1',
    userId: 'user-1',
    name: 'ACME Corp',
    natureOfBusiness: 'Retail',
    websiteUrl: 'https://acme.com',
    status: 'PENDING',
  };

  const mockPrisma = {
    merchant: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a merchant successfully', async () => {
      prisma.merchant.findFirst.mockResolvedValue(null);
      prisma.merchant.create.mockResolvedValue(mockMerchant);

      const result = await service.create({
        userId: 'user-1',
        name: 'ACME Corp',
        natureOfBusiness: 'Retail',
        websiteUrl: 'https://acme.com',
      });

      expect(prisma.merchant.create).toHaveBeenCalled();
      expect(result).toEqual(mockMerchant);
    });

    it('should throw ConflictException for duplicate merchant', async () => {
      prisma.merchant.findFirst.mockResolvedValue(mockMerchant);

      await expect(
        service.create({
          userId: 'user-1',
          name: 'ACME Corp',
          natureOfBusiness: 'Retail',
          websiteUrl: 'https://acme.com',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return all merchants', async () => {
      prisma.merchant.findMany.mockResolvedValue([mockMerchant]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockMerchant);
    });
  });

  describe('findOne', () => {
    it('should return a merchant by id', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);

      const result = await service.findOne('merchant-1');

      expect(result).toEqual(mockMerchant);
    });

    it('should throw NotFoundException if merchant not found', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a merchant', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);
      prisma.merchant.update.mockResolvedValue({
        ...mockMerchant,
        name: 'Updated Corp',
      });

      const result = await service.update('merchant-1', {
        name: 'Updated Corp',
      });

      expect(result.name).toBe('Updated Corp');
    });

    it('should throw NotFoundException if merchant not found', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a merchant', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);
      prisma.merchant.delete.mockResolvedValue(mockMerchant);

      const result = await service.remove('merchant-1');

      expect(result).toEqual(mockMerchant);
    });

    it('should throw NotFoundException if merchant not found', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
