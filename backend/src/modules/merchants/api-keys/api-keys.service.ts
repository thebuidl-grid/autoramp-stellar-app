import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import * as crypto from 'crypto';
import { CreateMerchantApiKeyDto } from './dto/create-api-key.dto';
import { UpdateMerchantApiKeyDto } from './dto/update-api-key.dto';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMerchantApiKeyDto) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: dto.merchantId },
    });

    if (!merchant) {
      throw new NotFoundException(
        `Merchant with ID ${dto.merchantId} not found`,
      );
    }

    const rawKey = `sk_live_${crypto.randomBytes(32).toString('hex')}`;
    const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 12);

    const apiKey = await this.prisma.merchantApiKey.create({
      data: {
        merchantId: dto.merchantId,
        key: hashedKey,
        keyPrefix,
        name: dto.name || null,
        metadata: dto.metadata || {},
      },
      select: {
        id: true,
        merchantId: true,
        keyPrefix: true,
        name: true,
        isActive: true,
        createdAt: true,
        expiresAt: true,
        metadata: true,
      },
    });

    return {
      ...apiKey,
      key: rawKey,
      message: 'Please save this API key securely. It will not be shown again.',
    };
  }

  async findAll(merchantId?: string) {
    return this.prisma.merchantApiKey.findMany({
      where: merchantId ? { merchantId } : {},
      select: {
        id: true,
        merchantId: true,
        keyPrefix: true,
        name: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
      },
    });
  }

  async findOne(id: string) {
    const apiKey = await this.prisma.merchantApiKey.findUnique({
      where: { id },
      select: {
        id: true,
        merchantId: true,
        keyPrefix: true,
        name: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
        metadata: true,
      },
    });

    if (!apiKey) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }

    return apiKey;
  }

  async update(id: string, dto: UpdateMerchantApiKeyDto) {
    const apiKeyExists = await this.prisma.merchantApiKey.findUnique({
      where: { id },
    });

    if (!apiKeyExists) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }

    return this.prisma.merchantApiKey.update({
      where: { id },
      data: dto as any,
    });
  }

  async remove(id: string) {
    const apiKeyExists = await this.prisma.merchantApiKey.findUnique({
      where: { id },
    });

    if (!apiKeyExists) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }

    return this.prisma.merchantApiKey.delete({
      where: { id },
    });
  }
}
