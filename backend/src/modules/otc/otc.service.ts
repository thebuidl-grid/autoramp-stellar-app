import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { MFBService } from '../safehaven/safehaven.service';
import {
  OnboardOtcDto,
  InitiateOtcTransactionDto,
  InitiateOtcOffRampTransactionDto,
  OtcIdentityType,
} from './dto/index.dto';
import { generateTrxReference } from '../../utils/reference.util';
import { encrypt, decrypt } from '../../utils/encryption.util';
import { RampService } from '../ramp/ramp.service';
import {
  OtcOnRampQuoteDto,
  OtcOnRampExecuteDto,
  OtcOffRampQuoteDto,
  OtcOffRampExecuteDto,
} from './dto/index.dto';

@Injectable()
export class OtcService {
  private readonly OTC_FLAT_FEE = 0; // 0 NGN flat fee per transaction
  private readonly logger = new Logger(OtcService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly safeHavenService: MFBService,
    private readonly configService: ConfigService,
    private readonly rampService: RampService,
  ) {}

  async onboardUser(userId: string, dto: OnboardOtcDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    try {
      const otcUser = await this.prisma.otcUser.upsert({
        where: { userId },
        create: {
          userId,
          bvn:
            dto.identityType === OtcIdentityType.BVN
              ? encrypt(dto.identityNumber)
              : null,
          nin:
            dto.identityType === OtcIdentityType.NIN
              ? encrypt(dto.identityNumber)
              : null,
          bvnVerifiedAt:
            dto.identityType === OtcIdentityType.BVN ? new Date() : null,
          ninVerifiedAt:
            dto.identityType === OtcIdentityType.NIN ? new Date() : null,
          bankCode: dto.bankCode,
          bankName: dto.bankName,
          accountName: dto.accountName,
          accountNumber: dto.accountNumber,
          safehavenDetails: {},
        },
        update: {
          bvn:
            dto.identityType === OtcIdentityType.BVN
              ? encrypt(dto.identityNumber)
              : undefined,
          nin:
            dto.identityType === OtcIdentityType.NIN
              ? encrypt(dto.identityNumber)
              : undefined,
          bvnVerifiedAt:
            dto.identityType === OtcIdentityType.BVN ? new Date() : undefined,
          ninVerifiedAt:
            dto.identityType === OtcIdentityType.NIN ? new Date() : undefined,
          bankCode: dto.bankCode,
          bankName: dto.bankName,
          accountName: dto.accountName,
          accountNumber: dto.accountNumber,
        },
      });

      // Decrypt for the response
      if (otcUser.bvn) otcUser.bvn = decrypt(otcUser.bvn);
      if (otcUser.nin) otcUser.nin = decrypt(otcUser.nin);

      return otcUser;
    } catch (error: any) {
      this.logger.error('OTC onboarding failed', error.stack);
      throw new BadRequestException(error.message || 'OTC onboarding failed');
    }
  }

  async initiateTransaction(userId: string, dto: InitiateOtcTransactionDto) {
    const otcUser = await this.prisma.otcUser.findUnique({
      where: { userId },
    });

    if (!otcUser) {
      throw new BadRequestException('User is not onboarded for OTC');
    }

    if (dto.quantity < 1) {
      throw new BadRequestException('Minimum quantity for OTC is 1 USD');
    }

    try {
      // 1. Get rate from Flint quote endpoint
      const quoteResult = await this.rampService.otcOnRampQuote({
        amount: dto.quantity,
        network: dto.network,
      });
      const rate = quoteResult?.data?.rate;
      if (!rate) {
        throw new BadRequestException(
          'Failed to fetch exchange rate from Flint',
        );
      }

      // 2. Use provider amounts
      const sourceAmount = quoteResult?.data?.source?.amount || dto.quantity;
      const destinationAmount = quoteResult?.data?.destination?.amount || 0;
      const flatFee = this.OTC_FLAT_FEE;

      const trxReference = randomUUID();

      // 3. Create Transaction Record
      const transaction = await this.prisma.otcTransaction.create({
        data: {
          userId,
          otcUserId: otcUser.id,
          reference: trxReference as any,
          amount: destinationAmount,
          fiatAmountReceived: destinationAmount,
          systemFee: flatFee,
          rate,
          networkFee: 0,
          feeCollected: flatFee,
          quantity: dto.quantity,
          tokenAmountSent: sourceAmount,
          network: dto.network,
          chain: dto.chain,
          token: dto.token,
          address: dto.address,
          memo: dto.memo,
          status: 'PENDING',
          meta: {
            quote: {
              rate,
              flatFee,
              sourceAmount,
              destinationAmount,
            },
            quoteProviderResponse: quoteResult,
          },
        },
      });

      // 4. Call Flint execute to get deposit account (instead of MFB)
      const webhookUrl =
        this.configService.get<string>('FLINT_WEBHOOK_URL') ||
        this.configService.get<string>('SH_WEBHOOK_URL');

      let flintDepositAccount: any = null;
      let issuance: any = null;
      let flintResult: any = null;

      try {
        flintResult = await this.rampService.otcOnRampExecute(userId, {
          amount: Math.round(dto.quantity),
          reference: trxReference,
          network: dto.network,
          notifyUrl: webhookUrl,
          destination: { address: dto.address },
        });

        flintDepositAccount = flintResult?.data?.deposit || null;

        if (flintDepositAccount) {
          issuance = {
            bankCode: flintDepositAccount.bank_code,
            accountNumber: flintDepositAccount.account_number,
            accountName: flintDepositAccount.account_name,
            bankName: flintDepositAccount.bank_name,
          };
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to execute Flint OTC onramp for transaction ${trxReference}`,
          error.stack,
        );
        flintResult = { error: error.message };
      }

      // Always save the provider response
      await this.prisma.otcTransaction.update({
        where: { id: transaction.id },
        data: {
          meta: {
            ...((transaction.meta as any) || {}),
            issuance,
            providerResponse: flintResult,
          },
        },
      });

      return {
        type: 'onramp',
        reference: trxReference,
        quote: {
          rate,
          flatFee,
          sourceAmount,
          destinationAmount,
        },
        issuance,
        destination: {
          address: dto.address,
        },
      };
    } catch (error: any) {
      this.logger.error('OTC transaction initiation failed', error.stack);
      throw new BadRequestException(
        error.message || 'OTC transaction initiation failed',
      );
    }
  }

  async getRate(userId: string, token: string = 'USDC', network?: string) {
    const quoteResult = await this.rampService.otcOnRampQuote({
      amount: 1,
      network,
    });
    return {
      rate: quoteResult?.data?.rate,
    };
  }

  async getStatus(reference: string) {
    const transaction = await this.prisma.otcTransaction.findFirst({
      where: {
        OR: [
          { reference: reference as any },
          { id: reference.match(/^[0-9a-fA-F-]{36}$/) ? reference : undefined },
        ],
      },
    });

    if (!transaction) {
      throw new BadRequestException('Transaction not found');
    }

    const { meta, ...rest } = transaction;
    const deposit = (meta as any)?.deposit || null;
    return {
      ...rest,
      network: transaction.network,
      issuance: (meta as any)?.issuance || null,
      deposit,
      expiresAt: deposit?.expiresAt || null,
      providerResponse: (meta as any)?.providerResponse || null,
    };
  }

  async getTransactions(userId: string) {
    const transactions = await this.prisma.otcTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return transactions.map((t) => {
      const { meta, ...rest } = t;
      return {
        ...rest,
        issuance: (meta as any)?.issuance || null,
      };
    });
  }

  async getTransaction(userId: string, id: string) {
    const transaction = await this.prisma.otcTransaction.findFirst({
      where: {
        userId,
        OR: [
          { reference: id as any },
          { id: id.match(/^[0-9a-fA-F-]{36}$/) ? id : undefined },
        ],
      },
    });

    if (!transaction) {
      throw new BadRequestException('Transaction not found');
    }

    const { meta, ...rest } = transaction;
    return {
      ...rest,
      issuance: (meta as any)?.issuance || null,
    };
  }

  async checkIsOtcEnabled(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { otcUser: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.otcUser) {
      if (user.otcUser.bvn) user.otcUser.bvn = decrypt(user.otcUser.bvn);
      if (user.otcUser.nin) user.otcUser.nin = decrypt(user.otcUser.nin);
    }

    return {
      isOTCEnabled: (user as any).isOTCEnabled || false,
      isOnboarded: !!user.otcUser,
      otcUser: user.otcUser,
    };
  }

  async otcOnRampQuote(dto: OtcOnRampQuoteDto): Promise<any> {
    const quoteResult = await this.rampService.otcOnRampQuote(dto);
    return {
      rate: quoteResult?.data?.rate,
    };
  }

  async otcOnRampExecute(
    userId: string,
    dto: OtcOnRampExecuteDto,
  ): Promise<any> {
    const result = await this.rampService.otcOnRampExecute(userId, dto);
    return {
      type: 'onramp',
      id: result?.data?.id || null,
      address:
        result?.data?.deposit?.address ||
        result?.data?.deposit?.crypto_address ||
        null,
      quote: result?.data?.quote || null,
      deposit: result?.data?.deposit || null,
      destination: {
        address: dto.destination.address,
      },
    };
  }

  async initiateOffRampTransaction(
    userId: string,
    dto: InitiateOtcOffRampTransactionDto,
  ) {
    const otcUser = await this.prisma.otcUser.findUnique({
      where: { userId },
    });

    if (!otcUser) {
      throw new BadRequestException('User is not onboarded for OTC');
    }

    if (dto.quantity < 1) {
      throw new BadRequestException(
        'Minimum quantity for OTC offramp is 1 USD',
      );
    }

    try {
      // 1. Get rate from Flint offramp quote endpoint
      const quoteResult = await this.rampService.otcOffRampQuote({
        amount: dto.quantity,
        network: dto.network,
      });
      const rate = quoteResult?.data?.rate;
      if (!rate) {
        throw new BadRequestException(
          'Failed to fetch exchange rate from Flint',
        );
      }

      // 2. Use provider amounts
      const sourceAmount = quoteResult?.data?.source?.amount || dto.quantity;
      const destinationAmount = quoteResult?.data?.destination?.amount || 0;
      const flatFee = this.OTC_FLAT_FEE;

      const trxReference = randomUUID();

      // 3. Create Transaction Record
      const transaction = await this.prisma.otcTransaction.create({
        data: {
          userId,
          otcUserId: otcUser.id,
          reference: trxReference as any,
          amount: destinationAmount,
          fiatAmountReceived: destinationAmount,
          systemFee: flatFee,
          rate,
          networkFee: 0,
          feeCollected: flatFee,
          quantity: dto.quantity,
          tokenAmountSent: sourceAmount,
          network: dto.network,
          chain: dto.chain,
          token: dto.token,
          address: dto.address,
          memo: dto.memo,
          status: 'PENDING',
          meta: {
            type: 'offramp',
            quote: {
              rate,
              flatFee,
              sourceAmount,
              destinationAmount,
            },
            quoteProviderResponse: quoteResult,
            destination: {
              bankCode: dto.bankCode,
              accountNumber: dto.accountNumber,
            },
          },
        },
      });

      // 4. Call Flint execute to get deposit address (user sends crypto here)
      const webhookUrl =
        this.configService.get<string>('FLINT_WEBHOOK_URL') ||
        this.configService.get<string>('SH_WEBHOOK_URL');

      let depositAddress: any = null;
      let flintResult: any = null;

      try {
        flintResult = await this.rampService.otcOffRampExecute(userId, {
          amount: Math.round(dto.quantity),
          reference: trxReference,
          network: dto.network,
          notifyUrl: webhookUrl,
          destination: {
            bankCode: dto.bankCode,
            accountNumber: dto.accountNumber,
          },
        });

        depositAddress = flintResult?.data?.deposit || null;
      } catch (error: any) {
        this.logger.error(
          `Failed to execute Flint OTC offramp for transaction ${trxReference}`,
          error.stack,
        );
        flintResult = { error: error.message };
      }

      const depositData = depositAddress
        ? {
            address: depositAddress.address || depositAddress.crypto_address,
            network: depositAddress.network,
            token: depositAddress.token || dto.token,
            memo: depositAddress.memo || depositAddress.tag,
            expiresAt:
              depositAddress.expires_at || depositAddress.expiry || null,
          }
        : null;

      // Always save the provider response
      await this.prisma.otcTransaction.update({
        where: { id: transaction.id },
        data: {
          meta: {
            ...((transaction.meta as any) || {}),
            deposit: depositData,
            providerResponse: flintResult,
          },
        },
      });

      return {
        type: 'offramp',
        reference: trxReference,
        quote: {
          rate,
          flatFee,
          sourceAmount,
          destinationAmount,
        },
        address: dto.address,
        depositAddress: depositData,
        destination: {
          bankCode: dto.bankCode,
          accountNumber: dto.accountNumber,
        },
      };
    } catch (error: any) {
      this.logger.error(
        'OTC offramp transaction initiation failed',
        error.stack,
      );
      throw new BadRequestException(
        error.message || 'OTC offramp transaction initiation failed',
      );
    }
  }

  async otcOffRampQuote(dto: OtcOffRampQuoteDto): Promise<any> {
    const quoteResult = await this.rampService.otcOffRampQuote(dto);
    return {
      rate: quoteResult?.data?.rate,
    };
  }

  async otcOffRampExecute(
    userId: string,
    dto: OtcOffRampExecuteDto,
  ): Promise<any> {
    const result = await this.rampService.otcOffRampExecute(userId, dto);
    return {
      type: 'offramp',
      id: result?.data?.id || null,
      address:
        result?.data?.deposit?.address ||
        result?.data?.deposit?.crypto_address ||
        null,
      quote: result?.data?.quote || null,
      deposit: result?.data?.deposit || null,
      destination: {
        bankCode: dto.destination.bankCode,
        accountNumber: dto.destination.accountNumber,
      },
    };
  }
}
