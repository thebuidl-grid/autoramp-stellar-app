import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { OnboardingCreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: OnboardingCreateMerchantDto) {
    const existingMerchant = await this.prisma.merchant.findFirst({
      where: {
        OR: [
          { name: dto.name },
          { websiteUrl: dto.websiteUrl },
          { natureOfBusiness: dto.natureOfBusiness },
          { userId: dto.userId },
        ],
      },
    });

    if (existingMerchant) {
      throw new ConflictException(
        'Merchant with similar details already exists',
      );
    }

    return this.prisma.merchant.create({
      data: dto as any,
    });
  }

  async findAll() {
    return this.prisma.merchant.findMany({
      include: {
        user: {
          select: {
            email: true,
            contactName: true,
            isMerchant: true,
            isApiAccessApproved: true,
          },
        },
        bankAccount: {
          select: {
            id: true,
            fiatProvider: true,
            bankCode: true,
            accountNumber: true,
            accountName: true,
            bankName: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            bankAccounts: true,
          },
        },
        bankAccount: {
          select: {
            id: true,
            fiatProvider: true,
            bankCode: true,
            accountNumber: true,
            accountName: true,
            bankName: true,
          },
        },
        documentations: true,
        directors: true,
        shareholders: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${id} not found`);
    }

    return merchant;
  }

  async update(id: string, dto: UpdateMerchantDto) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${id} not found`);
    }

    return this.prisma.merchant.update({
      where: { id },
      data: dto as any,
    });
  }

  async remove(id: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${id} not found`);
    }

    return this.prisma.merchant.delete({
      where: { id },
    });
  }
}
