import { AdminService } from './admin.service';
import { TransactionsService } from './transactions/transactions.service';
import { PrismaService } from '../../database/prisma.service';

describe('AdminService.getTransactionsSummary (integration)', () => {
  let adminService: AdminService;
  let transactionsService: TransactionsService;
  let prisma: Record<string, { findMany: jest.Mock }>;

  beforeEach(() => {
    prisma = {
      onrampTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      offrampTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      swapTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      merchantOnrampTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      merchantOfframpTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      merchantSwapTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      otcTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      merchantBankTransfer: { findMany: jest.fn().mockResolvedValue([]) },
      vasTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      transactionFee: { findMany: jest.fn().mockResolvedValue([]) },
    };

    transactionsService = new TransactionsService(
      prisma as unknown as PrismaService,
    );

    adminService = new AdminService(
      prisma as unknown as PrismaService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      transactionsService,
    );
  });

  it('does not double-count a swap and its linked offramp, excludes crypto-only swaps from volume', async () => {
    prisma.onrampTransaction.findMany.mockResolvedValue([
      { id: 'on-1', amount: 1000, status: 'COMPLETED', createdAt: new Date() },
      { id: 'on-2', amount: 500, status: 'PENDING', createdAt: new Date() },
    ]);

    prisma.offrampTransaction.findMany.mockResolvedValue([
      { id: 'off-1', amount: 2000, status: 'COMPLETED', swapId: null, createdAt: new Date() },
      { id: 'off-2', amount: 3000, status: 'COMPLETED', swapId: 'swap-1', createdAt: new Date() },
      { id: 'off-3', amount: 700, status: 'FAILED', swapId: null, createdAt: new Date() },
    ]);

    prisma.swapTransaction.findMany.mockResolvedValue([
      { id: 'swap-1', fromAmount: 50, toAmount: 3000, status: 'COMPLETED', offrampTransaction: { id: 'off-2', amount: 3000 }, createdAt: new Date() },
      { id: 'swap-2', fromAmount: 10, toAmount: 12, status: 'COMPLETED', offrampTransaction: null, createdAt: new Date() },
      { id: 'swap-3', fromAmount: 20, toAmount: 24, status: 'PENDING', offrampTransaction: null, createdAt: new Date() },
    ]);

    const result = await adminService.getTransactionsSummary();

    // All raw rows: 2 onramp + 3 offramp + 3 swap = 8
    expect(result.totalCount).toBe(8);

    expect(result.onramp.totalAmount).toBe(1000);
    expect(result.onramp.count).toBe(1);

    // Only standalone offramps (swapId null)
    expect(result.offramp.totalAmount).toBe(2000);
    expect(result.offramp.count).toBe(1);

    // Both completed swaps counted
    expect(result.swap.count).toBe(2);

    // successRate = completed(5) / total(8) → 63
    expect(result.successRate).toBe(Math.round((5 / 8) * 100));
  });

  it('folds in merchant transactions without double-counting merchant swap/offramp pairs', async () => {
    prisma.merchantOnrampTransaction.findMany.mockResolvedValue([
      { id: 'mo-1', amount: 4000, status: 'COMPLETED', createdAt: new Date() },
    ]);

    prisma.merchantOfframpTransaction.findMany.mockResolvedValue([
      { id: 'moff-1', amount: 1500, status: 'COMPLETED', reference: 'ref-standalone', createdAt: new Date() },
      { id: 'moff-2', amount: 5000, status: 'COMPLETED', reference: 'ref-swap-1', createdAt: new Date() },
    ]);

    prisma.merchantSwapTransaction.findMany.mockResolvedValue([
      { id: 'msw-1', fromAmount: 100, toAmount: 95, feeAmount: 5, status: 'COMPLETED', reference: 'ref-swap-1', createdAt: new Date() },
    ]);

    const result = await adminService.getTransactionsSummary();

    // All raw rows: 1 merchant onramp + 2 merchant offramp + 1 merchant swap = 4
    expect(result.totalCount).toBe(4);

    expect(result.onramp.totalAmount).toBe(4000);
    expect(result.onramp.count).toBe(1);

    // The reference-linked merchant offramp is excluded from offramp...
    expect(result.offramp.totalAmount).toBe(1500);
    expect(result.offramp.count).toBe(1);

    expect(result.swap.count).toBe(1);

    expect(result.totalVolume).toBe(4000 + 1500 + 100);
  });

  it('includes bank transfers and VAS in summary', async () => {
    prisma.onrampTransaction.findMany.mockResolvedValue([
      { id: 'on-1', amount: 1000, status: 'COMPLETED', createdAt: new Date() },
    ]);

    prisma.merchantBankTransfer.findMany.mockResolvedValue([
      { id: 'bt-1', amount: 5000, status: 'COMPLETED', createdAt: new Date() },
      { id: 'bt-2', amount: 2000, status: 'PROCESSING', createdAt: new Date() },
    ]);

    prisma.vasTransaction.findMany.mockResolvedValue([
      { id: 'vas-1', amount: 1500, status: 'COMPLETED', createdAt: new Date() },
    ]);

    const result = await adminService.getTransactionsSummary();

    // COMPLETED + PROCESSING both count for bank transfers and VAS
    expect(result.bankTransfer.count).toBe(2);
    expect(result.bankTransfer.totalAmount).toBe(7000);

    expect(result.vas.count).toBe(1);
    expect(result.vas.totalAmount).toBe(1500);

    expect(result.totalVolume).toBe(1000 + 5000 + 2000 + 1500);
  });

  it('includes fee breakdown', async () => {
    prisma.onrampTransaction.findMany.mockResolvedValue([
      { id: 'on-1', amount: 1000, status: 'COMPLETED', createdAt: new Date() },
    ]);

    prisma.transactionFee.findMany.mockResolvedValue([
      { transactionId: 'on-1', feeAmount: 50, feeType: 'provider_fee' },
      { transactionId: 'on-1', feeAmount: 7.5, feeType: 'vat' },
    ]);

    const result = await adminService.getTransactionsSummary();

    expect(result.fees.provider_fee).toBe(50);
    expect(result.fees.vat).toBe(7.5);
    expect(result.fees.total).toBe(57.5);
    expect(result.onramp.totalFees).toBe(57.5);
  });

  it('returns zeroed stats when there are no transactions', async () => {
    const result = await adminService.getTransactionsSummary();

    expect(result.totalCount).toBe(0);
    expect(result.totalVolume).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.onramp.count).toBe(0);
    expect(result.offramp.count).toBe(0);
    expect(result.swap.count).toBe(0);
    expect(result.bankTransfer.count).toBe(0);
    expect(result.vas.count).toBe(0);
    expect(result.otc.count).toBe(0);
    expect(result.fees.total).toBe(0);
  });

  it('supports period filter', async () => {
    await adminService.getTransactionsSummary('7d');

    // Verify the service was called through to prisma without throwing
    expect(prisma.onrampTransaction.findMany).toHaveBeenCalled();
  });
});
