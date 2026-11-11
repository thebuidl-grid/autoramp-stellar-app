import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats() {
    const [
      totalUsers,
      activeMerchants,
      pendingMerchants,
      onramps,
      offramps,
      swaps,
      merchantOnramps,
      merchantOfframps,
      merchantSwaps,
      bankTransfers,
      failedOnramps,
      failedOfframps,
      failedSwaps,
      failedMerchantOnramps,
      failedMerchantOfframps,
      failedMerchantSwaps,
      failedBankTransfers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.merchant.count({ where: { status: 'VERIFIED' } }),
      this.prisma.merchant.count({ where: { status: 'PENDING' } }),
      this.prisma.onrampTransaction.count(),
      this.prisma.offrampTransaction.count(),
      this.prisma.swapTransaction.count(),
      this.prisma.merchantOnrampTransaction.count(),
      this.prisma.merchantOfframpTransaction.count(),
      this.prisma.merchantSwapTransaction.count(),
      this.prisma.merchantBankTransfer.count(),
      this.prisma.onrampTransaction.count({
        where: { status: 'FAILED' },
      }),
      this.prisma.offrampTransaction.count({
        where: { status: 'FAILED' },
      }),
      this.prisma.swapTransaction.count({
        where: { status: 'FAILED' },
      }),
      this.prisma.merchantOnrampTransaction.count({
        where: { status: 'FAILED' },
      }),
      this.prisma.merchantOfframpTransaction.count({
        where: { status: 'FAILED' },
      }),
      this.prisma.merchantSwapTransaction.count({
        where: { status: 'FAILED' },
      }),
      this.prisma.merchantBankTransfer.count({
        where: { status: 'FAILED' },
      }),
    ]);

    const [onrampAmount, offrampAmount, swapAmount] = await Promise.all([
      this.prisma.onrampTransaction
        .aggregate({ _sum: { amount: true } })
        .then((r) => r._sum.amount ?? 0),
      this.prisma.offrampTransaction
        .aggregate({ _sum: { amount: true } })
        .then((r) => r._sum.amount ?? 0),
      this.prisma.swapTransaction
        .aggregate({ _sum: { fromAmount: true } })
        .then((r) => r._sum.fromAmount ?? 0),
    ]);

    const [
      merchantOnrampAmount,
      merchantOfframpAmount,
      merchantSwapAmount,
      bankTransferAmount,
    ] = await Promise.all([
      this.prisma.merchantOnrampTransaction
        .aggregate({ _sum: { amount: true } })
        .then((r) => r._sum.amount ?? 0),
      this.prisma.merchantOfframpTransaction
        .aggregate({ _sum: { amount: true } })
        .then((r) => r._sum.amount ?? 0),
      this.prisma.merchantSwapTransaction
        .aggregate({ _sum: { fromAmount: true } })
        .then((r) => r._sum.fromAmount ?? 0),
      this.prisma.merchantBankTransfer
        .aggregate({ _sum: { amount: true } })
        .then((r) => r._sum.amount ?? 0),
    ]);

    const totalOnramps = onramps + merchantOnramps;
    const totalOfframps = offramps + merchantOfframps;
    const totalSwaps = swaps + merchantSwaps;

    const totalAmountTransacted =
      Number(onrampAmount) +
      Number(offrampAmount) +
      Number(swapAmount) +
      Number(merchantOnrampAmount) +
      Number(merchantOfframpAmount) +
      Number(merchantSwapAmount) +
      Number(bankTransferAmount);

    const merchantTransactions =
      merchantOnramps + merchantOfframps + merchantSwaps + bankTransfers;

    const totalTransactions =
      totalOnramps + totalOfframps + totalSwaps + bankTransfers;

    const failedTransactions =
      failedOnramps +
      failedOfframps +
      failedSwaps +
      failedMerchantOnramps +
      failedMerchantOfframps +
      failedMerchantSwaps +
      failedBankTransfers;

    return {
      totalUsers,
      activeMerchants,
      pendingVerifications: pendingMerchants,
      totalTransactions,
      merchantTransactions,
      onramps: totalOnramps,
      offramps: totalOfframps,
      swaps: totalSwaps,
      bankTransfers,
      failedTransactions,
      totalAmountTransacted,
      currency: 'NGN',
    };
  }
}
