import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CorridorService } from './corridor.service';
import { PrismaService } from '../../database/prisma.service';

describe('CorridorService', () => {
  let service: CorridorService;
  let prisma: {
    corridor: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const corridor = {
    id: 'corridor-1',
    countryCode: 'NG',
    fiatCurrency: 'NGN',
    stablecoinCode: 'CNGN',
    stablecoinIssuer: 'GISSUER',
    rampProcessorProvider: 'flint',
    licensingStatus: 'PARTNERED',
    isActive: true,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      corridor: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CorridorService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(CorridorService);
  });

  describe('create', () => {
    it('creates a corridor when none exists for the country/fiat pair', async () => {
      prisma.corridor.findUnique.mockResolvedValue(null);
      prisma.corridor.create.mockResolvedValue(corridor);

      const result = await service.create(corridor as any);

      expect(prisma.corridor.create).toHaveBeenCalledWith({ data: corridor });
      expect(result).toEqual(corridor);
    });

    it('throws ConflictException when a corridor already exists for the pair', async () => {
      prisma.corridor.findUnique.mockResolvedValue(corridor);

      await expect(service.create(corridor as any)).rejects.toThrow(ConflictException);
      expect(prisma.corridor.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('lists all corridors when activeOnly is not set', async () => {
      prisma.corridor.findMany.mockResolvedValue([corridor]);

      const result = await service.findAll();

      expect(prisma.corridor.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: [{ countryCode: 'asc' }, { fiatCurrency: 'asc' }],
      });
      expect(result).toEqual([corridor]);
    });

    it('filters to active corridors when activeOnly is true', async () => {
      prisma.corridor.findMany.mockResolvedValue([corridor]);

      await service.findAll({ activeOnly: true });

      expect(prisma.corridor.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ countryCode: 'asc' }, { fiatCurrency: 'asc' }],
      });
    });
  });

  describe('findOne', () => {
    it('returns the corridor when found', async () => {
      prisma.corridor.findUnique.mockResolvedValue(corridor);

      const result = await service.findOne('corridor-1');

      expect(result).toEqual(corridor);
    });

    it('throws NotFoundException when missing', async () => {
      prisma.corridor.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolve', () => {
    it('returns the corridor when active', async () => {
      prisma.corridor.findUnique.mockResolvedValue(corridor);

      const result = await service.resolve('NG', 'NGN');

      expect(prisma.corridor.findUnique).toHaveBeenCalledWith({
        where: { countryCode_fiatCurrency: { countryCode: 'NG', fiatCurrency: 'NGN' } },
      });
      expect(result).toEqual(corridor);
    });

    it('throws NotFoundException when no corridor exists', async () => {
      prisma.corridor.findUnique.mockResolvedValue(null);

      await expect(service.resolve('US', 'USD')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the corridor is inactive', async () => {
      prisma.corridor.findUnique.mockResolvedValue({ ...corridor, isActive: false });

      await expect(service.resolve('NG', 'NGN')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates an existing corridor', async () => {
      prisma.corridor.findUnique.mockResolvedValue(corridor);
      prisma.corridor.update.mockResolvedValue({ ...corridor, isActive: false });

      const result = await service.update('corridor-1', { isActive: false });

      expect(prisma.corridor.update).toHaveBeenCalledWith({
        where: { id: 'corridor-1' },
        data: { isActive: false },
      });
      expect(result.isActive).toBe(false);
    });

    it('throws NotFoundException when the corridor does not exist', async () => {
      prisma.corridor.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { isActive: false })).rejects.toThrow(NotFoundException);
      expect(prisma.corridor.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an existing corridor', async () => {
      prisma.corridor.findUnique.mockResolvedValue(corridor);
      prisma.corridor.delete.mockResolvedValue(corridor);

      const result = await service.remove('corridor-1');

      expect(prisma.corridor.delete).toHaveBeenCalledWith({ where: { id: 'corridor-1' } });
      expect(result).toEqual(corridor);
    });

    it('throws NotFoundException when the corridor does not exist', async () => {
      prisma.corridor.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
      expect(prisma.corridor.delete).not.toHaveBeenCalled();
    });
  });
});
