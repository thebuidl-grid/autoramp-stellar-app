
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { TransactionStatus } from '@prisma/client'; // Import TransactionStatus enum

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

  async getSummary(): Promise<any> {
    const [
      totalOnRamps,
      totalOnRampAmountResult,
      onRampStatusCounts,
      totalOffRamps,
      totalOffRampAmountResult,
      offRampStatusCounts,
      totalSwaps,
      totalSwapAmountResult,
      swapStatusCounts,
    ] = await this.prisma.$transaction([
      this.prisma.onrampTransaction.count(),
      this.prisma.onrampTransaction.aggregate({ _sum: { amount: true } }),
      this.prisma.onrampTransaction.groupBy({ by: ['status'], _count: true }),
      this.prisma.offrampTransaction.count(),
      this.prisma.offrampTransaction.aggregate({ _sum: { fiatAmount: true } }),
      this.prisma.offrampTransaction.groupBy({ by: ['status'], _count: true }),
      this.prisma.swapTransaction.count(),
      this.prisma.swapTransaction.aggregate({ _sum: { toAmount: true } }),
      this.prisma.swapTransaction.groupBy({ by: ['status'], _count: true }),
    ]);

    const onRampStatusSummary = onRampStatusCounts.reduce((acc, curr) => {
      acc[curr.status] = curr._count._all;
      return acc;
    }, {} as Record<TransactionStatus, number>);

    const offRampStatusSummary = offRampStatusCounts.reduce((acc, curr) => {
      acc[curr.status] = curr._count._all;
      return acc;
    }, {} as Record<TransactionStatus, number>);

    const swapStatusSummary = swapStatusCounts.reduce((acc, curr) => {
      acc[curr.status] = curr._count._all;
      return acc;
    }, {} as Record<TransactionStatus, number>);

    return {
      totalOnRamps,
      totalOnRampAmount: totalOnRampAmountResult._sum.amount?.toNumber() || 0,
      onRampStatusSummary,
      totalOffRamps,
      totalOffRampAmount: totalOffRampAmountResult._sum.fiatAmount?.toNumber() || 0,
      offRampStatusSummary,
      totalSwaps,
      totalSwapAmount: totalSwapAmountResult._sum.toAmount?.toNumber() || 0,
      swapStatusSummary,
    };
  }
}
