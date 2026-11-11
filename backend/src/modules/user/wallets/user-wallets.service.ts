import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateUserWalletDto } from './dto/create-wallet.dto';

@Injectable()
export class UserWalletsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateUserWalletDto) {
    // Check if wallet address already exists for this user on this network
    const existingWallet = await this.prisma.userWallet.findFirst({
      where: {
        userId,
        address: dto.address,
        network: dto.network,
      },
    });

    if (existingWallet) {
      throw new ForbiddenException(
        'This wallet address is already registered for this user on this network',
      );
    }

    return this.prisma.userWallet.create({
      data: {
        userId,
        address: dto.address,
        network: dto.network,
        name: dto.name,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.userWallet.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(id: string, userId: string) {
    const wallet = await this.prisma.userWallet.findUnique({
      where: { id },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (wallet.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this wallet',
      );
    }

    return this.prisma.userWallet.delete({
      where: { id },
    });
  }
}
