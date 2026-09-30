import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ChainRegistryService } from './chain-registry.service';
import { PrismaService } from '../../database/prisma.service';

describe('ChainRegistryService', () => {
  let service: ChainRegistryService;
  let prisma: { chain: { findMany: jest.Mock; findUnique: jest.Mock } };

  const stellarChain = {
    id: 'chain-stellar',
    name: 'stellar',
    chainType: 'STELLAR',
    cctpDomain: 27,
    usdcAddress: 'GISSUER',
    cctpForwarderAddress: 'CFORWARDER',
    isActive: true,
  };

  beforeEach(async () => {
    prisma = { chain: { findMany: jest.fn(), findUnique: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ChainRegistryService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ChainRegistryService);
  });

  describe('findAll', () => {
    it('lists all chains, optionally filtering to active only', async () => {
      prisma.chain.findMany.mockResolvedValue([stellarChain]);

      await service.findAll({ activeOnly: true });
      expect(prisma.chain.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findByName', () => {
    it('returns the chain when active', async () => {
      prisma.chain.findUnique.mockResolvedValue(stellarChain);
      await expect(service.findByName('stellar')).resolves.toEqual(stellarChain);
    });

    it('throws NotFoundException when missing', async () => {
      prisma.chain.findUnique.mockResolvedValue(null);
      await expect(service.findByName('unknown')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when inactive', async () => {
      prisma.chain.findUnique.mockResolvedValue({ ...stellarChain, isActive: false });
      await expect(service.findByName('stellar')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByCctpDomain', () => {
    it('returns the chain for a known domain', async () => {
      prisma.chain.findUnique.mockResolvedValue(stellarChain);
      await expect(service.findByCctpDomain(27)).resolves.toEqual(stellarChain);
    });

    it('throws NotFoundException for an unknown domain', async () => {
      prisma.chain.findUnique.mockResolvedValue(null);
      await expect(service.findByCctpDomain(999)).rejects.toThrow(NotFoundException);
    });
  });
});
