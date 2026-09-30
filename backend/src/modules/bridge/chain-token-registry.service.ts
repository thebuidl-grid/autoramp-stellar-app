import { Injectable, NotFoundException } from '@nestjs/common';
import { ChainToken } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ChainRegistryService } from './chain-registry.service';

/**
 * Registry of bridgeable-in stablecoins per EVM chain, beyond the chain's
 * own USDC (Chain.usdcAddress) — mirrors ChainRegistryService's shape.
 * Adding a new source token on a chain is a row here, not a code change.
 */
@Injectable()
export class ChainTokenRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chainRegistry: ChainRegistryService,
  ) {}

  async findAll(chainName: string, params: { activeOnly?: boolean } = {}): Promise<ChainToken[]> {
    const chain = await this.chainRegistry.findByName(chainName);
    return this.prisma.chainToken.findMany({
      where: { chainId: chain.id, ...(params.activeOnly ? { isActive: true } : {}) },
      orderBy: { tokenCode: 'asc' },
    });
  }

  async findByCode(chainName: string, tokenCode: string): Promise<ChainToken> {
    const chain = await this.chainRegistry.findByName(chainName);
    const token = await this.prisma.chainToken.findUnique({
      where: { chainId_tokenCode: { chainId: chain.id, tokenCode: tokenCode.toUpperCase() } },
    });
    if (!token || !token.isActive) {
      throw new NotFoundException(`No active token "${tokenCode}" registered for chain "${chainName}"`);
    }
    return token;
  }
}
