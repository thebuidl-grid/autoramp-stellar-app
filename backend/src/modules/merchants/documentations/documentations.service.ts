import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateDocumentationDto } from './dto/create-documentation.dto';
import { UpdateDocumentationDto } from './dto/update-documentation.dto';

@Injectable()
export class DocumentationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDocumentationDto) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: dto.merchantId },
    });

    if (!merchant) {
      throw new NotFoundException(
        `Merchant with ID ${dto.merchantId} not found`,
      );
    }

    return this.prisma.merchantDocumentation.create({
      data: dto as any,
    });
  }

  async findAll(merchantId?: string) {
    return this.prisma.merchantDocumentation.findMany({
      where: merchantId ? { merchantId } : {},
    });
  }

  async findOne(id: string) {
    const documentation = await this.prisma.merchantDocumentation.findUnique({
      where: { id },
    });

    if (!documentation) {
      throw new NotFoundException(`Documentation with ID ${id} not found`);
    }

    return documentation;
  }

  async update(id: string, dto: UpdateDocumentationDto) {
    const documentation = await this.prisma.merchantDocumentation.findUnique({
      where: { id },
    });

    if (!documentation) {
      throw new NotFoundException(`Documentation with ID ${id} not found`);
    }

    return this.prisma.merchantDocumentation.update({
      where: { id },
      data: dto as any,
    });
  }

  async remove(id: string) {
    const documentation = await this.prisma.merchantDocumentation.findUnique({
      where: { id },
    });

    if (!documentation) {
      throw new NotFoundException(`Documentation with ID ${id} not found`);
    }

    return this.prisma.merchantDocumentation.delete({
      where: { id },
    });
  }
}
