import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../../../database/prisma.service';
import { AnalyticsPeriod } from './dto/get-transactions.dto';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    merchantOnrampTransaction: any;
    merchantOfframpTransaction: any;
    merchantSwapTransaction: any;
    merchantApiRequestLog: any;
    merchantAuditLog: any;
    merchantBankTransfer: any;
  };

  const mockPrisma = {
    merchantOnrampTransaction: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    merchantOfframpTransaction: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    merchantSwapTransaction: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    merchantApiRequestLog: {
      findMany: jest.fn(),
    },
    merchantAuditLog: {
      findMany: jest.fn(),
    },
    merchantBankTransfer: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('getOnramps', () => {
    it('should return paginated onramp transactions', async () => {
      prisma.merchantOnrampTransaction.findMany.mockResolvedValue([
        { id: 'tx-1', amount: 5000, status: 'COMPLETED' },
      ]);
      prisma.merchantOnrampTransaction.count.mockResolvedValue(1);

      const result = await service.getOnramps('merchant-1', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });
  });

  describe('getOfframps', () => {
    it('should return paginated offramp transactions', async () => {
      prisma.merchantOfframpTransaction.findMany.mockResolvedValue([
        { id: 'tx-2', amount: 3000, status: 'COMPLETED' },
      ]);
      prisma.merchantOfframpTransaction.count.mockResolvedValue(1);

      const result = await service.getOfframps('merchant-1', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('getSwaps', () => {
    it('should return paginated swap transactions', async () => {
      prisma.merchantSwapTransaction.findMany.mockResolvedValue([
        { id: 'tx-3', fromAmount: 100, status: 'COMPLETED' },
      ]);
      prisma.merchantSwapTransaction.count.mockResolvedValue(1);

      const result = await service.getSwaps('merchant-1', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
    });
  });

  describe('getSummary', () => {
    it('should aggregate transaction volumes', async () => {
      prisma.merchantOnrampTransaction.aggregate.mockResolvedValue({
        _sum: { amount: { toNumber: () => 10000 } },
        _count: { id: 5 },
      });
      prisma.merchantOfframpTransaction.aggregate.mockResolvedValue({
        _sum: { fiatAmount: { toNumber: () => 8000 } },
        _count: { id: 3 },
      });
      prisma.merchantSwapTransaction.aggregate.mockResolvedValue({
        _sum: { fromAmount: { toNumber: () => 2000 } },
        _count: { id: 2 },
      });
      prisma.merchantApiRequestLog.findMany.mockResolvedValue([]);
      prisma.merchantBankTransfer.findMany.mockResolvedValue([
        { amount: { toNumber: () => 15000 } },
        { amount: { toNumber: () => 5000 } },
      ]);

      const result = await service.getSummary('merchant-1');

      expect(result.onramp.count).toBe(5);
      expect(result.onramp.volume).toBe(10000);
      expect(result.offramp.count).toBe(3);
      expect(result.offramp.volume).toBe(8000);
      expect(result.swap.count).toBe(2);
      expect(result.swap.volume).toBe(2000);
      expect(result.bankTransfer.count).toBe(2);
      expect(result.bankTransfer.volume).toBe(20000);
    });

    it('should handle null sums gracefully', async () => {
      prisma.merchantOnrampTransaction.aggregate.mockResolvedValue({
        _sum: { amount: null },
        _count: { id: 0 },
      });
      prisma.merchantOfframpTransaction.aggregate.mockResolvedValue({
        _sum: { fiatAmount: null },
        _count: { id: 0 },
      });
      prisma.merchantSwapTransaction.aggregate.mockResolvedValue({
        _sum: { fromAmount: null },
        _count: { id: 0 },
      });
      prisma.merchantBankTransfer.findMany.mockResolvedValue([]);

      const result = await service.getSummary('merchant-1');

      expect(result.onramp.volume).toBe(0);
      expect(result.offramp.volume).toBe(0);
      expect(result.swap.volume).toBe(0);
      expect(result.bankTransfer.count).toBe(0);
      expect(result.bankTransfer.volume).toBe(0);
    });
  });

  describe('getAll', () => {
    it('should return all transaction types merged and sorted', async () => {
      prisma.merchantOnrampTransaction.findMany.mockResolvedValue([
        { id: 'tx-1', amount: { toNumber: () => 5000 }, status: 'COMPLETED', reference: 'ref-1', createdAt: new Date('2026-01-01'), tokenType: 'USDC', network: 'tron', destinationAddress: 'Txxx' },
      ]);
      prisma.merchantOfframpTransaction.findMany.mockResolvedValue([
        { id: 'tx-2', fiatAmount: { toNumber: () => 3000 }, status: 'COMPLETED', reference: 'ref-2', createdAt: new Date('2026-01-02'), tokenType: 'USDT', bankCode: '044', accountNumber: '123', accountName: 'Test' },
      ]);
      prisma.merchantSwapTransaction.findMany.mockResolvedValue([
        { id: 'tx-3', fromAmount: { toNumber: () => 100 }, status: 'COMPLETED', reference: 'ref-3', createdAt: new Date('2026-01-03'), fromTokenType: 'USDC', toTokenType: 'USDT', toAmount: { toNumber: () => 105 }, exchangeRate: { toNumber: () => 1.05 } },
      ]);
      prisma.merchantBankTransfer.findMany.mockResolvedValue([
        { id: 'tx-4', amount: { toNumber: () => 2000 }, status: 'COMPLETED', reference: 'bank-ref-4', createdAt: new Date('2026-01-04'), beneficiaryBankCode: '044', beneficiaryAccountNumber: '123', narration: 'Test' },
      ]);

      const result = await service.getAll('merchant-1', { page: 1, limit: 10 });

      expect(result.data).toHaveLength(4);
      expect(result.data[0].type).toBe('bank_transfer');
      expect(result.data[1].type).toBe('swap');
      expect(result.data[2].type).toBe('offramp');
      expect(result.data[3].type).toBe('onramp');
      expect(result.meta.total).toBe(4);
    });

    it('should filter by type when type param is provided', async () => {
      prisma.merchantOnrampTransaction.findMany.mockResolvedValue([]);
      prisma.merchantOfframpTransaction.findMany.mockResolvedValue([]);
      prisma.merchantSwapTransaction.findMany.mockResolvedValue([]);
      prisma.merchantBankTransfer.findMany.mockResolvedValue([]);

      await service.getAll('merchant-1', { page: 1, limit: 10, type: 'onramp' as any });

      expect(prisma.merchantOnrampTransaction.findMany).toHaveBeenCalled();
      expect(prisma.merchantOfframpTransaction.findMany).not.toHaveBeenCalled();
      expect(prisma.merchantSwapTransaction.findMany).not.toHaveBeenCalled();
      expect(prisma.merchantBankTransfer.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getAnalytics', () => {
    it('should bucket analytics by daily period', async () => {
      prisma.merchantOnrampTransaction.findMany.mockResolvedValue([
        { createdAt: new Date('2026-01-15'), amount: 5000 },
      ]);
      prisma.merchantOfframpTransaction.findMany.mockResolvedValue([]);
      prisma.merchantSwapTransaction.findMany.mockResolvedValue([]);

      const result = await service.getAnalytics('merchant-1', {
        period: AnalyticsPeriod.DAILY,
      });

      expect(result).toBeInstanceOf(Array);
      expect(result[0]).toHaveProperty('date');
      expect(result[0]).toHaveProperty('onrampVolume');
    });
  });
});
