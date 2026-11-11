import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MFBService } from '../safehaven/safehaven.service';
import { generateTrxReference } from '../../utils/reference.util';
import {
  VerifyVasEntityDto,
  PurchaseAirtimeDto,
  PurchaseDataDto,
  PurchaseCableTvDto,
  PayUtilityDto,
} from './dto/vas.dto';

@Injectable()
export class VasService {
  private readonly logger = new Logger(VasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly safehavenService: MFBService,
  ) {}

  /**
   * Checks that the debit account has sufficient funds for the requested amount.
   * Always fetches fresh balance from SafeHaven (no cache).
   * Fail-open: if the balance check itself fails, logs a warning and allows the transaction.
   */
  private async checkSufficientBalance(
    merchantId: string,
    debitAccountNumber: string,
    amount: number,
  ): Promise<void> {
    try {
      const [bankAccount, subAccount] = await Promise.all([
        this.prisma.merchantBankAccount.findUnique({
          where: { merchantId },
          select: { accountNumber: true, metadata: true },
        }),
        this.prisma.merchantSubAccount.findFirst({
          where: { merchantId, accountNumber: debitAccountNumber },
          select: { safehavenId: true, metadata: true },
        }),
      ]);

      let safehavenId: string | null = null;

      if (subAccount) {
        const meta = (subAccount.metadata as Record<string, unknown>) || {};
        safehavenId =
          subAccount.safehavenId ||
          (meta._id as string) ||
          (meta.safehavenId as string) ||
          null;
      } else if (
        bankAccount &&
        bankAccount.accountNumber === debitAccountNumber
      ) {
        const meta = (bankAccount.metadata as Record<string, unknown>) || {};
        safehavenId = (meta._id as string) || null;
      }

      if (!safehavenId) {
        this.logger.warn(
          `Balance check skipped: no SafeHaven ID found for account ${debitAccountNumber}`,
        );
        return;
      }

      const response = await this.safehavenService.getSubAccount(safehavenId);
      const data = (response as Record<string, unknown>)?.data ?? response;
      const balanceData = data as Record<string, unknown>;
      const balance = Number(
        balanceData?.availableBalance ?? balanceData?.accountBalance ?? 0,
      );

      if (balance < amount) {
        throw new HttpException(
          `Insufficient balance: account ${debitAccountNumber} has ₦${balance.toFixed(2)} but ₦${amount.toFixed(2)} is required`,
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.BAD_REQUEST
      ) {
        throw error;
      }
      this.logger.warn(
        `Balance check failed for ${debitAccountNumber}: ${(error as Error).message} — allowing transaction`,
      );
    }
  }

  async getServices() {
    return this.safehavenService.getVasServices();
  }

  async getService(serviceId: string) {
    return this.safehavenService.getVasService(serviceId);
  }

  async getCategories(serviceId: string) {
    return this.safehavenService.getVasServiceCategories(serviceId);
  }

  async getProducts(categoryId: string) {
    return this.safehavenService.getVasCategoryProducts(categoryId);
  }

  async verifyEntity(dto: VerifyVasEntityDto) {
    return this.safehavenService.verifyVasEntity({
      serviceCategoryId: dto.serviceCategoryId,
      entityNumber: dto.entityNumber,
    });
  }

  private async validateDebitAccount(
    merchantId: string,
    accountNumber: string,
  ) {
    const [bankAccount, settlementAccount, subAccount] = await Promise.all([
      this.prisma.merchantBankAccount.findUnique({
        where: { merchantId },
      }),
      this.prisma.merchantSettlementAccount.findUnique({
        where: { merchantId },
      }),
      this.prisma.merchantSubAccount.findFirst({
        where: { merchantId, accountNumber },
      }),
    ]);

    const validAccounts = [
      bankAccount?.accountNumber,
      settlementAccount?.accountNumber,
      subAccount?.accountNumber,
    ].filter(Boolean);

    if (!validAccounts.includes(accountNumber)) {
      throw new HttpException(
        'The debit account does not belong to this merchant',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async purchaseAirtime(
    merchantId: string,
    dto: PurchaseAirtimeDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    await this.validateDebitAccount(merchantId, dto.debitAccountNumber);
    await this.checkSufficientBalance(
      merchantId,
      dto.debitAccountNumber,
      dto.amount,
    );
    const reference = generateTrxReference(16, 'vas');

    const transaction = await this.prisma.vasTransaction.create({
      data: {
        merchantId,
        reference,
        serviceType: 'airtime',
        serviceCategoryId: dto.serviceCategoryId,
        amount: dto.amount,
        channel: dto.channel || 'WEB',
        phoneNumber: dto.phoneNumber,
        debitAccountNumber: dto.debitAccountNumber,
        status: 'PENDING',
        ipAddress,
        userAgent,
      },
    });

    try {
      const result = await this.safehavenService.payAirtime({
        serviceCategoryId: dto.serviceCategoryId,
        amount: dto.amount,
        channel: dto.channel || 'WEB',
        debitAccountNumber: dto.debitAccountNumber,
        phoneNumber: dto.phoneNumber,
        externalReference: reference,
        statusUrl: dto.statusUrl,
      });

      const safehavenId = result?.data?._id || result?._id;

      await this.prisma.vasTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'PROCESSING',
          safehavenId,
          providerResponse: result,
        },
      });

      return {
        transactionId: transaction.id,
        reference,
        status: 'PROCESSING',
        providerResponse: result,
      };
    } catch (error) {
      await this.prisma.vasTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'FAILED',
          providerResponse: { error: error.message } as any,
        },
      });
      throw error;
    }
  }

  async purchaseData(
    merchantId: string,
    dto: PurchaseDataDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    await this.validateDebitAccount(merchantId, dto.debitAccountNumber);
    await this.checkSufficientBalance(
      merchantId,
      dto.debitAccountNumber,
      dto.amount,
    );
    const reference = generateTrxReference(16, 'vas');

    const transaction = await this.prisma.vasTransaction.create({
      data: {
        merchantId,
        reference,
        serviceType: 'data',
        serviceCategoryId: dto.serviceCategoryId,
        bundleCode: dto.bundleCode,
        amount: dto.amount,
        channel: dto.channel || 'WEB',
        phoneNumber: dto.phoneNumber,
        debitAccountNumber: dto.debitAccountNumber,
        status: 'PENDING',
        ipAddress,
        userAgent,
      },
    });

    try {
      const result = await this.safehavenService.payData({
        serviceCategoryId: dto.serviceCategoryId,
        bundleCode: dto.bundleCode,
        amount: dto.amount,
        channel: dto.channel || 'WEB',
        debitAccountNumber: dto.debitAccountNumber,
        phoneNumber: dto.phoneNumber,
        externalReference: reference,
        statusUrl: dto.statusUrl,
      });

      const safehavenId = result?.data?._id || result?._id;

      await this.prisma.vasTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'PROCESSING',
          safehavenId,
          providerResponse: result,
        },
      });

      return {
        transactionId: transaction.id,
        reference,
        status: 'PROCESSING',
        providerResponse: result,
      };
    } catch (error) {
      await this.prisma.vasTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'FAILED',
          providerResponse: { error: error.message } as any,
        },
      });
      throw error;
    }
  }

  async purchaseCableTv(
    merchantId: string,
    dto: PurchaseCableTvDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    await this.validateDebitAccount(merchantId, dto.debitAccountNumber);
    await this.checkSufficientBalance(
      merchantId,
      dto.debitAccountNumber,
      dto.amount,
    );
    const reference = generateTrxReference(16, 'vas');

    const transaction = await this.prisma.vasTransaction.create({
      data: {
        merchantId,
        reference,
        serviceType: 'cable_tv',
        serviceCategoryId: dto.serviceCategoryId,
        bundleCode: dto.bundleCode,
        amount: dto.amount,
        channel: dto.channel || 'WEB',
        cardNumber: dto.cardNumber,
        debitAccountNumber: dto.debitAccountNumber,
        status: 'PENDING',
        ipAddress,
        userAgent,
      },
    });

    try {
      const result = await this.safehavenService.payCableTv({
        serviceCategoryId: dto.serviceCategoryId,
        bundleCode: dto.bundleCode,
        amount: dto.amount,
        channel: dto.channel || 'WEB',
        debitAccountNumber: dto.debitAccountNumber,
        cardNumber: dto.cardNumber,
        externalReference: reference,
      });

      const safehavenId = result?.data?._id || result?._id;

      await this.prisma.vasTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'PROCESSING',
          safehavenId,
          providerResponse: result,
        },
      });

      return {
        transactionId: transaction.id,
        reference,
        status: 'PROCESSING',
        providerResponse: result,
      };
    } catch (error) {
      await this.prisma.vasTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'FAILED',
          providerResponse: { error: error.message } as any,
        },
      });
      throw error;
    }
  }

  async payUtility(
    merchantId: string,
    dto: PayUtilityDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    await this.validateDebitAccount(merchantId, dto.debitAccountNumber);
    await this.checkSufficientBalance(
      merchantId,
      dto.debitAccountNumber,
      dto.amount,
    );
    const reference = generateTrxReference(16, 'vas');

    const transaction = await this.prisma.vasTransaction.create({
      data: {
        merchantId,
        reference,
        serviceType: 'utility',
        serviceCategoryId: dto.serviceCategoryId,
        amount: dto.amount,
        channel: dto.channel || 'WEB',
        meterNumber: dto.meterNumber,
        vendType: dto.vendType,
        debitAccountNumber: dto.debitAccountNumber,
        status: 'PENDING',
        ipAddress,
        userAgent,
      },
    });

    try {
      const result = await this.safehavenService.payUtility({
        serviceCategoryId: dto.serviceCategoryId,
        amount: dto.amount,
        channel: dto.channel || 'WEB',
        debitAccountNumber: dto.debitAccountNumber,
        meterNumber: dto.meterNumber,
        vendType: dto.vendType,
        externalReference: reference,
      });

      const safehavenId = result?.data?._id || result?._id;

      await this.prisma.vasTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'PROCESSING',
          safehavenId,
          providerResponse: result,
        },
      });

      return {
        transactionId: transaction.id,
        reference,
        status: 'PROCESSING',
        providerResponse: result,
      };
    } catch (error) {
      await this.prisma.vasTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'FAILED',
          providerResponse: { error: error.message } as any,
        },
      });
      throw error;
    }
  }

  async getTransactions(
    merchantId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.vasTransaction.findMany({
        where: { merchantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.vasTransaction.count({
        where: { merchantId },
      }),
    ]);

    return {
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTransactionById(merchantId: string, transactionId: string) {
    const transaction = await this.prisma.vasTransaction.findFirst({
      where: { id: transactionId, merchantId },
    });

    if (!transaction) {
      throw new HttpException(
        'VAS transaction not found',
        HttpStatus.NOT_FOUND,
      );
    }

    return transaction;
  }

  async getTransactionByReference(merchantId: string, reference: string) {
    const transaction = await this.prisma.vasTransaction.findFirst({
      where: { reference, merchantId },
    });

    if (!transaction) {
      throw new HttpException(
        'VAS transaction not found',
        HttpStatus.NOT_FOUND,
      );
    }

    return transaction;
  }

  async syncTransactionStatus(merchantId: string, transactionId: string) {
    const transaction = await this.prisma.vasTransaction.findFirst({
      where: { id: transactionId, merchantId },
    });

    if (!transaction) {
      throw new HttpException(
        'VAS transaction not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (!transaction.safehavenId) {
      return transaction;
    }

    try {
      const remoteTx = await this.safehavenService.getVasTransaction(
        transaction.safehavenId,
      );

      const remoteStatus = remoteTx?.data?.status || remoteTx?.status;
      const mappedStatus = this.mapStatus(remoteStatus);

      if (mappedStatus !== transaction.status) {
        await this.prisma.vasTransaction.update({
          where: { id: transaction.id },
          data: {
            status: mappedStatus,
            providerResponse: remoteTx,
            ...(mappedStatus === 'COMPLETED'
              ? { completedAt: new Date() }
              : {}),
          },
        });
      }

      return {
        ...transaction,
        status: mappedStatus,
        providerResponse: remoteTx,
      };
    } catch (error) {
      this.logger.error(
        `Failed to sync VAS transaction ${transactionId}: ${error.message}`,
      );
      return transaction;
    }
  }

  private mapStatus(
    shStatus: string,
  ): 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' {
    if (!shStatus) return 'PROCESSING';
    const status = shStatus.toLowerCase();
    if (status === 'completed' || status === 'success') return 'COMPLETED';
    if (status === 'failed' || status === 'declined') return 'FAILED';
    if (status === 'pending') return 'PENDING';
    if (status === 'cancelled' || status === 'canceled') return 'CANCELLED';
    return 'PROCESSING';
  }
}
