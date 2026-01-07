import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { TransactionSummaryDto } from './dto/transaction-summary.dto';
import { GetAnalyticsDto, AnalyticsPeriod } from './dto/get-analytics.dto';
import { AnalyticsDataPoint } from './dto/analytics-response.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) { }

  async getAnalytics(query: GetAnalyticsDto): Promise<AnalyticsDataPoint[]> {
    const { period } = query;
    const now = new Date();
    let startDate: Date;

    // Determine start date based on period
    switch (period) {
      case AnalyticsPeriod.DAILY:
        startDate = new Date(now.setDate(now.getDate() - 30)); // Last 30 days
        break;
      case AnalyticsPeriod.WEEKLY:
        startDate = new Date(now.setDate(now.getDate() - 7 * 12)); // Last 12 weeks
        break;
      case AnalyticsPeriod.MONTHLY:
        startDate = new Date(now.setMonth(now.getMonth() - 12)); // Last 12 months
        break;
      default:
        startDate = new Date(now.setDate(now.getDate() - 30));
    }

    // Fetch raw data
    const [onRamps, offRamps, swaps] = await Promise.all([
      this.prisma.onrampTransaction.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true, amount: true },
      }),
      this.prisma.offrampTransaction.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true, fiatAmount: true },
      }),
      this.prisma.swapTransaction.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true, toAmount: true },
      }),
    ]);

    // Helper to format date key
    const getDateKey = (date: Date): string => {
      const d = new Date(date);
      if (period === AnalyticsPeriod.MONTHLY) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
      if (period === AnalyticsPeriod.WEEKLY) {
        const firstDay = new Date(d.setDate(d.getDate() - d.getDay()));
        return `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-${String(firstDay.getDate()).padStart(2, '0')}`;
      }
      return d.toISOString().split('T')[0];
    };

    // Aggregate data
    const analyticsMap = new Map<string, AnalyticsDataPoint>();

    const processTransaction = (
      items: any[],
      type: 'onRamp' | 'offRamp' | 'swap',
      amountKey: string,
    ) => {
      items.forEach((item) => {
        const key = getDateKey(item.createdAt);
        if (!analyticsMap.has(key)) {
          analyticsMap.set(key, {
            date: key,
            onRampCount: 0,
            offRampCount: 0,
            swapCount: 0,
            onRampVolume: 0,
            offRampVolume: 0,
            swapVolume: 0,
          });
        }
        const entry = analyticsMap.get(key)!;
        if (type === 'onRamp') {
          entry.onRampCount++;
          entry.onRampVolume += Number(item[amountKey] || 0);
        } else if (type === 'offRamp') {
          entry.offRampCount++;
          entry.offRampVolume += Number(item[amountKey] || 0);
        } else {
          entry.swapCount++;
          entry.swapVolume += Number(item[amountKey] || 0);
        }
      });
    };

    processTransaction(onRamps, 'onRamp', 'amount');
    processTransaction(offRamps, 'offRamp', 'fiatAmount');
    processTransaction(swaps, 'swap', 'toAmount');

    // Sort by date
    return Array.from(analyticsMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }

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
