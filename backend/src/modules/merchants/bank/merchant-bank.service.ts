import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { FiatProviderService } from '../../providers/fiat-provider.service';
import { ProviderType } from '../../providers/provider-type.enum';
import { AuditService } from '../../../common/services/audit.service';
import {
  BalanceCacheService,
  BalanceData,
} from '../../../common/services/balance-cache.service';
import { MerchantCreateSubAccountDto } from './dto/merchant-create-sub-account.dto';
import { MerchantUpdateSubAccountDto } from './dto/merchant-update-sub-account.dto';
import { MerchantCreateVirtualAccountDto } from './dto/merchant-create-virtual-account.dto';
import { MerchantTransferDto } from './dto/merchant-transfer.dto';
import { MerchantNameEnquiryDto } from './dto/merchant-name-enquiry.dto';
import { MerchantInitiateVerificationDto } from './dto/merchant-initiate-verification.dto';
import { MerchantValidateVerificationDto } from './dto/merchant-validate-verification.dto';
import { SettingsService } from '../settings/settings.service.js';
import { NotificationsService } from '../notifications/notifications.service';
import { generateTrxReference } from '../../../utils/reference.util';
import { maskString, redactSensitiveFields } from '../../../utils/pii.util';

@Injectable()
export class MerchantBankService {
  private readonly logger = new Logger(MerchantBankService.name);
  private static readonly BALANCE_CACHE_TTL_MS =
    (parseInt(process.env.BALANCE_CACHE_TTL_MS || '', 10) || 60) * 1000;
  private readonly shWebhookUrl: string;
  private readonly safeHavenBankCode: string;
  private readonly safeHavenDebitAccountNumber: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly fiatProviderService: FiatProviderService,
    private readonly auditService: AuditService,
    private readonly settingsService: SettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly balanceCacheService: BalanceCacheService,
  ) {
    this.shWebhookUrl = this.configService.get<string>('SH_WEBHOOK_URL') || '';
    this.safeHavenBankCode =
      this.configService.get<string>('SAFEHAVEN_BANK_CODE') || '090286';
    this.safeHavenDebitAccountNumber =
      this.configService.get<string>('SAFEHAVEN_DEBIT_ACCOUNT_NUMBER') ||
      '0104127230';
  }

  /**
   * Checks that the debit account has sufficient funds for the requested amount.
   * Always fetches fresh balance from the provider (no cache).
   * Fail-open: if the balance check itself fails, logs a warning and allows the transaction.
   */
  private async checkSufficientBalance(
    merchantId: string,
    debitAccountNumber: string,
    amount: number,
    fiatProvider: ProviderType,
  ): Promise<void> {
    try {
      const { merchant } = await this.resolveMerchantAccount(merchantId);
      const subAccount = await this.prisma.merchantSubAccount.findFirst({
        where: { merchantId, accountNumber: debitAccountNumber },
        select: { safehavenId: true },
      });
      const meta = merchant.bankAccount?.metadata as Record<
        string,
        unknown
      > | null;
      const mainSafehavenId = (meta?._id as string) ?? null;
      const safehavenId = subAccount?.safehavenId ?? mainSafehavenId;
      const balance = await this.fiatProviderService.getAvailableBalance(
        safehavenId ?? debitAccountNumber,
        fiatProvider,
      );

      if (balance === null) {
        this.logger.warn(
          `Balance check unavailable for ${debitAccountNumber} — allowing transaction`,
        );
        return;
      }

      if (balance < amount) {
        throw new BadRequestException(
          `Insufficient balance: account ${debitAccountNumber} has ₦${balance.toFixed(2)} but ₦${amount.toFixed(2)} is required`,
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.warn(
        `Balance check failed for ${debitAccountNumber}: ${error.message} — allowing transaction`,
      );
    }
  }

  private async resolveMerchantAccount(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        bankAccount: true, // Merchant's internal SafeHaven account (bankCode=090286)
        settlementAccount: true, // Merchant's external bank account (GTBank, Access, etc)
        subAccounts: true, // Sub-accounts under the bank account
      },
    });

    if (!merchant) {
      throw new ForbiddenException('Merchant not found');
    }

    if (merchant.status !== 'VERIFIED') {
      throw new ForbiddenException('Merchant is not verified');
    }

    if (!merchant.bankAccount) {
      throw new BadRequestException(
        'No bank account found for this merchant. Please contact support.',
      );
    }

    const meta = merchant.bankAccount.metadata as Record<
      string,
      unknown
    > | null;
    const safehavenId = (meta?._id as string) ?? null;
    const bankAccountNumber = merchant.bankAccount.accountNumber;
    const bankAccountBankCode = merchant.bankAccount.bankCode;

    if (!bankAccountNumber || !bankAccountBankCode) {
      throw new BadRequestException(
        'Merchant bank account is incomplete. Please contact support.',
      );
    }

    // Settlement account (external bank - GTBank, Access, etc)
    const settlementAccount = merchant.settlementAccount;

    const fiatProvider =
      (merchant.bankAccount?.fiatProvider as ProviderType) ??
      ProviderType.PULSE_MFB;

    return {
      merchant,
      safehavenId,
      bankAccountNumber,
      bankAccountBankCode,
      settlementAccount,
      fiatProvider,
    };
  }

  async getMyAccount(merchantId: string) {
    const {
      merchant,
      safehavenId,
      bankAccountNumber,
      bankAccountBankCode,
      fiatProvider,
    } = await this.resolveMerchantAccount(merchantId);

    const isPulse = fiatProvider === ProviderType.PULSE_MFB;
    const accountId = isPulse ? bankAccountNumber : safehavenId;

    if (!isPulse && !safehavenId) {
      throw new BadRequestException(
        'MFB sub-account ID not found. Please contact support.',
      );
    }

    const redisBalance = await this.balanceCacheService.get(
      'merchant',
      merchantId,
    );
    if (redisBalance) {
      this.logger.log(`Balance Redis cache hit for merchant ${merchantId}`);
      return {
        accountId,
        accountNumber: bankAccountNumber,
        bankCode: bankAccountBankCode,
        ...redisBalance,
      };
    }

    const meta = (
      await this.prisma.merchantBankAccount.findUnique({
        where: { merchantId },
        select: { metadata: true },
      })
    )?.metadata as Record<string, unknown> | null;

    const cachedBalance = meta?.balance as BalanceData | undefined;
    const cachedAt = meta?.balanceFetchedAt as string | undefined;
    const now = Date.now();
    const cacheValid =
      cachedAt &&
      now - new Date(cachedAt).getTime() <
        MerchantBankService.BALANCE_CACHE_TTL_MS;

    if (cacheValid && cachedBalance) {
      this.logger.log(`Balance DB cache hit for merchant ${merchantId}`);
      const balanceData: BalanceData = {
        accountBalance: cachedBalance.accountBalance ?? 0,
        bookBalance: cachedBalance.bookBalance ?? 0,
        accountName: cachedBalance.accountName ?? '',
        status: cachedBalance.status ?? '',
      };
      await this.balanceCacheService.set('merchant', merchantId, balanceData);
      return {
        accountId,
        accountNumber: bankAccountNumber,
        bankCode: bankAccountBankCode,
        ...balanceData,
      };
    }

    this.logger.log(
      `Balance cache miss for merchant ${merchantId}, fetching from ${fiatProvider}`,
    );

    let balanceData: BalanceData;
    if (isPulse) {
      const balance = await this.fiatProviderService.getAvailableBalance(
        bankAccountNumber,
        fiatProvider,
      );
      balanceData = {
        accountBalance: balance ?? 0,
        bookBalance: balance ?? 0,
        accountName: merchant.bankAccount?.accountName ?? '',
        status: 'active',
      };
    } else {
      const response = await this.fiatProviderService.getSubAccount(
        { subAccountId: safehavenId },
        fiatProvider,
      );
      const data = response?.data ?? response;
      balanceData = {
        accountBalance: data?.accountBalance ?? 0,
        bookBalance: data?.bookBalance ?? 0,
        accountName: data?.accountName ?? '',
        status: data?.status ?? '',
      };
    }

    await Promise.all([
      this.balanceCacheService.set('merchant', merchantId, balanceData),
      this.prisma.merchantBankAccount.update({
        where: { merchantId },
        data: {
          metadata: {
            ...((meta as any) || {}),
            balance: balanceData,
            balanceFetchedAt: new Date().toISOString(),
          },
        },
      }),
    ]);

    return {
      accountId,
      accountNumber: bankAccountNumber,
      bankCode: bankAccountBankCode,
      ...balanceData,
    };
  }

  async createSubAccount(merchantId: string, dto: MerchantCreateSubAccountDto) {
    const { fiatProvider } = await this.resolveMerchantAccount(merchantId);

    this.logger.log(
      `createSubAccount: merchantId=${merchantId}, fiatProvider=${fiatProvider}`,
    );
    this.logger.log(
      `createSubAccount: dto=${JSON.stringify(redactSensitiveFields(dto))}`,
    );

    if (fiatProvider === ProviderType.SAFEHAVEN && !dto.identityType) {
      throw new BadRequestException(
        'identityType is required for SafeHaven sub-account creation',
      );
    }

    const start = Date.now();

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });

    const subRef = generateTrxReference(16, 'sub');

    try {
      const response = await this.fiatProviderService.createAccount(
        {
          phoneNumber: dto.phoneNumber,
          emailAddress: dto.emailAddress,
          externalReference: subRef,
          customerName: dto.emailAddress,
          customerPhone: dto.phoneNumber,
          reference: subRef,
          identityType: dto.identityType,
          identityNumber: dto.identityNumber,
          identityId: dto.identityId,
          otp: dto.otp,
          autoSweep: dto.autoSweep,
          callbackUrl: this.shWebhookUrl || '',
        },
        fiatProvider,
      );

      const data = response?.data ?? response;

      // Defense-in-depth: catch business errors that slipped through
      if (data?.statusCode && data.statusCode >= 400) {
        throw new BadRequestException(
          data.message || 'Sub-account creation failed',
        );
      }

      const accountNumber = data?.accountNumber ?? data?.account_number;
      if (accountNumber) {
        const accountName = data?.accountName ?? data?.account_name ?? null;
        const bankCode = data?.bankCode ?? data?.bank_code ?? '';
        const bankName = data?.bankName ?? data?.bank_name ?? null;
        const existingSub = await this.prisma.merchantSubAccount.findFirst({
          where: { merchantId, accountNumber },
        });

        if (existingSub) {
          await this.prisma.merchantSubAccount.update({
            where: { id: existingSub.id },
            data: {
              bankCode,
              accountName,
              bankName,
              safehavenId: data._id ?? data.id ?? '',
              autoSweep: dto.autoSweep ?? existingSub.autoSweep,
              metadata: {
                ...data,
                externalReference: dto.externalReference,
                _subRef: subRef,
              },
            },
          });
        } else {
          await this.prisma.merchantSubAccount.create({
            data: {
              merchantId,
              bankCode,
              accountNumber,
              accountName,
              bankName,
              safehavenId: data._id ?? data.id ?? '',
              autoSweep: dto.autoSweep ?? true,
              metadata: {
                ...data,
                externalReference: dto.externalReference,
                _subRef: subRef,
              },
            },
          });
        }
      }

      this.auditService.log({
        merchantId,
        action: 'create_sub_account',
        provider: fiatProvider,
        endpoint: '/merchants/api/sub-account',
        method: 'POST',
        request: {
          phoneNumber: maskString(dto.phoneNumber),
          emailAddress: maskString(dto.emailAddress),
          externalReference: dto.externalReference,
        },
        response: redactSensitiveFields(data),
        statusCode: 201,
        duration: Date.now() - start,
        success: true,
      });

      // Return only essential fields, not full SafeHaven payload
      const subAccount = data?.data || data;
      return {
        accountNumber: subAccount?.accountNumber ?? subAccount?.account_number,
        accountName: subAccount?.accountName ?? subAccount?.account_name,
        bankCode: subAccount?.bankCode ?? subAccount?.bank_code,
        bankName: subAccount?.bankName ?? subAccount?.bank_name,
      };
    } catch (error: any) {
      this.auditService.log({
        merchantId,
        action: 'create_sub_account',
        provider: fiatProvider,
        endpoint: '/merchants/api/sub-account',
        method: 'POST',
        request: {
          phoneNumber: maskString(dto.phoneNumber),
          emailAddress: maskString(dto.emailAddress),
          externalReference: dto.externalReference,
        },
        statusCode: error.status ?? 500,
        duration: Date.now() - start,
        success: false,
        errorMessage: error.message,
      });
      throw error;
    }
  }

  async updateSubAccount(
    merchantId: string,
    subAccountId: string,
    dto: MerchantUpdateSubAccountDto,
  ) {
    const { fiatProvider } = await this.resolveMerchantAccount(merchantId);

    const subAccount = await this.prisma.merchantSubAccount.findFirst({
      where: { id: subAccountId, merchantId },
    });

    if (!subAccount) {
      throw new BadRequestException('Sub-account not found');
    }

    const meta = (subAccount.metadata as any) || {};

    const start = Date.now();
    try {
      const response = await this.fiatProviderService.updateSubAccount(
        {
          subAccountId: subAccount.safehavenId || meta._id || meta.id || '',
          phoneNumber: dto.phoneNumber || meta.phoneNumber || '',
          emailAddress: dto.emailAddress || meta.emailAddress || '',
          externalReference: meta.externalReference || '',
          identityType: dto.identityType || meta.identityType || 'BVN',
          identityNumber: dto.identityNumber || meta.identityNumber,
          identityId: dto.identityId || meta.identityId,
          otp: dto.otp,
          autoSweep: dto.autoSweep,
          autoSweepDetails: dto.autoSweepDetails,
          callbackUrl: this.shWebhookUrl || dto.callbackUrl || '',
        },
        fiatProvider,
      );

      const responseData = response?.data ?? response;

      await this.prisma.merchantSubAccount.update({
        where: { id: subAccount.id },
        data: {
          autoSweep: dto.autoSweep ?? subAccount.autoSweep,
          metadata: {
            ...meta,
            ...responseData,
          },
        },
      });

      this.auditService.log({
        merchantId,
        action: 'update_sub_account',
        provider: fiatProvider,
        endpoint: `/merchants/api/sub-account/${subAccountId}`,
        method: 'PATCH',
        request: dto,
        response: responseData,
        statusCode: 200,
        duration: Date.now() - start,
        success: true,
      });

      // Return only essential fields, not full SafeHaven payload
      const updated = responseData?.data || responseData;
      return {
        accountNumber: updated?.accountNumber ?? updated?.account_number,
        accountName: updated?.accountName ?? updated?.account_name,
        bankCode: updated?.bankCode ?? updated?.bank_code,
        bankName: updated?.bankName ?? updated?.bank_name,
        autoSweep: dto.autoSweep ?? subAccount.autoSweep,
      };
    } catch (error: any) {
      this.auditService.log({
        merchantId,
        action: 'update_sub_account',
        provider: fiatProvider,
        endpoint: `/merchants/api/sub-account/${subAccountId}`,
        method: 'PATCH',
        request: dto,
        statusCode: error.status ?? 500,
        duration: Date.now() - start,
        success: false,
        errorMessage: error.message,
      });
      throw error;
    }
  }

  async getSubAccounts(merchantId: string) {
    await this.resolveMerchantAccount(merchantId);

    return this.prisma.merchantSubAccount.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        bankCode: true,
        accountNumber: true,
        accountName: true,
        bankName: true,
        autoSweep: true,
        createdAt: true,
      },
    });
  }

  async getSubAccount(merchantId: string, subAccountId: string) {
    const { fiatProvider } = await this.resolveMerchantAccount(merchantId);

    const subAccount = await this.prisma.merchantSubAccount.findFirst({
      where: { id: subAccountId, merchantId },
    });

    if (!subAccount) {
      throw new BadRequestException('Sub-account not found');
    }

    const meta = (subAccount.metadata as any) || {};
    const providerAccountId =
      subAccount.safehavenId || meta.safehavenId || meta._id || meta.id || '';

    const redisBalance = await this.balanceCacheService.get(
      'sub',
      subAccountId,
    );
    if (redisBalance) {
      this.logger.log(
        `Sub-account balance Redis cache hit for ${subAccountId}`,
      );
      return {
        id: subAccount.id,
        safehavenId: providerAccountId,
        bankCode: subAccount.bankCode,
        accountNumber: subAccount.accountNumber,
        accountName: subAccount.accountName,
        accountBalance: redisBalance.accountBalance ?? 0,
        bookBalance: redisBalance.bookBalance ?? 0,
        status: redisBalance.status ?? '',
      };
    }

    const cachedBalance = meta.balance as BalanceData | undefined;
    const cachedAt = meta.balanceFetchedAt as string | undefined;
    const now = Date.now();
    const cacheValid =
      cachedAt &&
      now - new Date(cachedAt).getTime() <
        MerchantBankService.BALANCE_CACHE_TTL_MS;

    if (cacheValid && cachedBalance) {
      this.logger.log(`Sub-account balance DB cache hit for ${subAccountId}`);
      const balanceData: BalanceData = {
        accountBalance: cachedBalance.accountBalance ?? 0,
        bookBalance: cachedBalance.bookBalance ?? 0,
        accountName: cachedBalance.accountName ?? '',
        status: cachedBalance.status ?? '',
      };
      await this.balanceCacheService.set('sub', subAccountId, balanceData);
      return {
        id: subAccount.id,
        safehavenId: providerAccountId,
        bankCode: subAccount.bankCode,
        accountNumber: subAccount.accountNumber,
        accountName: subAccount.accountName,
        accountBalance: cachedBalance.accountBalance ?? 0,
        bookBalance: cachedBalance.bookBalance ?? 0,
        status: cachedBalance.status ?? '',
      };
    }

    this.logger.log(
      `Sub-account balance cache miss for ${subAccountId}, fetching from SafeHaven`,
    );
    const response = await this.fiatProviderService.getSubAccount(
      { subAccountId: providerAccountId },
      fiatProvider,
    );
    const data = response?.data ?? response;

    const balanceData: BalanceData = {
      accountBalance: data?.accountBalance ?? 0,
      bookBalance: data?.bookBalance ?? 0,
      accountName: data?.accountName ?? '',
      status: data?.status ?? '',
    };

    await Promise.all([
      this.balanceCacheService.set('sub', subAccountId, balanceData),
      this.prisma.merchantSubAccount.update({
        where: { id: subAccount.id },
        data: {
          metadata: {
            ...(meta || {}),
            balance: balanceData,
            balanceFetchedAt: new Date().toISOString(),
          },
        },
      }),
    ]);

    return {
      id: subAccount.id,
      safehavenId: providerAccountId,
      bankCode: subAccount.bankCode,
      accountNumber: subAccount.accountNumber,
      ...balanceData,
    };
  }

  async createVirtualAccount(
    merchantId: string,
    dto: MerchantCreateVirtualAccountDto,
  ) {
    const { bankAccountNumber, bankAccountBankCode, fiatProvider } =
      await this.resolveMerchantAccount(merchantId);

    const start = Date.now();
    try {
      this.logger.log(
        `Creating virtual account for merchant ${merchantId}: fiatProvider=${fiatProvider}, bankAccount.bankCode=${bankAccountBankCode}, bankAccount.accountNumber=${bankAccountNumber}`,
      );

      // Only SAFEHAVEN merchants support virtual accounts
      // PULSE_MFB does not support virtual accounts
      if (fiatProvider !== ProviderType.SAFEHAVEN) {
        throw new BadRequestException(
          'Virtual accounts are only supported for SafeHaven merchants. Pulse MFB does not support virtual accounts.',
        );
      }

      // For SAFEHAVEN merchants, use the MERCHANT'S SafeHaven account (from MerchantBankAccount) as settlement
      // This ensures funds settle to THEIR SafeHaven account, then auto-sweep to their external bank
      const settlementBankCode = bankAccountBankCode; // 090286 (merchant's SafeHaven account)
      const settlementAccountNumber = bankAccountNumber; // merchant's SafeHaven account number

      this.logger.log(
        `Settlement details: bankCode=${settlementBankCode}, accountNumber=${settlementAccountNumber}`,
      );

      // Generate our own internal reference for SafeHaven (merchant's ref stored separately)
      const vaReference = generateTrxReference(16, 'vac');
      const result = await this.fiatProviderService.createVirtualAccount({
        validFor: dto.validFor ?? 1800,
        callbackUrl: this.shWebhookUrl,
        amount: dto.amount,
        amountControl: dto.amountControl ?? 'OverPayment',
        bankCode: settlementBankCode,
        accountNumber: settlementAccountNumber,
        externalReference: vaReference,
      });

      // Check if SafeHaven returned an error
      const safehavenData = result?.data || result;
      const account = safehavenData?.data || safehavenData;

      if (
        safehavenData?.statusCode === 400 ||
        safehavenData?.message?.includes('Invalid settlement bank code')
      ) {
        throw new BadRequestException(
          `SafeHaven virtual account creation failed: ${safehavenData?.message || 'Unknown error'}`,
        );
      }

      // Save virtual account to dedicated table only on success
      const expiresAt = new Date(Date.now() + (dto.validFor ?? 1800) * 1000);

      await this.prisma.virtualAccount.create({
        data: {
          merchantId,
          reference: account?.reference || vaReference,
          externalReference: dto.externalReference,
          amount: dto.amount,
          amountControl: dto.amountControl ?? 'OverPayment',
          validFor: dto.validFor ?? 1800,
          accountNumber: account?.accountNumber,
          accountName: account?.accountName,
          bankCode: account?.bankCode || '090286',
          bankName: account?.bankName || 'Safe Haven MFB',
          safehavenResponse: safehavenData,
          expiresAt,
          status: 'ACTIVE',
        },
      });

      this.auditService.log({
        merchantId,
        action: 'create_virtual_account',
        provider: fiatProvider,
        endpoint: '/merchants/api/virtual-account',
        method: 'POST',
        request: { amount: dto.amount, amountControl: dto.amountControl },
        response: result,
        statusCode: 201,
        duration: Date.now() - start,
        success: true,
      });

      // Return only essential fields from SafeHaven response
      return {
        accountNumber: account?.accountNumber,
        bankCode: account?.bankCode || this.safeHavenBankCode,
        expiresAt: account?.expiryDate || expiresAt.toISOString(),
        settlementAccount: account?.settlementAccount || {
          bankCode: this.safeHavenBankCode,
          accountNumber: this.safeHavenDebitAccountNumber,
        },
      };
    } catch (error: any) {
      this.auditService.log({
        merchantId,
        action: 'create_virtual_account',
        provider: fiatProvider,
        endpoint: '/merchants/api/virtual-account',
        method: 'POST',
        request: { amount: dto.amount },
        statusCode: error.status ?? 500,
        duration: Date.now() - start,
        success: false,
        errorMessage: error.message,
      });
      throw error;
    }
  }

  async nameEnquiry(merchantId: string, dto: MerchantNameEnquiryDto) {
    const start = Date.now();
    try {
      const result = await this.fiatProviderService.nameEnquiry({
        bankCode: dto.bankCode,
        accountNumber: dto.accountNumber,
      });
      this.auditService.log({
        merchantId,
        action: 'name_enquiry',
        endpoint: '/merchants/api/name-enquiry',
        method: 'POST',
        request: dto,
        response: result,
        statusCode: 200,
        duration: Date.now() - start,
        success: true,
      });
      // Return only essential fields
      const data = result?.data || result;
      return {
        accountName: data?.accountName ?? data?.account_name,
        bankCode: dto.bankCode,
        accountNumber: dto.accountNumber,
      };
    } catch (error: any) {
      this.auditService.log({
        merchantId,
        action: 'name_enquiry',
        endpoint: '/merchants/api/name-enquiry',
        method: 'POST',
        request: dto,
        statusCode: error.status ?? 500,
        duration: Date.now() - start,
        success: false,
        errorMessage: error.message,
      });
      throw error;
    }
  }

  async transfer(merchantId: string, dto: MerchantTransferDto) {
    const { bankAccountNumber: ownAccountNumber, fiatProvider } =
      await this.resolveMerchantAccount(merchantId);

    const debitAccountNumber = dto.debitAccountNumber ?? ownAccountNumber;

    if (debitAccountNumber !== ownAccountNumber) {
      const subAccount = await this.prisma.merchantSubAccount.findFirst({
        where: { merchantId, accountNumber: debitAccountNumber },
      });
      if (!subAccount) {
        throw new BadRequestException(
          `Account ${debitAccountNumber} not found in your sub-accounts. You can only debit from your main account or your registered sub-accounts.`,
        );
      }
    }

    await this.checkSufficientBalance(
      merchantId,
      debitAccountNumber,
      dto.amount,
      fiatProvider,
    );

    const start = Date.now();
    const reference = generateTrxReference(16, 'bnk');
    const merchantPaymentRef = dto.paymentReference || null;
    try {
      const result = await this.fiatProviderService.transfer(
        {
          beneficiaryBankCode: dto.beneficiaryBankCode,
          beneficiaryAccountNumber: dto.beneficiaryAccountNumber,
          amount: dto.amount,
          narration: dto.narration,
          paymentReference: reference,
          saveBeneficiary: dto.saveBeneficiary,
          debitAccountNumber,
        },
        fiatProvider,
      );

      const res = result as Record<string, any>;
      const providerData = (res?.data ?? res) as Record<string, any>;
      // SafeHaven returns { data: { _id, sessionId, paymentReference, status } }.
      // sessionId is the correlatable provider reference for status lookups.
      const providerReference =
        (providerData?.sessionId as string) ??
        (providerData?.paymentReference as string) ??
        (providerData?._id as string) ??
        (providerData?.reference as string) ??
        (providerData?.transfer_reference as string) ??
        (providerData?.transaction_reference as string) ??
        (res?.sessionId as string) ??
        (res?.reference as string) ??
        null;
      const providerStatus =
        (providerData?.status as string) ?? (res?.status as string) ?? null;
      await this.prisma.merchantBankTransfer.create({
        data: {
          merchantId,
          reference,
          amount: dto.amount,
          beneficiaryBankCode: dto.beneficiaryBankCode,
          beneficiaryAccountNumber: dto.beneficiaryAccountNumber,
          narration: dto.narration,
          debitAccountNumber,
          status: 'PENDING',
          safehavenReference: providerReference,
          metadata: {
            ...(merchantPaymentRef
              ? { paymentReference: merchantPaymentRef }
              : {}),
            ...(providerStatus ? { providerStatus } : {}),
            ...(providerData?._id ? { providerId: providerData._id } : {}),
          },
        },
      });

      this.auditService.log({
        merchantId,
        action: 'transfer',
        provider: fiatProvider,
        endpoint: '/merchants/api/transfer',
        method: 'POST',
        request: dto,
        response: result,
        statusCode: 201,
        duration: Date.now() - start,
        success: true,
      });
      // Return only essential fields.
      // `reference` is our internal bnk_* ref (stable id for polling);
      // `providerReference` is SafeHaven's sessionId for provider-side tracing.
      return {
        reference,
        providerReference,
        status: providerStatus ?? 'PENDING',
        paymentReference: dto.paymentReference || reference,
        amount: dto.amount,
        beneficiaryBankCode: dto.beneficiaryBankCode,
        beneficiaryAccountNumber: dto.beneficiaryAccountNumber,
      };
    } catch (error: any) {
      await this.prisma.merchantBankTransfer
        .create({
          data: {
            merchantId,
            reference,
            amount: dto.amount,
            beneficiaryBankCode: dto.beneficiaryBankCode,
            beneficiaryAccountNumber: dto.beneficiaryAccountNumber,
            narration: dto.narration,
            debitAccountNumber,
            status: 'FAILED',
            metadata: {
              error: error.message,
              ...(merchantPaymentRef
                ? { paymentReference: merchantPaymentRef }
                : {}),
            },
          },
        })
        .catch(() => {});
      this.auditService.log({
        merchantId,
        action: 'transfer',
        provider: fiatProvider,
        endpoint: '/merchants/api/transfer',
        method: 'POST',
        request: dto,
        statusCode: error.status ?? 500,
        duration: Date.now() - start,
        success: false,
        errorMessage: error.message,
      });
      throw error;
    }
  }

  async getBanks() {
    const res = await this.fiatProviderService.getBanks();
    if (res?.data) {
      return res.data.map((row: { bankCode?: string; name?: string }) => ({
        institutionCode: row.bankCode,
        institutionName: row.name,
      }));
    }
    return [];
  }

  async getTransfers(
    merchantId: string,
    params: {
      page?: number;
      limit?: number;
      status?: string;
      fromDate?: string;
      toDate?: string;
      subAccountId?: string;
    },
  ) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { merchantId };

    if (params.status) {
      where.status = params.status;
    }
    if (params.fromDate || params.toDate) {
      where.createdAt = {};
      if (params.fromDate) where.createdAt.gte = new Date(params.fromDate);
      if (params.toDate) where.createdAt.lte = new Date(params.toDate);
    }

    const [data, total] = await Promise.all([
      this.prisma.merchantBankTransfer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.merchantBankTransfer.count({ where }),
    ]);

    const transferIds = data.map((t) => t.id);

    const fees = transferIds.length
      ? await this.prisma.transactionFee.findMany({
          where: {
            transactionId: { in: transferIds },
            transactionType: 'bank_transfer',
          },
        })
      : [];

    const feesByTransferId = new Map<string, typeof fees>();
    for (const fee of fees) {
      const existing = feesByTransferId.get(fee.transactionId) || [];
      existing.push(fee);
      feesByTransferId.set(fee.transactionId, existing);
    }

    return {
      data: data.map((t) => {
        const transferFees = feesByTransferId.get(t.id) || [];
        const totalFees = transferFees.reduce(
          (sum, f) =>
            sum + (f.feeAmount?.toNumber?.() ?? Number(f.feeAmount) ?? 0),
          0,
        );
        return {
          id: t.id,
          reference: t.reference,
          amount: t.amount?.toNumber?.() ?? Number(t.amount) ?? 0,
          currency: t.currency,
          beneficiaryBankCode: t.beneficiaryBankCode,
          beneficiaryAccountNumber: t.beneficiaryAccountNumber,
          beneficiaryAccountName: t.beneficiaryAccountName,
          narration: t.narration,
          status: t.status,
          fees: transferFees.map((f) => ({
            id: f.id,
            feeAmount: f.feeAmount?.toNumber?.() ?? Number(f.feeAmount) ?? 0,
            feeType: f.feeType,
            feeCurrency: f.feeCurrency,
          })),
          totalFees,
          netAmount:
            (t.amount?.toNumber?.() ?? Number(t.amount) ?? 0) - totalFees,
          createdAt: t.createdAt,
          completedAt: t.completedAt,
        };
      }),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getTransferStatusByReference(
    merchantId: string,
    reference: string,
  ): Promise<any> {
    const transfer = await this.prisma.merchantBankTransfer.findFirst({
      where: {
        merchantId,
        OR: [{ reference }, { safehavenReference: reference }],
      },
      select: {
        id: true,
        reference: true,
        status: true,
        metadata: true,
        safehavenReference: true,
        debitAccountNumber: true,
        createdAt: true,
        updatedAt: true,
        amount: true,
        currency: true,
        beneficiaryAccountNumber: true,
        beneficiaryBankCode: true,
        narration: true,
      },
    });

    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    const toNumber = (v: unknown): number =>
      typeof v === 'object' && v !== null && 'toNumber' in (v as any)
        ? (v as any).toNumber()
        : Number(v);

    const buildDbResponse = (message?: string) => ({
      reference: transfer.reference,
      providerReference: transfer.safehavenReference ?? null,
      status: transfer.status,
      amount: toNumber(transfer.amount),
      currency: transfer.currency,
      beneficiaryAccountNumber: transfer.beneficiaryAccountNumber,
      beneficiaryBankCode: transfer.beneficiaryBankCode,
      narration: transfer.narration,
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
      ...(message ? { message } : {}),
    });

    const safehavenReference = transfer.safehavenReference;
    if (!safehavenReference) {
      // Transfer never reached the provider (e.g. provider rejected it at
      // initiation time and we persisted a FAILED row). Return the stored
      // status with the original failure reason instead of a 400, so
      // callers polling `bnk_*` references get a usable terminal state.
      const metadata = (transfer.metadata ?? {}) as Record<string, any>;
      const failureReason =
        metadata.error ?? 'Transfer has not been initiated with provider yet';
      return buildDbResponse(failureReason);
    }

    const { fiatProvider } = await this.resolveMerchantAccount(merchantId);

    // Preferred path: single-record lookup via POST /transfers/status.
    // safehavenReference stores the provider sessionId; paymentReference is
    // our internal bnk_* ref which we now also forward at initiation time,
    // so try sessionId first, then paymentReference.
    let matchingTransfer: any = null;
    try {
      const statusResult = await this.fiatProviderService.getTransferStatus(
        {
          sessionId: safehavenReference,
          paymentReference: transfer.reference,
        },
        fiatProvider,
      );
      matchingTransfer = statusResult?.data ?? statusResult ?? null;
    } catch (error: any) {
      this.logger.warn(
        `Provider transfer-status lookup failed for ${safehavenReference}: ${error?.message}`,
      );
    }

    // Fallback: date-windowed list scan (covers transfers initiated before
    // we started forwarding paymentReference).
    if (!matchingTransfer?.status) {
      try {
        const fromDate = transfer.createdAt.toISOString().split('T')[0];
        const toDate = new Date().toISOString().split('T')[0];
        const result = await this.fiatProviderService.getTransfers(
          {
            accountNumber: transfer.debitAccountNumber!,
            fromDate,
            toDate,
          },
          fiatProvider,
        );

        const raw = result?.data ?? result ?? [];
        const transfers = Array.isArray(raw)
          ? raw
          : ((raw?.transfers as any[]) ?? (raw?.items as any[]) ?? []);
        const list = Array.isArray(transfers) ? transfers : [transfers];
        matchingTransfer =
          list.find(
            (t: any) =>
              t.sessionId === safehavenReference ||
              t.reference === safehavenReference ||
              t.paymentReference === safehavenReference ||
              t.paymentReference === transfer.reference ||
              t._id === safehavenReference ||
              t.id === safehavenReference,
          ) ?? null;
      } catch (error: any) {
        this.logger.warn(
          `Provider transfer list scan failed for ${safehavenReference}: ${error?.message}`,
        );
      }
    }

    if (!matchingTransfer) {
      // Fall back to our stored status instead of throwing, so polling
      // never 400s just because the provider window/record is missing.
      return buildDbResponse(
        'Transfer not found in provider records yet, returning stored status',
      );
    }

    return {
      reference: transfer.reference,
      providerReference: safehavenReference,
      status: matchingTransfer.status ?? transfer.status,
      amount: matchingTransfer.amount ?? toNumber(transfer.amount),
      currency: matchingTransfer.currency ?? transfer.currency,
      beneficiaryAccountNumber:
        matchingTransfer.beneficiaryAccountNumber ??
        transfer.beneficiaryAccountNumber,
      beneficiaryBankCode:
        matchingTransfer.beneficiaryBankCode ?? transfer.beneficiaryBankCode,
      narration: matchingTransfer.narration ?? transfer.narration,
      createdAt: matchingTransfer.createdAt ?? transfer.createdAt,
      updatedAt: matchingTransfer.updatedAt ?? transfer.updatedAt,
    };
  }

  async initiateVerification(
    merchantId: string,
    dto: MerchantInitiateVerificationDto,
  ) {
    const { bankAccountNumber, bankAccountBankCode, fiatProvider } =
      await this.resolveMerchantAccount(merchantId);

    const start = Date.now();
    try {
      const result = await this.fiatProviderService.initiateVerification(
        {
          type: dto.type,
          number: dto.number,
          debitAccountNumber: bankAccountNumber,
          otp: dto.otp,
          verifierId: dto.verifierId,
          provider: dto.provider,
          async: dto.async,
        },
        fiatProvider,
      );
      this.auditService.log({
        merchantId,
        action: 'initiate_verification',
        provider: fiatProvider,
        endpoint: '/merchants/api/initiate-verification',
        method: 'POST',
        request: { type: dto.type, number: maskString(dto.number) },
        response: result,
        statusCode: 201,
        duration: Date.now() - start,
        success: true,
      });
      // Return only essential fields
      const data = result?.data ?? result;

      // Defense-in-depth: catch business errors that slipped through
      if (data?.statusCode && data.statusCode >= 400) {
        throw new BadRequestException(
          data.message || 'Identity verification failed',
        );
      }

      // SafeHaven debits the account during initiation; record the charge immediately.
      const succeeded =
        data?.status?.toUpperCase() === 'SUCCESS' ||
        data?.debitResponsCode === 200;
      if (succeeded) {
        const reference = generateTrxReference(16, 'bnk');
        const amount = Number(data?.amount ?? 0);
        const vat = Number(data?.vat ?? 0);
        const stampDuty = Number(data?.stampDuty ?? 0);

        const transfer = await this.prisma.merchantBankTransfer.create({
          data: {
            merchantId,
            reference,
            amount,
            beneficiaryBankCode: bankAccountBankCode,
            beneficiaryAccountNumber: bankAccountNumber,
            narration: 'KYC charge',
            debitAccountNumber: bankAccountNumber,
            status: 'COMPLETED',
          },
        });

        const feeEntries: any[] = [];
        if (amount > 0)
          feeEntries.push({
            transactionId: transfer.id,
            transactionType: 'identity_verification',
            feeAmount: amount,
            feeType: 'provider_fee',
            feeCurrency: 'NGN',
          });
        if (vat > 0)
          feeEntries.push({
            transactionId: transfer.id,
            transactionType: 'identity_verification',
            feeAmount: vat,
            feeType: 'vat',
            feeCurrency: 'NGN',
          });
        if (stampDuty > 0)
          feeEntries.push({
            transactionId: transfer.id,
            transactionType: 'identity_verification',
            feeAmount: stampDuty,
            feeType: 'stamp_duty',
            feeCurrency: 'NGN',
          });
        if (feeEntries.length) {
          await this.prisma.transactionFee.createMany({ data: feeEntries });
        }

        return {
          identityId: data?.identityId ?? data?._id,
          status: data?.status,
          reference: data?.reference,
          transferReference: reference,
        };
      }

      return {
        identityId: data?.identityId ?? data?._id,
        status: data?.status,
        reference: data?.reference,
      };
    } catch (error: any) {
      this.auditService.log({
        merchantId,
        action: 'initiate_verification',
        provider: fiatProvider,
        endpoint: '/merchants/api/initiate-verification',
        method: 'POST',
        request: { type: dto.type, number: maskString(dto.number) },
        statusCode: error.status ?? 500,
        duration: Date.now() - start,
        success: false,
        errorMessage: error.message,
      });
      throw error;
    }
  }

  async validateVerification(
    merchantId: string,
    dto: MerchantValidateVerificationDto,
  ) {
    const { fiatProvider } = await this.resolveMerchantAccount(merchantId);

    const start = Date.now();
    try {
      const result = await this.fiatProviderService.validateVerification(
        {
          identityId: dto.identityId,
          type: dto.type,
          otp: dto.otp,
        },
        fiatProvider,
      );
      this.auditService.log({
        merchantId,
        action: 'validate_verification',
        provider: fiatProvider,
        endpoint: '/merchants/api/validate-verification',
        method: 'POST',
        request: { identityId: dto.identityId, type: dto.type },
        response: result,
        statusCode: 200,
        duration: Date.now() - start,
        success: true,
      });
      const data = result?.data ?? result;

      // Defense-in-depth: catch business errors that slipped through
      if (data?.statusCode && data.statusCode >= 400) {
        throw new BadRequestException(
          data.message || 'Identity validation failed',
        );
      }

      const validated =
        data?.otpVerified ?? data?.status?.toUpperCase() === 'SUCCESS';

      return {
        validated,
        identityId: dto.identityId,
      };
    } catch (error: any) {
      this.auditService.log({
        merchantId,
        action: 'validate_verification',
        provider: fiatProvider,
        endpoint: '/merchants/api/validate-verification',
        method: 'POST',
        request: { identityId: dto.identityId, type: dto.type },
        statusCode: error.status ?? 500,
        duration: Date.now() - start,
        success: false,
        errorMessage: error.message,
      });
      throw error;
    }
  }

  async getStats(merchantId: string) {
    await this.resolveMerchantAccount(merchantId);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dateFilter = { createdAt: { gte: thirtyDaysAgo } };
    const activeStatuses = ['COMPLETED', 'PROCESSING'];

    const [onramp, offramp, swap, bankTransfers] = await Promise.all([
      this.prisma.merchantOnrampTransaction.findMany({
        where: { merchantId, ...dateFilter },
        select: { id: true, amount: true, status: true, createdAt: true },
      }),
      this.prisma.merchantOfframpTransaction.findMany({
        where: { merchantId, ...dateFilter },
        select: { id: true, fiatAmount: true, status: true, createdAt: true },
      }),
      this.prisma.merchantSwapTransaction.findMany({
        where: { merchantId, ...dateFilter },
        select: { id: true, fromAmount: true, status: true, createdAt: true },
      }),
      this.prisma.merchantBankTransfer.findMany({
        where: { merchantId, ...dateFilter },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          amount: true,
          status: true,
          createdAt: true,
          beneficiaryAccountNumber: true,
          beneficiaryBankCode: true,
          narration: true,
        },
      }),
    ]);

    const allTx = [...onramp, ...offramp, ...swap, ...bankTransfers];
    const totalRequests = allTx.length;
    const successCount = allTx.filter((t) => t.status === 'COMPLETED').length;
    const errorCount = allTx.filter(
      (t) => t.status === 'FAILED' || t.status === 'CANCELLED',
    ).length;

    let totalMoneyMoved = 0;
    let transferCount = 0;
    const recentTransfers: Array<{
      amount: number;
      beneficiaryAccountNumber: string;
      beneficiaryBankCode: string;
      narration: string;
      createdAt: Date;
    }> = [];

    for (const tx of bankTransfers) {
      const amount = tx.amount?.toNumber?.() ?? Number(tx.amount) ?? 0;
      if (amount > 0) {
        totalMoneyMoved += amount;
        transferCount++;
        if (recentTransfers.length < 10) {
          recentTransfers.push({
            amount,
            beneficiaryAccountNumber: tx.beneficiaryAccountNumber ?? '',
            beneficiaryBankCode: tx.beneficiaryBankCode ?? '',
            narration: tx.narration ?? '',
            createdAt: tx.createdAt,
          });
        }
      }
    }

    return {
      period: '30d',
      totalRequests,
      successCount,
      errorCount,
      transferCount,
      totalMoneyMoved,
      recentTransfers,
    };
  }

  async getAnalytics(
    merchantId: string,
    period: 'daily' | 'weekly' | 'monthly',
  ) {
    await this.resolveMerchantAccount(merchantId);

    const now = new Date();
    let startDate: Date;
    let groupByFormat: string;

    switch (period) {
      case 'daily':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        groupByFormat = 'day';
        break;
      case 'weekly':
        startDate = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
        groupByFormat = 'week';
        break;
      case 'monthly':
        startDate = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000);
        groupByFormat = 'month';
        break;
    }

    const [requests, transfers] = await Promise.all([
      this.prisma.merchantApiRequestLog.findMany({
        where: { merchantId, createdAt: { gte: startDate } },
        select: {
          statusCode: true,
          createdAt: true,
        },
      }),
      this.prisma.merchantApiRequestLog.findMany({
        where: {
          merchantId,
          path: { equals: '/merchants/bank/transfer' },
          statusCode: { gte: 200, lt: 300 },
          createdAt: { gte: startDate },
        },
        select: {
          requestBody: true,
          createdAt: true,
        },
      }),
    ]);

    const bucketMap = new Map<
      string,
      {
        date: string;
        requestCount: number;
        successCount: number;
        errorCount: number;
        transferCount: number;
        moneyMoved: number;
      }
    >();

    const getBucketKey = (date: Date): string => {
      const d = new Date(date);
      if (groupByFormat === 'day') {
        return d.toISOString().split('T')[0];
      }
      if (groupByFormat === 'week') {
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        return weekStart.toISOString().split('T')[0];
      }
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    const ensureBucket = (key: string) => {
      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          date: key,
          requestCount: 0,
          successCount: 0,
          errorCount: 0,
          transferCount: 0,
          moneyMoved: 0,
        });
      }
    };

    for (const req of requests) {
      const key = getBucketKey(req.createdAt);
      ensureBucket(key);
      const bucket = bucketMap.get(key)!;
      bucket.requestCount++;
      if (req.statusCode >= 200 && req.statusCode < 300) {
        bucket.successCount++;
      } else if (req.statusCode >= 400) {
        bucket.errorCount++;
      }
    }

    for (const tx of transfers) {
      const key = getBucketKey(tx.createdAt);
      ensureBucket(key);
      const bucket = bucketMap.get(key)!;
      const body = tx.requestBody as Record<string, unknown> | null;
      const amount = Number(body?.amount ?? 0);
      bucket.transferCount++;
      bucket.moneyMoved += amount;
    }

    return Array.from(bucketMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }

  async getTransactions(
    merchantId: string,
    params: {
      page?: number;
      limit?: number;
      type?: 'onramp' | 'offramp' | 'swap' | 'transfer';
      status?: string;
      subAccountId?: string;
      fromDate?: string;
      toDate?: string;
    },
  ) {
    await this.resolveMerchantAccount(merchantId);

    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = { merchantId };
    const dateFilter: any = {};
    if (params.fromDate || params.toDate) {
      dateFilter.createdAt = {};
      if (params.fromDate) {
        dateFilter.createdAt.gte = new Date(params.fromDate);
      }
      if (params.toDate) {
        dateFilter.createdAt.lte = new Date(params.toDate);
      }
    }

    let subAccountNumber: string | undefined;
    if (params.subAccountId) {
      const subAccount = await this.prisma.merchantSubAccount.findFirst({
        where: { id: params.subAccountId, merchantId },
      });
      if (!subAccount) {
        throw new BadRequestException('Sub-account not found');
      }
      subAccountNumber = subAccount.accountNumber;
    }

    const status = params.status ? { status: params.status as any } : {};
    const shouldFetch = {
      onramp: !params.type || params.type === 'onramp',
      offramp: !params.type || params.type === 'offramp',
      swap: !params.type || params.type === 'swap',
      transfer: !params.type || params.type === 'transfer',
    };

    const [onramp, offramp, swap, transfers] = await Promise.all([
      shouldFetch.onramp
        ? this.prisma.merchantOnrampTransaction.findMany({
            where: {
              ...where,
              ...status,
              ...dateFilter,
              ...(subAccountNumber
                ? {
                    depositAccount: {
                      path: ['account_number'],
                      equals: subAccountNumber,
                    },
                  }
                : {}),
            },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              reference: true,
              amount: true,
              tokenAmount: true,
              tokenType: true,
              status: true,
              destinationAddress: true,
              network: true,
              createdAt: true,
              completedAt: true,
            },
          })
        : [],
      shouldFetch.offramp
        ? this.prisma.merchantOfframpTransaction.findMany({
            where: {
              ...where,
              ...status,
              ...dateFilter,
              ...(subAccountNumber ? { accountNumber: subAccountNumber } : {}),
            },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              reference: true,
              amount: true,
              fiatAmount: true,
              tokenType: true,
              status: true,
              bankCode: true,
              accountNumber: true,
              accountName: true,
              bankName: true,
              createdAt: true,
              completedAt: true,
            },
          })
        : [],
      shouldFetch.swap
        ? this.prisma.merchantSwapTransaction.findMany({
            where: {
              ...where,
              ...status,
              ...dateFilter,
            },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              reference: true,
              fromTokenType: true,
              fromAmount: true,
              toTokenType: true,
              toAmount: true,
              exchangeRate: true,
              status: true,
              transactionHash: true,
              createdAt: true,
              completedAt: true,
            },
          })
        : [],
      shouldFetch.transfer
        ? this.prisma.merchantBankTransfer.findMany({
            where: {
              ...where,
              ...status,
              ...dateFilter,
              ...(subAccountNumber
                ? {
                    OR: [
                      { beneficiaryAccountNumber: subAccountNumber },
                      { debitAccountNumber: subAccountNumber },
                    ],
                  }
                : {}),
            },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              reference: true,
              amount: true,
              currency: true,
              beneficiaryBankCode: true,
              beneficiaryAccountNumber: true,
              beneficiaryAccountName: true,
              narration: true,
              debitAccountNumber: true,
              status: true,
              createdAt: true,
              completedAt: true,
            },
          })
        : [],
    ]);

    const all = [
      ...onramp.map((t) => ({ ...t, type: 'onramp' as const })),
      ...offramp.map((t) => ({ ...t, type: 'offramp' as const })),
      ...swap.map((t) => ({ ...t, type: 'swap' as const })),
      ...transfers.map((t) => ({ ...t, type: 'transfer' as const })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(skip, skip + limit);

    const total =
      onramp.length + offramp.length + swap.length + transfers.length;

    return {
      data: all,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getWebhookLogs(
    merchantId: string,
    params: {
      page?: number;
      limit?: number;
      event?: string;
      success?: boolean;
    },
  ) {
    await this.resolveMerchantAccount(merchantId);

    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = { merchantId };
    if (params.event) where.event = params.event;
    if (params.success !== undefined) where.success = params.success;

    const [logs, total] = await Promise.all([
      this.prisma.merchantWebhookLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          event: true,
          url: true,
          statusCode: true,
          success: true,
          errorMessage: true,
          retryCount: true,
          maxRetries: true,
          nextRetryAt: true,
          createdAt: true,
        },
      }),
      this.prisma.merchantWebhookLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getWebhookLogDetail(merchantId: string, logId: string) {
    await this.resolveMerchantAccount(merchantId);

    const log = await this.prisma.merchantWebhookLog.findFirst({
      where: { id: logId, merchantId },
    });

    if (!log) {
      throw new NotFoundException('Webhook log not found');
    }

    return log;
  }

  async retryWebhookLog(merchantId: string, logId: string) {
    const log = await this.prisma.merchantWebhookLog.findFirst({
      where: { id: logId, merchantId },
    });

    if (!log) {
      throw new NotFoundException('Webhook log not found');
    }

    await this.notificationsService.retryWebhookLog(logId);
  }

  async getAuditLogs(
    merchantId: string,
    action?: string,
    page = 1,
    limit = 50,
  ) {
    const where: Record<string, unknown> = { merchantId };
    if (action) where.action = action;

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.merchantAuditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.merchantAuditLog.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }
}
