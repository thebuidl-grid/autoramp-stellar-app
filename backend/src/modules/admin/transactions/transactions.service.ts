import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { TransactionSummaryDto } from './dto/transaction-summary.dto';
import { GetAnalyticsDto, AnalyticsPeriod } from './dto/get-analytics.dto';
import { AnalyticsDataPoint } from './dto/analytics-response.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

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
        totalAmount: totalOffRampAmountResult._sum.fiatAmount?.toNumber() || 0,
      },
      swaps: {
        count: totalSwaps,
        totalAmount: totalSwapAmountResult._sum.toAmount?.toNumber() || 0,
      },
    };
  }

  async getAllTransactions(
    page: number = 1,
    limit: number = 10,
    status?: string,
    type?: string,
    search?: string,
  ) {
    const skip = (page - 1) * limit;
    const baseWhere: any = {
      ...(status ? { status: status as any } : {}),
    };

    if (search) {
      baseWhere.OR = [{ reference: { contains: search, mode: 'insensitive' } }];
    }

    const orderBy = { createdAt: 'desc' as const };

    if (type === 'onramp') {
      const [data, total] = await Promise.all([
        this.prisma.onrampTransaction.findMany({
          where: baseWhere,
          include: { user: { select: { email: true } } },
          orderBy,
          skip,
          take: limit,
        }),
        this.prisma.onrampTransaction.count({ where: baseWhere }),
      ]);
      return {
        data: data.map((tx) => ({
          id: tx.id,
          reference: tx.reference,
          amount: tx.amount,
          status: tx.status,
          createdAt: tx.createdAt,
          type: 'onramp',
          user: tx.user?.email ?? null,
          merchant: null,
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    if (type === 'offramp') {
      const [data, total] = await Promise.all([
        this.prisma.offrampTransaction.findMany({
          where: baseWhere,
          include: { user: { select: { email: true } } },
          orderBy,
          skip,
          take: limit,
        }),
        this.prisma.offrampTransaction.count({ where: baseWhere }),
      ]);
      return {
        data: data.map((tx) => ({
          id: tx.id,
          reference: tx.reference,
          amount: tx.amount,
          fiatAmount: tx.fiatAmount,
          status: tx.status,
          createdAt: tx.createdAt,
          type: 'offramp',
          user: tx.user?.email ?? null,
          merchant: null,
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    if (type === 'swap') {
      const [data, total] = await Promise.all([
        this.prisma.swapTransaction.findMany({
          where: baseWhere,
          include: { user: { select: { email: true } } },
          orderBy,
          skip,
          take: limit,
        }),
        this.prisma.swapTransaction.count({ where: baseWhere }),
      ]);
      return {
        data: data.map((tx) => ({
          id: tx.id,
          reference: tx.reference,
          fromAmount: tx.fromAmount,
          toAmount: tx.toAmount,
          fromTokenType: tx.fromTokenType,
          toTokenType: tx.toTokenType,
          status: tx.status,
          createdAt: tx.createdAt,
          type: 'swap',
          user: tx.user?.email ?? null,
          merchant: null,
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    if (type === 'merchant_onramp') {
      const [data, total] = await Promise.all([
        this.prisma.merchantOnrampTransaction.findMany({
          where: baseWhere,
          include: { merchant: { select: { name: true } } },
          orderBy,
          skip,
          take: limit,
        }),
        this.prisma.merchantOnrampTransaction.count({ where: baseWhere }),
      ]);
      return {
        data: data.map((tx) => ({
          id: tx.id,
          reference: tx.reference,
          amount: tx.amount,
          status: tx.status,
          createdAt: tx.createdAt,
          type: 'merchant_onramp',
          user: null,
          merchant: tx.merchant?.name ?? null,
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    if (type === 'merchant_offramp') {
      const [data, total] = await Promise.all([
        this.prisma.merchantOfframpTransaction.findMany({
          where: baseWhere,
          include: { merchant: { select: { name: true } } },
          orderBy,
          skip,
          take: limit,
        }),
        this.prisma.merchantOfframpTransaction.count({ where: baseWhere }),
      ]);
      return {
        data: data.map((tx) => ({
          id: tx.id,
          reference: tx.reference,
          amount: tx.amount,
          fiatAmount: tx.fiatAmount,
          accountNumber: tx.accountNumber,
          accountName: tx.accountName,
          bankName: tx.bankName,
          status: tx.status,
          createdAt: tx.createdAt,
          type: 'merchant_offramp',
          user: null,
          merchant: tx.merchant?.name ?? null,
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    if (type === 'merchant_swap') {
      const [data, total] = await Promise.all([
        this.prisma.merchantSwapTransaction.findMany({
          where: baseWhere,
          include: { merchant: { select: { name: true } } },
          orderBy,
          skip,
          take: limit,
        }),
        this.prisma.merchantSwapTransaction.count({ where: baseWhere }),
      ]);
      return {
        data: data.map((tx) => ({
          id: tx.id,
          reference: tx.reference,
          fromAmount: tx.fromAmount,
          toAmount: tx.toAmount,
          fromTokenType: tx.fromTokenType,
          toTokenType: tx.toTokenType,
          status: tx.status,
          createdAt: tx.createdAt,
          type: 'merchant_swap',
          user: null,
          merchant: tx.merchant?.name ?? null,
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    if (type === 'bank_transfer') {
      const [data, total] = await Promise.all([
        this.prisma.merchantBankTransfer.findMany({
          where: baseWhere,
          include: { merchant: { select: { name: true } } },
          orderBy,
          skip,
          take: limit,
        }),
        this.prisma.merchantBankTransfer.count({ where: baseWhere }),
      ]);
      return {
        data: data.map((tx) => ({
          id: tx.id,
          reference: tx.reference,
          amount: tx.amount,
          beneficiaryAccountNumber: tx.beneficiaryAccountNumber,
          beneficiaryAccountName: tx.beneficiaryAccountName,
          beneficiaryBankCode: tx.beneficiaryBankCode,
          narration: tx.narration,
          status: tx.status,
          createdAt: tx.createdAt,
          type: 'bank_transfer',
          user: null,
          merchant: tx.merchant?.name ?? null,
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    if (type === 'otc') {
      const [data, total] = await Promise.all([
        this.prisma.otcTransaction.findMany({
          where: baseWhere,
          include: { user: { select: { email: true } } },
          orderBy,
          skip,
          take: limit,
        }),
        this.prisma.otcTransaction.count({ where: baseWhere }),
      ]);
      return {
        data: data.map((tx) => ({
          id: tx.id,
          reference: tx.reference,
          amount: tx.amount,
          status: tx.status,
          createdAt: tx.createdAt,
          type: 'otc',
          user: tx.user?.email ?? null,
          merchant: null,
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    if (type === 'vas') {
      const [data, total] = await Promise.all([
        this.prisma.vasTransaction.findMany({
          where: baseWhere,
          include: { merchant: { select: { name: true } } },
          orderBy,
          skip,
          take: limit,
        }),
        this.prisma.vasTransaction.count({ where: baseWhere }),
      ]);
      return {
        data: data.map((tx) => ({
          id: tx.id,
          reference: tx.reference,
          amount: tx.amount,
          serviceType: tx.serviceType,
          status: tx.status,
          createdAt: tx.createdAt,
          type: 'vas',
          user: null,
          merchant: tx.merchant?.name ?? null,
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    const searchWhere = search
      ? { reference: { contains: search, mode: 'insensitive' as const } }
      : {};
    const statusWhere = status ? { status: status as any } : {};
    const where = { ...statusWhere, ...searchWhere };

    const fetchLimit = skip + limit;

    const [
      onrampAll,
      offrampAll,
      swapAll,
      merchantOnrampAll,
      merchantOfframpAll,
      merchantSwapAll,
      bankTransferAll,
      otcAll,
      vasAll,
      onrampCount,
      offrampCount,
      swapCount,
      merchantOnrampCount,
      merchantOfframpCount,
      merchantSwapCount,
      bankTransferCount,
      otcCount,
      vasCount,
    ] = await Promise.all([
      this.prisma.onrampTransaction.findMany({
        where,
        orderBy,
        take: fetchLimit,
        select: {
          id: true,
          reference: true,
          amount: true,
          status: true,
          createdAt: true,
          userId: true,
        },
      }),
      this.prisma.offrampTransaction.findMany({
        where,
        orderBy,
        take: fetchLimit,
        select: {
          id: true,
          reference: true,
          amount: true,
          status: true,
          createdAt: true,
          userId: true,
        },
      }),
      this.prisma.swapTransaction.findMany({
        where,
        orderBy,
        take: fetchLimit,
        select: {
          id: true,
          reference: true,
          fromAmount: true,
          status: true,
          createdAt: true,
          userId: true,
        },
      }),
      this.prisma.merchantOnrampTransaction.findMany({
        where,
        orderBy,
        take: fetchLimit,
        select: {
          id: true,
          reference: true,
          amount: true,
          status: true,
          createdAt: true,
          merchantId: true,
        },
      }),
      this.prisma.merchantOfframpTransaction.findMany({
        where,
        orderBy,
        take: fetchLimit,
        select: {
          id: true,
          reference: true,
          amount: true,
          status: true,
          createdAt: true,
          merchantId: true,
        },
      }),
      this.prisma.merchantSwapTransaction.findMany({
        where,
        orderBy,
        take: fetchLimit,
        select: {
          id: true,
          reference: true,
          fromAmount: true,
          status: true,
          createdAt: true,
          merchantId: true,
        },
      }),
      this.prisma.merchantBankTransfer.findMany({
        where,
        orderBy,
        take: fetchLimit,
        select: {
          id: true,
          reference: true,
          amount: true,
          status: true,
          createdAt: true,
          merchantId: true,
        },
      }),
      this.prisma.otcTransaction.findMany({
        where,
        orderBy,
        take: fetchLimit,
        select: {
          id: true,
          reference: true,
          amount: true,
          status: true,
          createdAt: true,
          userId: true,
        },
      }),
      this.prisma.vasTransaction.findMany({
        where,
        orderBy,
        take: fetchLimit,
        select: {
          id: true,
          reference: true,
          amount: true,
          status: true,
          createdAt: true,
          merchantId: true,
        },
      }),
      this.prisma.onrampTransaction.count({ where }),
      this.prisma.offrampTransaction.count({ where }),
      this.prisma.swapTransaction.count({ where }),
      this.prisma.merchantOnrampTransaction.count({ where }),
      this.prisma.merchantOfframpTransaction.count({ where }),
      this.prisma.merchantSwapTransaction.count({ where }),
      this.prisma.merchantBankTransfer.count({ where }),
      this.prisma.otcTransaction.count({ where }),
      this.prisma.vasTransaction.count({ where }),
    ]);

    const total =
      onrampCount +
      offrampCount +
      swapCount +
      merchantOnrampCount +
      merchantOfframpCount +
      merchantSwapCount +
      bankTransferCount +
      otcCount +
      vasCount;

    const all = [
      ...onrampAll.map((t) => ({
        ...t,
        amount: t.amount,
        _type: 'onramp' as const,
      })),
      ...offrampAll.map((t) => ({
        ...t,
        amount: t.amount,
        _type: 'offramp' as const,
      })),
      ...swapAll.map((t) => ({
        ...t,
        amount: t.fromAmount,
        _type: 'swap' as const,
      })),
      ...merchantOnrampAll.map((t) => ({
        ...t,
        amount: t.amount,
        _type: 'merchant_onramp' as const,
      })),
      ...merchantOfframpAll.map((t) => ({
        ...t,
        amount: t.amount,
        _type: 'merchant_offramp' as const,
      })),
      ...merchantSwapAll.map((t) => ({
        ...t,
        amount: t.fromAmount,
        _type: 'merchant_swap' as const,
      })),
      ...bankTransferAll.map((t) => ({
        ...t,
        amount: t.amount,
        _type: 'bank_transfer' as const,
      })),
      ...otcAll.map((t) => ({ ...t, amount: t.amount, _type: 'otc' as const })),
      ...vasAll.map((t) => ({ ...t, amount: t.amount, _type: 'vas' as const })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const paginated = all.slice(skip, skip + limit);

    const paginatedRaw = paginated as any[];
    const userIds = [
      ...new Set(paginatedRaw.filter((t) => t.userId).map((t) => t.userId)),
    ];
    const merchantIds = [
      ...new Set(
        paginatedRaw.filter((t) => t.merchantId).map((t) => t.merchantId),
      ),
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true },
        })
      : [];
    const merchants = merchantIds.length
      ? await this.prisma.merchant.findMany({
          where: { id: { in: merchantIds } },
          select: { id: true, name: true },
        })
      : [];
    const userMap = new Map(users.map((u: any) => [u.id, u.email]));
    const merchantMap = new Map(merchants.map((m: any) => [m.id, m.name]));

    return {
      data: paginatedRaw.map((t) => ({
        id: t.id,
        reference: t.reference,
        amount: t.amount,
        status: t.status,
        createdAt: t.createdAt,
        type: t._type,
        user: t.userId ? (userMap.get(t.userId) ?? null) : null,
        merchant: t.merchantId ? (merchantMap.get(t.merchantId) ?? null) : null,
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getTransactionsSummary(
    period: 'today' | '7d' | '30d' | '90d' | 'all' = 'all',
  ) {
    const now = new Date();
    let startDate: Date | undefined;
    switch (period) {
      case 'today': {
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        startDate = startOfDay;
        break;
      }
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = undefined;
        break;
    }

    const dateFilter = startDate
      ? { createdAt: { gte: startDate } }
      : undefined;

    const [
      onramp,
      offramp,
      swap,
      merchantOnramp,
      merchantOfframp,
      merchantSwap,
      otc,
      bankTransfers,
      vasTxns,
    ] = await Promise.all([
      this.prisma.onrampTransaction.findMany({
        where: dateFilter,
        select: { id: true, amount: true, status: true, createdAt: true },
      }),
      this.prisma.offrampTransaction.findMany({
        where: dateFilter,
        select: {
          id: true,
          amount: true,
          status: true,
          swapId: true,
          createdAt: true,
        },
      }),
      this.prisma.swapTransaction.findMany({
        where: dateFilter,
        select: {
          id: true,
          fromAmount: true,
          toAmount: true,
          status: true,
          offrampTransaction: { select: { id: true, amount: true } },
          createdAt: true,
        },
      }),
      this.prisma.merchantOnrampTransaction.findMany({
        where: dateFilter,
        select: { id: true, amount: true, status: true, createdAt: true },
      }),
      this.prisma.merchantOfframpTransaction.findMany({
        where: dateFilter,
        select: {
          id: true,
          amount: true,
          status: true,
          reference: true,
          createdAt: true,
        },
      }),
      this.prisma.merchantSwapTransaction.findMany({
        where: dateFilter,
        select: {
          id: true,
          fromAmount: true,
          toAmount: true,
          feeAmount: true,
          status: true,
          reference: true,
          createdAt: true,
        },
      }),
      this.prisma.otcTransaction.findMany({
        where: dateFilter,
        select: { id: true, amount: true, status: true, createdAt: true },
      }),
      this.prisma.merchantBankTransfer.findMany({
        where: dateFilter,
        select: { id: true, amount: true, status: true, createdAt: true },
      }),
      this.prisma.vasTransaction.findMany({
        where: dateFilter,
        select: { id: true, amount: true, status: true, createdAt: true },
      }),
    ]);

    const allTxIds = [
      ...onramp.map((t) => t.id),
      ...offramp.map((t) => t.id),
      ...swap.map((t) => t.id),
      ...swap
        .filter((t) => t.offrampTransaction)
        .map((t) => t.offrampTransaction!.id),
      ...merchantOnramp.map((t) => t.id),
      ...merchantOfframp.map((t) => t.id),
      ...merchantSwap.map((t) => t.id),
      ...otc.map((t) => t.id),
      ...bankTransfers.map((t) => t.id),
      ...vasTxns.map((t) => t.id),
    ];

    const fees = allTxIds.length
      ? await this.prisma.transactionFee.findMany({
          where: { transactionId: { in: allTxIds } },
          select: { transactionId: true, feeAmount: true, feeType: true },
        })
      : [];

    const feesByTxId = new Map<string, number>();
    const feeTotals: Record<string, number> = {
      provider_fee: 0,
      vat: 0,
      stamp_duty: 0,
    };
    for (const f of fees) {
      const amt = Number(f.feeAmount) || 0;
      if (f.feeType in feeTotals) feeTotals[f.feeType] += amt;
      feesByTxId.set(
        f.transactionId,
        (feesByTxId.get(f.transactionId) ?? 0) + amt,
      );
    }
    const totalFees = Object.values(feeTotals).reduce((s, v) => s + v, 0);

    const merchantSwapReferences = new Set(
      merchantSwap.map((tx) => tx.reference),
    );
    const merchantOfframpByReference = new Map(
      merchantOfframp.map((tx) => [tx.reference, tx]),
    );

    const isActive = (s: string) => ['COMPLETED', 'PROCESSING'].includes(s);
    const isCompleted = (s: string) => s === 'COMPLETED';

    const activeOnramp = [
      ...onramp.filter((t) => isActive(t.status)),
      ...merchantOnramp.filter((t) => isActive(t.status)),
    ];
    const onrampTotalAmount = activeOnramp.reduce(
      (s, t) => s + (Number(t.amount) || 0),
      0,
    );
    const onrampTotalFees = activeOnramp.reduce(
      (s, t) => s + (feesByTxId.get(t.id) ?? 0),
      0,
    );

    const activeOfframp = [
      ...offramp.filter((t) => isActive(t.status) && !t.swapId),
      ...merchantOfframp.filter(
        (t) => isActive(t.status) && !merchantSwapReferences.has(t.reference),
      ),
    ];
    const offrampTotalAmount = activeOfframp.reduce(
      (s, t) => s + (Number(t.amount) || 0),
      0,
    );
    const offrampTotalFees = activeOfframp.reduce(
      (s, t) => s + (feesByTxId.get(t.id) ?? 0),
      0,
    );

    const activeUserSwap = swap.filter((t) => isActive(t.status));
    const activeMerchantSwap = merchantSwap.filter((t) => isActive(t.status));
    const swapTotalFromAmount =
      activeUserSwap.reduce((s, t) => s + (Number(t.fromAmount) || 0), 0) +
      activeMerchantSwap.reduce((s, t) => s + (Number(t.fromAmount) || 0), 0);
    const swapTotalToAmount =
      activeUserSwap.reduce((s, t) => s + (Number(t.toAmount) || 0), 0) +
      activeMerchantSwap.reduce((s, t) => s + (Number(t.toAmount) || 0), 0);
    const swapTotalFees =
      activeUserSwap.reduce((s, t) => s + (feesByTxId.get(t.id) ?? 0), 0) +
      activeMerchantSwap.reduce(
        (s, t) => s + (Number(t.feeAmount) || 0) + (feesByTxId.get(t.id) ?? 0),
        0,
      );

    const activeBankTransfers = bankTransfers.filter(
      (t) => t.status === 'COMPLETED' || t.status === 'PROCESSING',
    );
    const bankTransferTotalAmount = activeBankTransfers.reduce(
      (s, t) => s + (Number(t.amount) || 0),
      0,
    );
    const bankTransferTotalFees = activeBankTransfers.reduce(
      (s, t) => s + (feesByTxId.get(t.id) ?? 0),
      0,
    );

    const activeVas = vasTxns.filter(
      (t) => t.status === 'COMPLETED' || t.status === 'PROCESSING',
    );
    const vasTotalAmount = activeVas.reduce(
      (s, t) => s + (Number(t.amount) || 0),
      0,
    );
    const vasTotalFees = activeVas.reduce(
      (s, t) => s + (feesByTxId.get(t.id) ?? 0),
      0,
    );

    const activeOtc = otc.filter((t) => isActive(t.status));
    const otcTotalAmount = activeOtc.reduce(
      (s, t) => s + (Number(t.amount) || 0),
      0,
    );
    const otcTotalFees = activeOtc.reduce(
      (s, t) => s + (feesByTxId.get(t.id) ?? 0),
      0,
    );

    const allTx = [
      ...onramp,
      ...offramp,
      ...swap,
      ...merchantOnramp,
      ...merchantOfframp,
      ...merchantSwap,
      ...otc,
      ...bankTransfers,
      ...vasTxns,
    ];
    const totalCompletedCount = allTx.filter((t) =>
      isCompleted(t.status),
    ).length;

    return {
      period,
      totalVolume:
        onrampTotalAmount +
        offrampTotalAmount +
        swapTotalFromAmount +
        otcTotalAmount +
        bankTransferTotalAmount +
        vasTotalAmount,
      totalCount: allTx.length,
      successRate:
        allTx.length > 0
          ? Math.round((totalCompletedCount / allTx.length) * 100)
          : 0,

      onramp: {
        count: activeOnramp.length,
        totalAmount: onrampTotalAmount,
        totalFees: onrampTotalFees,
      },
      offramp: {
        count: activeOfframp.length,
        totalAmount: offrampTotalAmount,
        totalFees: offrampTotalFees,
      },
      swap: {
        count: activeUserSwap.length + activeMerchantSwap.length,
        totalFromAmount: swapTotalFromAmount,
        totalToAmount: swapTotalToAmount,
        totalFees: swapTotalFees,
      },
      bankTransfer: {
        count: activeBankTransfers.length,
        totalAmount: bankTransferTotalAmount,
        totalFees: bankTransferTotalFees,
      },
      vas: {
        count: activeVas.length,
        totalAmount: vasTotalAmount,
        totalFees: vasTotalFees,
      },
      otc: {
        count: activeOtc.length,
        totalAmount: otcTotalAmount,
        totalFees: otcTotalFees,
      },
      fees: {
        ...feeTotals,
        total: totalFees,
      },
      netVolume: onrampTotalAmount - offrampTotalAmount,
    };
  }

  async getTransactionsAnalytics(
    period: 'daily' | 'weekly' | 'monthly' = 'daily',
  ) {
    const now = new Date();
    let startDate: Date;
    let dateFormat: string;

    switch (period) {
      case 'weekly':
        startDate = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
        dateFormat = 'YYYY-"W"IW';
        break;
      case 'monthly':
        startDate = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000);
        dateFormat = 'YYYY-MM';
        break;
      case 'daily':
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFormat = 'YYYY-MM-DD';
        break;
    }

    const dateFilter = { createdAt: { gte: startDate } };

    const [
      onrampTxns,
      offrampTxns,
      swapTxns,
      merchantOnrampTxns,
      merchantOfframpTxns,
      merchantSwapTxns,
      otcTxns,
      bankTransfers,
      vasTxns,
    ] = await Promise.all([
      this.prisma.onrampTransaction.findMany({
        where: dateFilter,
        select: { id: true, amount: true, status: true, createdAt: true },
      }),
      this.prisma.offrampTransaction.findMany({
        where: dateFilter,
        select: {
          id: true,
          amount: true,
          status: true,
          swapId: true,
          createdAt: true,
        },
      }),
      this.prisma.swapTransaction.findMany({
        where: dateFilter,
        select: {
          id: true,
          fromAmount: true,
          toAmount: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.merchantOnrampTransaction.findMany({
        where: dateFilter,
        select: { id: true, amount: true, status: true, createdAt: true },
      }),
      this.prisma.merchantOfframpTransaction.findMany({
        where: dateFilter,
        select: {
          id: true,
          amount: true,
          status: true,
          reference: true,
          createdAt: true,
        },
      }),
      this.prisma.merchantSwapTransaction.findMany({
        where: dateFilter,
        select: {
          id: true,
          fromAmount: true,
          toAmount: true,
          feeAmount: true,
          status: true,
          reference: true,
          createdAt: true,
        },
      }),
      this.prisma.otcTransaction.findMany({
        where: dateFilter,
        select: { id: true, amount: true, status: true, createdAt: true },
      }),
      this.prisma.merchantBankTransfer.findMany({
        where: dateFilter,
        select: { id: true, amount: true, status: true, createdAt: true },
      }),
      this.prisma.vasTransaction.findMany({
        where: dateFilter,
        select: { id: true, amount: true, status: true, createdAt: true },
      }),
    ]);

    const allTxIds = [
      ...onrampTxns.map((t) => t.id),
      ...offrampTxns.map((t) => t.id),
      ...swapTxns.map((t) => t.id),
      ...merchantOnrampTxns.map((t) => t.id),
      ...merchantOfframpTxns.map((t) => t.id),
      ...merchantSwapTxns.map((t) => t.id),
      ...otcTxns.map((t) => t.id),
      ...bankTransfers.map((t) => t.id),
      ...vasTxns.map((t) => t.id),
    ];
    const feeRecords = allTxIds.length
      ? await this.prisma.transactionFee.findMany({
          where: { transactionId: { in: allTxIds } },
          select: { transactionId: true, feeAmount: true },
        })
      : [];
    const feeByTxId = new Map<string, number>();
    for (const f of feeRecords) {
      const amt = Number(f.feeAmount) || 0;
      feeByTxId.set(
        f.transactionId,
        (feeByTxId.get(f.transactionId) ?? 0) + amt,
      );
    }

    type Bucket = {
      date: string;
      onrampVolume: number;
      onrampCount: number;
      offrampVolume: number;
      offrampCount: number;
      swapVolume: number;
      swapCount: number;
      bankTransferVolume: number;
      bankTransferCount: number;
      vasVolume: number;
      vasCount: number;
      otcVolume: number;
      otcCount: number;
      totalVolume: number;
      totalCount: number;
      totalFees: number;
    };

    const bucketMap = new Map<string, Bucket>();

    const getBucketKey = (date: Date): string => {
      const d = new Date(date);
      if (dateFormat === 'YYYY-MM-DD') return d.toISOString().split('T')[0];
      if (dateFormat === 'YYYY-"W"IW') {
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - weekStart.getDay());
        return weekStart.toISOString().split('T')[0];
      }
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    const ensureBucket = (key: string) => {
      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          date: key,
          onrampVolume: 0,
          onrampCount: 0,
          offrampVolume: 0,
          offrampCount: 0,
          swapVolume: 0,
          swapCount: 0,
          bankTransferVolume: 0,
          bankTransferCount: 0,
          vasVolume: 0,
          vasCount: 0,
          otcVolume: 0,
          otcCount: 0,
          totalVolume: 0,
          totalCount: 0,
          totalFees: 0,
        });
      }
    };

    const isCompleted = (s: string) => s === 'COMPLETED';

    for (const t of onrampTxns.filter((t) => isCompleted(t.status))) {
      const key = getBucketKey(t.createdAt);
      ensureBucket(key);
      const b = bucketMap.get(key)!;
      const amt = Number(t.amount) || 0;
      b.onrampCount++;
      b.onrampVolume += amt;
      b.totalVolume += amt;
      b.totalCount++;
      b.totalFees += feeByTxId.get(t.id) ?? 0;
    }
    for (const t of merchantOnrampTxns.filter((t) => isCompleted(t.status))) {
      const key = getBucketKey(t.createdAt);
      ensureBucket(key);
      const b = bucketMap.get(key)!;
      const amt = Number(t.amount) || 0;
      b.onrampCount++;
      b.onrampVolume += amt;
      b.totalVolume += amt;
      b.totalCount++;
      b.totalFees += feeByTxId.get(t.id) ?? 0;
    }

    for (const t of offrampTxns.filter(
      (t) => isCompleted(t.status) && !t.swapId,
    )) {
      const key = getBucketKey(t.createdAt);
      ensureBucket(key);
      const b = bucketMap.get(key)!;
      const amt = Number(t.amount) || 0;
      b.offrampCount++;
      b.offrampVolume += amt;
      b.totalVolume += amt;
      b.totalCount++;
      b.totalFees += feeByTxId.get(t.id) ?? 0;
    }
    const merchantSwapRefs = new Set(merchantSwapTxns.map((t) => t.reference));
    for (const t of merchantOfframpTxns.filter(
      (t) => isCompleted(t.status) && !merchantSwapRefs.has(t.reference),
    )) {
      const key = getBucketKey(t.createdAt);
      ensureBucket(key);
      const b = bucketMap.get(key)!;
      const amt = Number(t.amount) || 0;
      b.offrampCount++;
      b.offrampVolume += amt;
      b.totalVolume += amt;
      b.totalCount++;
      b.totalFees += feeByTxId.get(t.id) ?? 0;
    }

    for (const t of swapTxns.filter((t) => isCompleted(t.status))) {
      const key = getBucketKey(t.createdAt);
      ensureBucket(key);
      const b = bucketMap.get(key)!;
      b.swapCount++;
      b.totalCount++;
      b.totalFees += feeByTxId.get(t.id) ?? 0;
    }
    for (const t of merchantSwapTxns.filter((t) => isCompleted(t.status))) {
      const key = getBucketKey(t.createdAt);
      ensureBucket(key);
      const b = bucketMap.get(key)!;
      const amt = Number(t.fromAmount) || 0;
      b.swapCount++;
      b.swapVolume += amt;
      b.totalVolume += amt;
      b.totalCount++;
      b.totalFees += (Number(t.feeAmount) || 0) + (feeByTxId.get(t.id) ?? 0);
    }

    for (const t of otcTxns.filter((t) => isCompleted(t.status))) {
      const key = getBucketKey(t.createdAt);
      ensureBucket(key);
      const b = bucketMap.get(key)!;
      const amt = Number(t.amount) || 0;
      b.otcCount++;
      b.otcVolume += amt;
      b.totalVolume += amt;
      b.totalCount++;
      b.totalFees += feeByTxId.get(t.id) ?? 0;
    }

    for (const t of bankTransfers.filter(
      (t) => t.status === 'COMPLETED' || t.status === 'PENDING',
    )) {
      const key = getBucketKey(t.createdAt);
      ensureBucket(key);
      const b = bucketMap.get(key)!;
      const amt = Number(t.amount) || 0;
      b.bankTransferCount++;
      b.bankTransferVolume += amt;
      b.totalVolume += amt;
      b.totalCount++;
      b.totalFees += feeByTxId.get(t.id) ?? 0;
    }

    for (const t of vasTxns.filter(
      (t) => t.status === 'COMPLETED' || t.status === 'PENDING',
    )) {
      const key = getBucketKey(t.createdAt);
      ensureBucket(key);
      const b = bucketMap.get(key)!;
      const amt = Number(t.amount) || 0;
      b.vasCount++;
      b.vasVolume += amt;
      b.totalVolume += amt;
      b.totalCount++;
      b.totalFees += feeByTxId.get(t.id) ?? 0;
    }

    return Array.from(bucketMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }
}
