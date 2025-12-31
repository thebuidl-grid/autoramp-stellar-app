
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';

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
}
