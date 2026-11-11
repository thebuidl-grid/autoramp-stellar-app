import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { OtpService } from '../../auth/services/otp.service';
import { CreateUserBankAccountDto } from './dto/create-bank-account.dto';
import { CompleteUserBankAccountVerificationDto } from './dto/complete-verification.dto';

@Injectable()
export class UserBankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
  ) {}

  async initiateVerification(userId: string, email: string) {
    // We expect the email to match the user's email usually, but can be any email they have access to.
    const { success, message } = await this.otpService.sendOtp(
      email,
      'BANK_ACCOUNT_VERIFICATION',
    );
    return { success, message };
  }

  async completeVerification(
    userId: string,
    dto: CompleteUserBankAccountVerificationDto,
  ) {
    // 1. Verify OTP
    await this.otpService.verifyOtp(
      dto.email,
      dto.code,
      'BANK_ACCOUNT_VERIFICATION',
    );

    // 2. Create bank account
    return this.create(userId, dto.bankAccount);
  }

  async create(userId: string, dto: CreateUserBankAccountDto) {
    return this.prisma.userBankAccount.create({
      data: {
        ...dto,
        userId,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.userBankAccount.findMany({
      where: { userId },
    });
  }

  async findOne(id: string, userId: string) {
    const bankAccount = await this.prisma.userBankAccount.findUnique({
      where: { id },
    });

    if (!bankAccount || bankAccount.userId !== userId) {
      throw new NotFoundException(`Bank account not found`);
    }

    return bankAccount;
  }

  async remove(id: string, userId: string) {
    const bankAccount = await this.findOne(id, userId);

    return this.prisma.userBankAccount.delete({
      where: { id: bankAccount.id },
    });
  }
}
