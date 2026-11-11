import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderType } from './provider-type.enum';
import {
  TransferData,
  CreateAccountData,
  BalanceData,
  NameEnquiryData,
  SubAccountData,
  CreateSubAccountData,
  GetTransfersData,
  InitiateVerificationData,
  ValidateVerificationData,
  UpdateSubAccountData,
} from './provider.interface';
import { MFBService } from '../safehaven/safehaven.service';
import { PulseMfbService } from '../pulsemfb/pulsemfb.service';

@Injectable()
export class FiatProviderService {
  private readonly logger = new Logger(FiatProviderService.name);
  private readonly defaultProvider: ProviderType;

  constructor(
    private readonly configService: ConfigService,
    private readonly safeHavenService: MFBService,
    private readonly pulseMfbService: PulseMfbService,
  ) {
    const configured = this.configService.get<string>('FIAT_TRANSFER_PROVIDER');
    this.defaultProvider =
      (configured as ProviderType) || ProviderType.PULSE_MFB;
  }

  /**
   * Initiates a funds transfer via the configured provider.
   * For merchants, pass their preferred provider to override the default.
   */
  async transfer(data: TransferData, provider?: ProviderType) {
    const selected = provider || this.defaultProvider;
    this.logger.log(`Transfer via ${selected}: ${data.paymentReference}`);

    if (selected === ProviderType.PULSE_MFB) {
      return this.pulseMfbService.initiateTransfer({
        debitAccountNumber: data.debitAccountNumber || '',
        beneficiaryAccountNumber: data.beneficiaryAccountNumber,
        beneficiaryBankCode: data.beneficiaryBankCode,
        amount: data.amount,
        narration: data.narration,
        reference: data.paymentReference,
      });
    }

    return this.safeHavenService.transfer(data);
  }

  /**
   * Creates an account via the configured provider.
   */
  async createAccount(data: CreateAccountData, provider?: ProviderType) {
    const selected = provider || this.defaultProvider;
    this.logger.log(
      `[FiatProviderService] createAccount called — selected=${selected}, provider override=${provider ?? 'none'}, defaultProvider=${this.defaultProvider}`,
    );

    if (selected === ProviderType.PULSE_MFB) {
      const payload = {
        customerName: data.customerName || '',
        customerPhone: data.customerPhone || '',
        customerEmail: data.customerEmail || '',
        reference: data.reference || '',
        bvn: data.identityType === 'BVN' ? data.identityNumber : undefined,
      };
      return this.pulseMfbService.createAccount(payload);
    }

    // SafeHaven: always use createSubAccount with identity
    if (data.identityType) {
      const payload = {
        phoneNumber: data.phoneNumber || data.customerPhone || '',
        emailAddress: data.emailAddress || data.customerEmail || '',
        externalReference: data.externalReference || data.reference || '',
        identityType: data.identityType,
        identityNumber: data.identityNumber,
        identityId: data.identityId,
        otp: data.otp,
        autoSweep: data.autoSweep,
        callbackUrl: data.callbackUrl,
      };
      return this.safeHavenService.createSubAccount(payload);
    }

    throw new BadRequestException(
      'SafeHaven sub-account creation requires identityType',
    );
  }

  /**
   * Gets account balance via the configured provider.
   */
  async getBalance(data: BalanceData, provider?: ProviderType) {
    const selected = provider || this.defaultProvider;
    this.logger.log(`Get balance via ${selected}: ${data.accountNumber}`);

    if (selected === ProviderType.PULSE_MFB) {
      return this.pulseMfbService.getBalance(data.accountNumber);
    }

    // MFB doesn't have a direct getBalance in the current service;
    // return null or extend MFBService later.
    throw new HttpException(
      'Balance check not implemented for MFB',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Performs name enquiry.
   */
  async nameEnquiry(data: NameEnquiryData, provider?: ProviderType) {
    const selected = provider || this.defaultProvider;

    if (selected === ProviderType.PULSE_MFB) {
      return this.pulseMfbService.nameEnquiry(
        data.bankCode,
        data.accountNumber,
      );
    }

    return this.safeHavenService.nameEnquiry(data.bankCode, data.accountNumber);
  }

  /**
   * Creates a virtual account. Always uses MFB because Pulse MFB
   * does not support virtual accounts.
   */
  async createVirtualAccount(data: {
    validFor: number;
    callbackUrl: string;
    amount: number;
    amountControl: 'Fixed' | 'UnderPayment' | 'OverPayment';
    bankCode?: string;
    accountNumber?: string;
    externalReference?: string;
  }) {
    this.logger.log(
      'Creating virtual account via MFB (Pulse does not support VA)',
    );
    return this.safeHavenService.createVirtualAccount(data);
  }

  /**
   * Gets sub-account details.
   */
  async getSubAccount(data: SubAccountData, provider?: ProviderType) {
    const selected = provider || this.defaultProvider;

    if (selected === ProviderType.PULSE_MFB) {
      throw new BadRequestException(
        'Sub-account lookup not supported by Pulse MFB provider',
      );
    }

    return this.safeHavenService.getSubAccount(data.subAccountId);
  }

  /**
   * Updates a sub-account (SafeHaven only).
   * Pulse MFB does not support sub-account updates.
   */
  async updateSubAccount(data: UpdateSubAccountData, provider?: ProviderType) {
    const selected = provider || this.defaultProvider;

    if (selected === ProviderType.PULSE_MFB) {
      throw new BadRequestException(
        'Sub-account update is not supported by Pulse MFB provider',
      );
    }

    return this.safeHavenService.updateSubAccount(data.subAccountId, {
      phoneNumber: data.phoneNumber,
      emailAddress: data.emailAddress,
      externalReference: data.externalReference,
      identityType: data.identityType,
      identityNumber: data.identityNumber,
      identityId: data.identityId,
      otp: data.otp,
      metadata: data.metadata,
      autoSweep: data.autoSweep,
      autoSweepDetails: data.autoSweepDetails,
      callbackUrl: data.callbackUrl,
    });
  }

  /**
   * Gets list of supported banks.
   */
  async getBanks(provider?: ProviderType) {
    const selected = provider || this.defaultProvider;

    if (selected === ProviderType.PULSE_MFB) {
      throw new BadRequestException(
        'Bank list not supported by Pulse MFB provider',
      );
    }

    return this.safeHavenService.getBankList();
  }

  /**
   * Gets transfer history.
   */
  async getTransfers(data: GetTransfersData, provider?: ProviderType) {
    const selected = provider || this.defaultProvider;

    if (selected === ProviderType.PULSE_MFB) {
      return this.pulseMfbService.getTransfers({
        accountNumber: data.accountNumber,
        page: data.page,
        limit: data.limit,
        status: data.status,
        fromDate: data.fromDate,
        toDate: data.toDate,
      });
    }

    return this.safeHavenService.getTransfers({
      accountId: data.accountId,
      accountNumber: data.accountNumber,
      page: data.page,
      limit: data.limit,
      status: data.status,
      fromDate: data.fromDate,
      toDate: data.toDate,
    });
  }

  /**
   * Single-transfer status lookup. SafeHaven supports POST /transfers/status
   * by sessionId or paymentReference; other providers fall back to the
   * list-scan path handled by callers.
   */
  async getTransferStatus(
    data: { sessionId?: string; paymentReference?: string },
    provider?: ProviderType,
  ) {
    const selected = provider || this.defaultProvider;

    if (selected === ProviderType.PULSE_MFB) {
      const reference = data.sessionId || data.paymentReference;
      if (!reference) {
        throw new BadRequestException(
          'A transfer reference is required for Pulse MFB status lookup',
        );
      }
      return this.pulseMfbService.getTransfer(reference);
    }

    return this.safeHavenService.getTransferStatus(data);
  }

  /**
   * Initiates identity verification.
   * Pulse MFB does not support this operation.
   */
  async initiateVerification(
    data: InitiateVerificationData,
    provider?: ProviderType,
  ) {
    const selected = provider || this.defaultProvider;

    if (selected === ProviderType.PULSE_MFB) {
      throw new BadRequestException(
        'Identity verification not supported by Pulse MFB provider',
      );
    }

    return this.safeHavenService.initiateVerification(data);
  }

  /**
   * Validates identity verification OTP.
   * Pulse MFB does not support this operation.
   */
  async validateVerification(
    data: ValidateVerificationData,
    provider?: ProviderType,
  ) {
    const selected = provider || this.defaultProvider;

    if (selected === ProviderType.PULSE_MFB) {
      throw new BadRequestException(
        'Identity verification not supported by Pulse MFB provider',
      );
    }

    return this.safeHavenService.validateVerification(data);
  }

  /**
   * Fetches the fresh available balance for an account via the configured provider.
   * Always fetches from the provider — never cached.
   * Returns the numeric balance or null if it cannot be determined.
   */
  async getAvailableBalance(
    accountNumber: string,
    provider?: ProviderType,
  ): Promise<number | null> {
    const selected = provider || this.defaultProvider;
    try {
      if (selected === ProviderType.PULSE_MFB) {
        const res = (await this.pulseMfbService.getBalance(
          accountNumber,
        )) as Record<string, unknown>;
        const data = (res?.data ?? res) as Record<string, unknown>;
        return Number(
          (data?.available_balance as number) ??
            (data?.availableBalance as number) ??
            (data?.ledger_balance as number) ??
            (data?.balance as number) ??
            0,
        );
      }

      // SafeHaven: balance comes from getSubAccount
      const res = await this.safeHavenService.getSubAccount(accountNumber);
      const data = (res?.data ?? res) as Record<string, unknown>;
      return Number(
        (data?.availableBalance as number) ??
          (data?.accountBalance as number) ??
          0,
      );
    } catch (error: any) {
      this.logger.warn(
        `Failed to fetch balance for ${accountNumber} via ${selected}: ${error.message}`,
      );
      return null;
    }
  }

  getDefaultProvider(): ProviderType {
    return this.defaultProvider;
  }
}
