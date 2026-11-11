import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateShareholderDto } from './dto/create-shareholder.dto';
import { UpdateShareholderDto } from './dto/update-shareholder.dto';
import { encrypt, decrypt } from '../../../utils/encryption.util';

@Injectable()
export class ShareholdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateShareholderDto) {
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

    const shareholder = await this.prisma.merchantShareholder.create({
      data,
    });

    if (shareholder.bvn) shareholder.bvn = decrypt(shareholder.bvn);
    return shareholder;
  }

  async findAll(merchantId?: string) {
    const shareholders = await this.prisma.merchantShareholder.findMany({
      where: merchantId ? { merchantId } : {},
    });

    return shareholders.map((shareholder) => {
      if (shareholder.bvn) shareholder.bvn = decrypt(shareholder.bvn);
      return shareholder;
    });
  }

  async findOne(id: string) {
    const shareholder = await this.prisma.merchantShareholder.findUnique({
      where: { id },
    });

    if (!shareholder) {
      throw new NotFoundException(`Shareholder with ID ${id} not found`);
    }

    if (shareholder.bvn) shareholder.bvn = decrypt(shareholder.bvn);

    return shareholder;
  }

  async update(id: string, dto: UpdateShareholderDto) {
    const shareholder = await this.prisma.merchantShareholder.findUnique({
      where: { id },
    });

    if (!shareholder) {
      throw new NotFoundException(`Shareholder with ID ${id} not found`);
    }

    const data = { ...dto } as any;
    if (data.bvn) {
      data.bvn = encrypt(data.bvn);
    }

    const updatedShareholder = await this.prisma.merchantShareholder.update({
      where: { id },
      data,
    });

    if (updatedShareholder.bvn)
      updatedShareholder.bvn = decrypt(updatedShareholder.bvn);
    return updatedShareholder;
  }

  async remove(id: string) {
    const shareholder = await this.prisma.merchantShareholder.findUnique({
      where: { id },
    });

    if (!shareholder) {
      throw new NotFoundException(`Shareholder with ID ${id} not found`);
    }

    return this.prisma.merchantShareholder.delete({
      where: { id },
    });
  }
}
