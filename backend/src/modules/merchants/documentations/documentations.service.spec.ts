import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DocumentationsService } from './documentations.service';
import { PrismaService } from '../../../database/prisma.service';

describe('DocumentationsService', () => {
  let service: DocumentationsService;
  let prisma: { merchant: any; merchantDocumentation: any };

  const mockMerchant = { id: 'merchant-1', name: 'ACME' };
  const mockDoc = {
    id: 'doc-1',
    merchantId: 'merchant-1',
    cacCertificate: 'https://example.com/cac.pdf',
    tradingName: 'ACME Corp',
  };

  const mockPrisma = {
    merchant: { findUnique: jest.fn() },
    merchantDocumentation: {
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
        DocumentationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DocumentationsService>(DocumentationsService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create documentation', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchant);
      prisma.merchantDocumentation.create.mockResolvedValue(mockDoc);

      const result = await service.create({
        merchantId: 'merchant-1',
        cacCertificate: 'https://example.com/cac.pdf',
      });

      expect(result).toEqual(mockDoc);
    });

    it('should throw NotFoundException if merchant not found', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ merchantId: 'nonexistent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all documentations', async () => {
      prisma.merchantDocumentation.findMany.mockResolvedValue([mockDoc]);

      const result = await service.findAll('merchant-1');

      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return documentation by id', async () => {
      prisma.merchantDocumentation.findUnique.mockResolvedValue(mockDoc);

      const result = await service.findOne('doc-1');

      expect(result.id).toBe('doc-1');
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.merchantDocumentation.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update documentation', async () => {
      prisma.merchantDocumentation.findUnique.mockResolvedValue(mockDoc);
      prisma.merchantDocumentation.update.mockResolvedValue({
        ...mockDoc,
        tradingName: 'Updated',
      });

      const result = await service.update('doc-1', {
        tradingName: 'Updated',
      });

      expect(result.tradingName).toBe('Updated');
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.merchantDocumentation.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { tradingName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete documentation', async () => {
      prisma.merchantDocumentation.findUnique.mockResolvedValue(mockDoc);
      prisma.merchantDocumentation.delete.mockResolvedValue(mockDoc);

      const result = await service.remove('doc-1');

      expect(result.id).toBe('doc-1');
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.merchantDocumentation.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
