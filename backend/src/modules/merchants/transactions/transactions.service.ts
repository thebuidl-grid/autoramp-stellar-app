import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  GetMerchantTransactionsDto,
  AnalyticsPeriod,
} from './dto/get-transactions.dto';

export type TransactionType = 'onramp' | 'offramp' | 'swap' | 'bank_transfer';

export interface UnifiedTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  status: string;
  createdAt: Date;
  reference?: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOnramps(merchantId: string, query: GetMerchantTransactionsDto) {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.merchantOnrampTransaction.findMany({
        where: { merchantId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.merchantOnrampTransaction.count({ where: { merchantId } }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async getOfframps(merchantId: string, query: GetMerchantTransactionsDto) {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.merchantOfframpTransaction.findMany({
        where: { merchantId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.merchantOfframpTransaction.count({ where: { merchantId } }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async getSwaps(merchantId: string, query: GetMerchantTransactionsDto) {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.merchantSwapTransaction.findMany({
        where: { merchantId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.merchantSwapTransaction.count({ where: { merchantId } }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async getAll(merchantId: string, query: GetMerchantTransactionsDto) {
    const { page = 1, limit = 20, type } = query;
    const skip = (page - 1) * limit;

    const typeFilter = type as TransactionType | undefined;

    const fetchAll =
      !typeFilter ||
      typeFilter === 'onramp' ||
      typeFilter === 'offramp' ||
      typeFilter === 'swap' ||
      typeFilter === 'bank_transfer';

    const [onramps, offramps, swaps, bankTransfers] = await Promise.all([
      !typeFilter || typeFilter === 'onramp'
        ? this.prisma.merchantOnrampTransaction.findMany({
            where: { merchantId },
            select: {
              id: true,
              amount: true,
              status: true,
              reference: true,
              createdAt: true,
              tokenType: true,
              network: true,
              destinationAddress: true,
            },
          })
        : [],
      !typeFilter || typeFilter === 'offramp'
        ? this.prisma.merchantOfframpTransaction.findMany({
            where: { merchantId },
            select: {
              id: true,
              fiatAmount: true,
              status: true,
              reference: true,
              createdAt: true,
              tokenType: true,
              bankCode: true,
              accountNumber: true,
              accountName: true,
            },
          })
        : [],
      !typeFilter || typeFilter === 'swap'
        ? this.prisma.merchantSwapTransaction.findMany({
            where: { merchantId },
            select: {
              id: true,
              fromAmount: true,
              status: true,
              reference: true,
              createdAt: true,
              fromTokenType: true,
              toTokenType: true,
              toAmount: true,
              exchangeRate: true,
            },
          })
        : [],
      !typeFilter || typeFilter === 'bank_transfer'
        ? this.prisma.merchantBankTransfer.findMany({
            where: {
              merchantId,
              status: { in: ['COMPLETED', 'PENDING'] },
            },
            select: {
              id: true,
              amount: true,
              status: true,
              reference: true,
              createdAt: true,
              beneficiaryBankCode: true,
              beneficiaryAccountNumber: true,
              narration: true,
            },
          })
        : [],
    ]);

    const unified: UnifiedTransaction[] = [
      ...onramps.map((t) => ({
        id: t.id,
        type: 'onramp' as const,
        amount: t.amount?.toNumber?.() ?? Number(t.amount) ?? 0,
        status: t.status,
        createdAt: t.createdAt,
        reference: t.reference ?? undefined,
        details: {
          tokenType: t.tokenType,
          network: t.network,
          destinationAddress: t.destinationAddress,
        },
      })),
      ...offramps.map((t) => ({
        id: t.id,
        type: 'offramp' as const,
        amount: t.fiatAmount?.toNumber?.() ?? Number(t.fiatAmount) ?? 0,
        status: t.status,
        createdAt: t.createdAt,
        reference: t.reference ?? undefined,
        details: {
          tokenType: t.tokenType,
          bankCode: t.bankCode,
          accountNumber: t.accountNumber,
          accountName: t.accountName,
        },
      })),
      ...swaps.map((t) => ({
        id: t.id,
        type: 'swap' as const,
        amount: t.fromAmount?.toNumber?.() ?? Number(t.fromAmount) ?? 0,
        status: t.status,
        createdAt: t.createdAt,
        reference: t.reference ?? undefined,
        details: {
          fromTokenType: t.fromTokenType,
          toTokenType: t.toTokenType,
          toAmount: t.toAmount?.toNumber?.() ?? Number(t.toAmount) ?? 0,
          exchangeRate:
            t.exchangeRate?.toNumber?.() ?? Number(t.exchangeRate) ?? 0,
        },
      })),
      ...bankTransfers.map((t) => ({
        id: t.id,
        type: 'bank_transfer' as const,
        amount: t.amount?.toNumber?.() ?? Number(t.amount) ?? 0,
        status: t.status,
        createdAt: t.createdAt,
        reference: t.reference ?? undefined,
        details: {
          beneficiaryBankCode: t.beneficiaryBankCode,
          beneficiaryAccountNumber: t.beneficiaryAccountNumber,
          narration: t.narration,
        },
      })),
    ];

    unified.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = unified.length;
    const paginated = unified.slice(skip, skip + limit);

    return {
      data: paginated,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getSummary(merchantId: string) {
    const [onramp, offramp, swap, bankTransfers] = await Promise.all([
      this.prisma.merchantOnrampTransaction.aggregate({
        where: {
          merchantId,
          status: { in: ['COMPLETED', 'PROCESSING'] as any },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.merchantOfframpTransaction.aggregate({
        where: {
          merchantId,
          status: { in: ['COMPLETED', 'PROCESSING'] as any },
        },
        _sum: { fiatAmount: true },
        _count: { id: true },
      }),
      this.prisma.merchantSwapTransaction.aggregate({
        where: {
          merchantId,
          status: { in: ['COMPLETED', 'PROCESSING'] as any },
        },
        _sum: { fromAmount: true },
        _count: { id: true },
      }),
      this.prisma.merchantBankTransfer.findMany({
        where: {
          merchantId,
          status: { in: ['COMPLETED', 'PROCESSING'] as any },
        },
        select: { amount: true },
      }),
    ]);

    let bankTransferCount = 0;
    let bankTransferVolume = 0;
    for (const tx of bankTransfers) {
      const amount = tx.amount?.toNumber?.() ?? Number(tx.amount) ?? 0;
      if (amount > 0) {
        bankTransferCount++;
        bankTransferVolume += amount;
      }
    }

    return {
      onramp: {
        count: onramp._count.id,
        volume: onramp._sum.amount?.toNumber() || 0,
      },
      offramp: {
        count: offramp._count.id,
        volume: offramp._sum.fiatAmount?.toNumber() || 0,
      },
      swap: {
        count: swap._count.id,
        volume: swap._sum.fromAmount?.toNumber() || 0,
      },
      bankTransfer: {
        count: bankTransferCount,
        volume: bankTransferVolume,
      },
    };
  }

  async getAnalytics(merchantId: string, query: GetMerchantTransactionsDto) {
    const { period } = query;
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case AnalyticsPeriod.WEEKLY:
        startDate = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
        break;
      case AnalyticsPeriod.MONTHLY:
        startDate = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000);
        break;
      case AnalyticsPeriod.DAILY:
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    const [onramps, offramps, swaps] = await Promise.all([
      this.prisma.merchantOnrampTransaction.findMany({
        where: {
          merchantId,
          createdAt: { gte: startDate },
          status: 'COMPLETED',
        },
        select: { createdAt: true, amount: true },
      }),
      this.prisma.merchantOfframpTransaction.findMany({
        where: {
          merchantId,
          createdAt: { gte: startDate },
          status: 'COMPLETED',
        },
        select: { createdAt: true, fiatAmount: true },
      }),
      this.prisma.merchantSwapTransaction.findMany({
        where: {
          merchantId,
          createdAt: { gte: startDate },
          status: 'COMPLETED',
        },
        select: { createdAt: true, fromAmount: true },
      }),
    ]);

    const getDateKey = (date: Date) => {
      const d = new Date(date);
      if (period === AnalyticsPeriod.MONTHLY)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (period === AnalyticsPeriod.WEEKLY) {
        const firstDay = new Date(d.setDate(d.getDate() - d.getDay()));
        return `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-${String(firstDay.getDate()).padStart(2, '0')}`;
      }
      return d.toISOString().split('T')[0];
    };

    const analyticsMap = new Map();

    const process = (items: any[], type: string, amountKey: string) => {
      items.forEach((item) => {
        const key = getDateKey(item.createdAt);
        if (!analyticsMap.has(key)) {
          analyticsMap.set(key, {
            date: key,
            onrampVolume: 0,
            offrampVolume: 0,
            swapVolume: 0,
            onrampCount: 0,
            offrampCount: 0,
            swapCount: 0,
          });
        }
        const entry = analyticsMap.get(key);
        entry[`${type}Volume`] += Number(item[amountKey] || 0);
        entry[`${type}Count`]++;
      });
    };

    process(onramps, 'onramp', 'amount');
    process(offramps, 'offramp', 'fiatAmount');
    process(swaps, 'swap', 'fromAmount');

    return Array.from(analyticsMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }
}
