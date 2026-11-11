import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateDirectorDto } from './dto/create-director.dto';
import { UpdateDirectorDto } from './dto/update-director.dto';
import { encrypt, decrypt } from '../../../utils/encryption.util';

@Injectable()
export class DirectorsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDirectorDto) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: dto.merchantId },
    });

    if (!merchant) {
      throw new NotFoundException(
        `Merchant with ID ${dto.merchantId} not found`,
      );
    }

    const data = { ...dto } as any;
    if (data.bvn) {
      data.bvn = encrypt(data.bvn);
    }

    const director = await this.prisma.merchantDirector.create({
      data,
    });

    if (director.bvn) director.bvn = decrypt(director.bvn);
    return director;
  }

  async findAll(merchantId?: string) {
    const directors = await this.prisma.merchantDirector.findMany({
      where: merchantId ? { merchantId } : {},
    });

    return directors.map((director) => {
      if (director.bvn) director.bvn = decrypt(director.bvn);
      return director;
    });
  }

  async findOne(id: string) {
    const director = await this.prisma.merchantDirector.findUnique({
      where: { id },
    });

    if (!director) {
      throw new NotFoundException(`Director with ID ${id} not found`);
    }

    if (director.bvn) director.bvn = decrypt(director.bvn);

    return director;
  }

  async update(id: string, dto: UpdateDirectorDto) {
    const director = await this.prisma.merchantDirector.findUnique({
      where: { id },
    });

    if (!director) {
      throw new NotFoundException(`Director with ID ${id} not found`);
    }

    const data = { ...dto } as any;
    if (data.bvn) {
      data.bvn = encrypt(data.bvn);
    }

    const updatedDirector = await this.prisma.merchantDirector.update({
      where: { id },
      data,
    });

    if (updatedDirector.bvn) updatedDirector.bvn = decrypt(updatedDirector.bvn);
    return updatedDirector;
  }

  async remove(id: string) {
    const director = await this.prisma.merchantDirector.findUnique({
      where: { id },
    });

    if (!director) {
      throw new NotFoundException(`Director with ID ${id} not found`);
    }

    return this.prisma.merchantDirector.delete({
      where: { id },
    });
  }
}
