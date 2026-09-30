import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Corridor } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateCorridorDto } from './dto/create-corridor.dto';
import { UpdateCorridorDto } from './dto/update-corridor.dto';

@Injectable()
export class CorridorService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCorridorDto): Promise<Corridor> {
    const existing = await this.prisma.corridor.findUnique({
      where: { countryCode_fiatCurrency: { countryCode: dto.countryCode, fiatCurrency: dto.fiatCurrency } },
    });
    if (existing) {
      throw new ConflictException(
        `Corridor already exists for ${dto.countryCode}/${dto.fiatCurrency}`,
      );
    }
    return this.prisma.corridor.create({ data: dto });
  }

  async findAll(params: { activeOnly?: boolean } = {}): Promise<Corridor[]> {
    return this.prisma.corridor.findMany({
      where: params.activeOnly ? { isActive: true } : undefined,
      orderBy: [{ countryCode: 'asc' }, { fiatCurrency: 'asc' }],
    });
  }

  async findOne(id: string): Promise<Corridor> {
    const corridor = await this.prisma.corridor.findUnique({ where: { id } });
    if (!corridor) {
      throw new NotFoundException(`Corridor ${id} not found`);
    }
    return corridor;
  }

  /**
   * Resolves which stablecoin + RampProcessor to use for a given
   * country/fiat pair.
   */
  async resolve(countryCode: string, fiatCurrency: string): Promise<Corridor> {
    const corridor = await this.prisma.corridor.findUnique({
      where: { countryCode_fiatCurrency: { countryCode, fiatCurrency } },
    });
    if (!corridor || !corridor.isActive) {
      throw new NotFoundException(`No active corridor for ${countryCode}/${fiatCurrency}`);
    }
    return corridor;
  }

  /**
   * Same lookup as `resolve`, keyed by fiat currency alone — the country is
   * implied (one active corridor per currency in practice), so onramp/
   * offramp requests only need to carry a `currency` field, not a full
   * country+currency pair.
   */
  async findByCurrency(fiatCurrency: string): Promise<Corridor> {
    const corridor = await this.prisma.corridor.findFirst({
      where: { fiatCurrency, isActive: true },
    });
    if (!corridor) {
      throw new NotFoundException(`No active corridor for currency ${fiatCurrency}`);
    }
    return corridor;
  }

  /**
   * Looks up a corridor by its Stellar asset code (e.g. 'CNGN', 'CGHS') —
   * used by the swap module, which identifies assets by code rather than
   * by fiat currency.
   */
  async findByStablecoinCode(stablecoinCode: string): Promise<Corridor> {
    const corridor = await this.prisma.corridor.findFirst({
      where: { stablecoinCode, isActive: true },
    });
    if (!corridor) {
      throw new NotFoundException(`No active corridor for stablecoin ${stablecoinCode}`);
    }
    return corridor;
  }

  async update(id: string, dto: UpdateCorridorDto): Promise<Corridor> {
    await this.findOne(id);
    return this.prisma.corridor.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<Corridor> {
    await this.findOne(id);
    return this.prisma.corridor.delete({ where: { id } });
  }
}
