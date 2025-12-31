import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { TransactionSummaryDto } from './dto/transaction-summary.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOnRamps(page: number, limit: number) {
    const [onramps, total] = await this.prisma.$transaction([
      this.prisma.onrampTransaction.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.onrampTransaction.count(),
    ]);

    return {
      data: onramps,
      meta: {
        total,
        page,
        limit,
      },
    };
  }

  async getOffRamps(page: number, limit: number) {
    const [offramps, total] = await this.prisma.$transaction([
      this.prisma.offrampTransaction.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.offrampTransaction.count(),
    ]);

    return {
      data: offramps,
      meta: {
        total,
        page,
        limit,
      },
    };
  }

  async getSwaps(page: number, limit: number) {
    const [swaps, total] = await this.prisma.$transaction([
      this.prisma.swapTransaction.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.swapTransaction.count(),
    ]);

    return {
      data: swaps,
      meta: {
        total,
        page,
        limit,
      },
    };
  }

  async getSummary(): Promise<TransactionSummaryDto> {
    const [
      totalOnRamps,
      totalOnRampAmountResult,
      totalOffRamps,
      totalOffRampAmountResult,
      totalSwaps,
      totalSwapAmountResult,
    ] = await this.prisma.$transaction([
      this.prisma.onrampTransaction.count(),
      this.prisma.onrampTransaction.aggregate({ _sum: { amount: true } }),
      this.prisma.offrampTransaction.count(),
      this.prisma.offrampTransaction.aggregate({ _sum: { fiatAmount: true } }),
      this.prisma.swapTransaction.count(),
      this.prisma.swapTransaction.aggregate({ _sum: { toAmount: true } }),
    ]);

    return {
      onRamps: {
        count: totalOnRamps,
        totalAmount: totalOnRampAmountResult._sum.amount?.toNumber() || 0,
      },
      offRamps: {
        count: totalOffRamps,
        totalAmount:
          totalOffRampAmountResult._sum.fiatAmount?.toNumber() || 0,
      },
      swaps: {
        count: totalSwaps,
        totalAmount: totalSwapAmountResult._sum.toAmount?.toNumber() || 0,
      },
    };
  }
}
