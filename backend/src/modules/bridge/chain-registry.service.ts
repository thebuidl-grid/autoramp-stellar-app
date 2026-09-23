import { Injectable, NotFoundException } from '@nestjs/common';
import { Chain } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/**
 * Registry of chains the CCTP bridge infra knows how to receive USDC
 * from. Mirrors CorridorService's shape — adding a new source chain is a
 * row here (plus relayer gas funding), not a code change.
 */
@Injectable()
export class ChainRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { activeOnly?: boolean } = {}): Promise<Chain[]> {
    return this.prisma.chain.findMany({
      where: params.activeOnly ? { isActive: true } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async findByName(name: string): Promise<Chain> {
    const chain = await this.prisma.chain.findUnique({ where: { name } });
    if (!chain || !chain.isActive) {
      throw new NotFoundException(`No active chain registered for "${name}"`);
    }
    return chain;
  }

  async findByCctpDomain(cctpDomain: number): Promise<Chain> {
    const chain = await this.prisma.chain.findUnique({ where: { cctpDomain } });
    if (!chain || !chain.isActive) {
      throw new NotFoundException(`No active chain registered for CCTP domain ${cctpDomain}`);
    }
    return chain;
  }
}
