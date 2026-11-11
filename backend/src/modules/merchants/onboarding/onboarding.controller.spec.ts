import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../../../database/prisma.service';

describe('OnboardingController', () => {
  let controller: OnboardingController;
  let onboardingService: { create: jest.Mock; findAll: jest.Mock; findOne: jest.Mock; update: jest.Mock; remove: jest.Mock };
  let prisma: { merchant: any };

  const mockMerchant = {
    id: 'merchant-1',
    userId: 'user-1',
    name: 'ACME Corp',
  };

  const mockPrisma = {
    merchant: {
      findUnique: jest.fn(),
    },
  };

  const mockOnboardingService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [
        { provide: OnboardingService, useValue: mockOnboardingService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get<OnboardingController>(OnboardingController);
    onboardingService = module.get(OnboardingService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create merchant and assign userId for non-admin', async () => {
      mockOnboardingService.create.mockResolvedValue(mockMerchant);

      const result = await controller.create(
        {
          name: 'ACME Corp',
          natureOfBusiness: 'Retail',
          websiteUrl: 'https://acme.com',
          userId: 'wrong-user',
        } as any,
        { id: 'user-1', role: 'USER' },
      );

      expect(onboardingService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
      );
      expect(result).toEqual(mockMerchant);
    });

    it('should not override userId for admin', async () => {
      mockOnboardingService.create.mockResolvedValue(mockMerchant);

      await controller.create(
        {
          name: 'ACME Corp',
          natureOfBusiness: 'Retail',
          websiteUrl: 'https://acme.com',
          userId: 'admin-assigned',
        } as any,
        { id: 'admin-1', role: 'ADMIN' },
      );

      expect(onboardingService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'admin-assigned' }),
      );
    });
  });

  describe('findAll', () => {
    it('should return only the current user merchants for non-admin', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);

      const result = await controller.findAll({ id: 'user-1', role: 'USER' });

      expect(result).toEqual([mockMerchant]);
    });

    it('should return all merchants for admin', async () => {
      mockOnboardingService.findAll.mockResolvedValue([mockMerchant]);

      const result = await controller.findAll({ id: 'admin-1', role: 'ADMIN' });

      expect(onboardingService.findAll).toHaveBeenCalled();
      expect(result).toEqual([mockMerchant]);
    });
  });

  describe('findOne', () => {
    it('should return merchant if owner', async () => {
      mockOnboardingService.findOne.mockResolvedValue(mockMerchant);

      const result = await controller.findOne('merchant-1', {
        id: 'user-1',
        role: 'USER',
      });

      expect(result).toEqual(mockMerchant);
    });

    it('should throw ForbiddenException if not owner', async () => {
      mockOnboardingService.findOne.mockResolvedValue(mockMerchant);

      await expect(
        controller.findOne('merchant-1', { id: 'other-user', role: 'USER' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to access any merchant', async () => {
      mockOnboardingService.findOne.mockResolvedValue(mockMerchant);

      const result = await controller.findOne('merchant-1', {
        id: 'admin-1',
        role: 'ADMIN',
      });

      expect(result).toEqual(mockMerchant);
    });
  });

  describe('update', () => {
    it('should update merchant if owner', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);
      mockOnboardingService.update.mockResolvedValue({
        ...mockMerchant,
        name: 'Updated',
      });

      const result = await controller.update(
        'merchant-1',
        { name: 'Updated' },
        { id: 'user-1', role: 'USER' },
      );

      expect(result.name).toBe('Updated');
    });

    it('should throw ForbiddenException if not owner', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);

      await expect(
        controller.update(
          'merchant-1',
          { name: 'X' },
          { id: 'other-user', role: 'USER' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete merchant if owner', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);
      mockOnboardingService.remove.mockResolvedValue(mockMerchant);

      const result = await controller.remove('merchant-1', {
        id: 'user-1',
        role: 'USER',
      });

      expect(result).toEqual(mockMerchant);
    });

    it('should throw ForbiddenException if not owner', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);

      await expect(
        controller.remove('merchant-1', { id: 'other-user', role: 'USER' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
