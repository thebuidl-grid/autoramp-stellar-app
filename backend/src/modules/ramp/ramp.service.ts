import { relayLegFields } from './cctp-relay-leg';
import { currentChainNetwork } from '../../common/request-context';
import {
  resolveCountry,
  virtualAccountReference,
} from '../bitnob/bitnob-countries';
import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  BadRequestException,
  NotFoundException,
  ConsoleLogger,
} from '@nestjs/common';
import { normalizeBridgeStatus } from '../bridge/bridge-status';
import {
  addressLabel,
  getRampChain,
  isValidAddressForChain,
} from './ramp-chains';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { PrismaService } from '../../database/prisma.service';
import {
  ConfirmStellarOfframpDto,
  offRampDto,
  onRampDto,
} from './dto/index.dto';
import {
  OtcOnRampQuoteDto,
  OtcOnRampExecuteDto,
  OtcOffRampQuoteDto,
  OtcOffRampExecuteDto,
} from '../otc/dto/index.dto';
import { generateTrxReference } from '../../utils/reference.util';
import { MFBService } from '../safehaven/safehaven.service';
import { FiatProviderService } from '../providers/fiat-provider.service';
import { UserLimitsService } from '../../config/user-limits.service';
import {
  BitNobService,
  extractBitnobQuoteId,
  extractPayoutDeposit,
} from '../bitnob/bitnob.service';
import { OfframpStateService } from './offramp-state.service';
import { PayoutOrderRepository } from './payout-order.repository';
import { SafehavenOfframpSettlementService } from './safehaven-offramp-settlement.service';
import { SafehavenOnrampSettlementService } from './safehaven-onramp-settlement.service';
import { StellarOfframpRelayService } from './stellar-offramp-relay.service';

@Injectable()
export class RampService {
  private readonly logger = new Logger(RampService.name);
  private readonly apiUrl?: string;
  private readonly apiKey?: string;
  private readonly commonHeaders = {
    Accept: 'application/json',
    'x-api-key': '',
  };
  private readonly OTC_RAMP_FEE_PERCENT = 0;
  private readonly OTC_RAMP_CURRENCY = 'NGN';
  private readonly OTC_RAMP_NETWORK = 'base';
  private readonly OTC_RAMP_ASSET = 'usdc';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly safeHavenService: MFBService,
    private readonly fiatProviderService: FiatProviderService,
    private readonly userLimitsService: UserLimitsService,
    private readonly bitnobService: BitNobService,
    private readonly offrampState: OfframpStateService,
    private readonly payoutOrders: PayoutOrderRepository,
    private readonly safehavenSettlement: SafehavenOfframpSettlementService,
    private readonly safehavenOnramp: SafehavenOnrampSettlementService,
    private readonly stellarRelay: StellarOfframpRelayService,
  ) {
    this.apiUrl = (
      this.configService.get<string>('RAMP_API_URL') ||
      this.configService.get<string>('STABLESTACK_API_URL')
    )?.trim();
    this.apiKey = (
      this.configService.get<string>('RAMP_API_KEY') ||
      this.configService.get<string>('STABLESTACK_API_KEY')
    )?.trim();

    if (!this.apiUrl || !this.apiKey) {
      throw new HttpException(
        'RAMP_API_URL or RAMP_API_KEY missing in config',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    this.commonHeaders['x-api-key'] = this.apiKey;
  }

  async getBanks(): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/v1/ramp/banks`, {
          headers: this.commonHeaders,
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('Failed to fetch banks', error);
    }
  }

  /**
   * Resolve account name
   *
   * Resolves the account name from bank code and account number using the Flint API.
   *
   * @param bankCode - Bank code
   * @param accountNumber - Account number
   * @returns Account name resolution data
   */
  async resolveAccount(
    bankCode: string,
    accountNumber: string,
    network?: string,
    country?: string,
  ): Promise<any> {
    // Stellar, and any non-NG country on any network, resolves via Bitnob.
    if (
      network === 'stellar' ||
      (country && resolveCountry(country).code !== 'NG')
    ) {
      const lookupCountry = resolveCountry(country).code;
      const destinationType = await this.bitnobService.destinationTypeFor(
        lookupCountry,
        bankCode,
      );
      // Mobile money (e.g. M-Pesa) has no account-name lookup: best effort, then fall back to the number.
      const lookup = await this.bitnobService
        .accountLookup(bankCode, accountNumber, lookupCountry, destinationType)
        .catch((err) => {
          if (destinationType === 'mobile_money') return null;
          throw err;
        });
      const accountName =
        lookup?.data?.account_name ||
        lookup?.data?.accountName ||
        (destinationType === 'mobile_money' ? accountNumber : undefined);
      if (!accountName) {
        throw new HttpException(
          'Bitnob account lookup did not return an account name',
          HttpStatus.BAD_GATEWAY,
        );
      }
      return {
        status: 'success',
        data: { accountName, bankCode, accountNumber },
      };
    }
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/v1/ramp/banks/nameQuery`, {
          headers: this.commonHeaders,
          params: {
            bankCode,
            accountNumber,
          },
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('Failed to resolve account', error);
    }
  }

  /**
   * Initialize onramp transaction
   *
   * Creates an onramp transaction with Flint API and saves it to the database.
   *
   * @param userId - User ID from authenticated request
   * @param dto - Onramp transaction data
   * @param ipAddress - Client IP address (optional)
   * @param userAgent - Client user agent (optional)
   * @returns Transaction data with database record
   */
  async onRamp(
    id: string,
    email: string,
    isMerchant: boolean,
    isOtcEnabled: boolean,
    dto: onRampDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<any> {
    if (!isOtcEnabled && !isMerchant && dto.network !== 'stellar') {
      try {
        this.userLimitsService.validateAmount(email, dto.amount);
      } catch (error) {
        throw new BadRequestException(error.message);
      }
    }
    // base, bsc and stellar onramps are all served by Bitnob virtual accounts.
    return this.bitnobOnRamp(id, email, isMerchant, dto, ipAddress, userAgent);
  }

  private async getOrCreateBitnobAccount(
    id: string,
    email: string,
    isMerchant: boolean,
    firstName?: string,
    lastName?: string,
    phoneNumber?: string,
    countryCode?: string,
  ): Promise<{
    bitnobCustomerId: string;
    bitnobVirtualAccount: any;
    depositAccount: any;
  }> {
    const country = resolveCountry(countryCode);
    const stableReference = virtualAccountReference(
      isMerchant ? `bitnob_merchant_${id}` : `bitnob_user_${id}`,
      country.code,
    );

    if (country.code !== 'NG') {
      return this.getOrCreateForeignBitnobAccount(
        id,
        email,
        isMerchant,
        country,
        stableReference,
        firstName,
        lastName,
        phoneNumber,
      );
    }

    if (!isMerchant) {
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: { bitnobCustomerId: true, bitnobVirtualAccount: true },
      });
      if (user?.bitnobCustomerId && user?.bitnobVirtualAccount) {
        return {
          bitnobCustomerId: user.bitnobCustomerId,
          bitnobVirtualAccount: user.bitnobVirtualAccount as any,
          depositAccount: this.mapBitnobVirtualAccount(
            user.bitnobVirtualAccount as any,
          ),
        };
      }
    } else {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id },
        select: { bitnobCustomerId: true, bitnobVirtualAccount: true },
      });
      if (merchant?.bitnobCustomerId && merchant?.bitnobVirtualAccount) {
        return {
          bitnobCustomerId: merchant.bitnobCustomerId,
          bitnobVirtualAccount: merchant.bitnobVirtualAccount as any,
          depositAccount: this.mapBitnobVirtualAccount(
            merchant.bitnobVirtualAccount as any,
          ),
        };
      }
    }

    const customer = await this.bitnobService.createCustomer({
      email,
      phoneNumber,
      firstName,
      lastName,
    });
    const bitnobCustomerId =
      customer?.data?.id || customer?.id || customer?.data?.customer?.id;

    if (!bitnobCustomerId) {
      throw new HttpException(
        'Bitnob customer creation did not return a customer id',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const va = await this.bitnobService.createVirtualAccount({
      reference: stableReference,
      customerId: bitnobCustomerId,
      currency: 'NGN',
    });

    const bitnobVirtualAccount = va?.data || va;
    const depositAccount = this.mapBitnobVirtualAccount(bitnobVirtualAccount);

    if (!isMerchant) {
      await this.prisma.user.update({
        where: { id },
        data: {
          bitnobCustomerId,
          bitnobVirtualAccount: bitnobVirtualAccount,
        },
      });
    } else {
      await this.prisma.merchant.update({
        where: { id },
        data: {
          bitnobCustomerId,
          bitnobVirtualAccount: bitnobVirtualAccount,
        },
      });
    }

    await this.prisma.virtualAccount.upsert({
      where: { reference: stableReference },
      update: {},
      create: {
        reference: stableReference,
        externalReference: String(depositAccount.id),
        accountNumber: depositAccount.accountNumber,
        accountName: depositAccount.accountName,
        bankName: depositAccount.bankName,
        bankCode: depositAccount.bankCode || '999999',
        transactionType: 'onramp',
        ...(isMerchant ? { merchantId: id } : { userId: id }),
      },
    });

    return { bitnobCustomerId, bitnobVirtualAccount, depositAccount };
  }

  /**
   * Non-NG corridors: the user/merchant row only caches the Nigerian virtual
   * account, so GH/KE accounts live in the VirtualAccount table, keyed by a
   * country-suffixed reference. The Bitnob customer is created once per country.
   */
  private async getOrCreateForeignBitnobAccount(
    id: string,
    email: string,
    isMerchant: boolean,
    country: ReturnType<typeof resolveCountry>,
    stableReference: string,
    firstName?: string,
    lastName?: string,
    phoneNumber?: string,
  ) {
    const existing = await this.prisma.virtualAccount.findUnique({
      where: { reference: stableReference },
    });
    if (existing) {
      const depositAccount = {
        provider: 'bitnob',
        id: existing.externalReference,
        accountNumber: existing.accountNumber,
        accountName: existing.accountName,
        bankName: existing.bankName,
        bankCode: existing.bankCode,
        currency: country.currency,
      };
      return {
        bitnobCustomerId: '',
        bitnobVirtualAccount: depositAccount,
        depositAccount,
      };
    }

    const customer = await this.bitnobService.createCustomer({
      email,
      phoneNumber,
      firstName,
      lastName,
      country: country.code,
    });
    const bitnobCustomerId =
      customer?.data?.id || customer?.id || customer?.data?.customer?.id;
    if (!bitnobCustomerId) {
      throw new HttpException(
        'Bitnob customer creation did not return a customer id',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const va = await this.bitnobService.createVirtualAccount({
      reference: stableReference,
      customerId: bitnobCustomerId,
      currency: country.currency,
    });
    const bitnobVirtualAccount = va?.data || va;
    const depositAccount = {
      ...this.mapBitnobVirtualAccount(bitnobVirtualAccount),
      currency: country.currency,
    };

    await this.prisma.virtualAccount.create({
      data: {
        reference: stableReference,
        externalReference: String(depositAccount.id),
        accountNumber: depositAccount.accountNumber,
        accountName: depositAccount.accountName,
        bankName: depositAccount.bankName,
        bankCode: depositAccount.bankCode || '999999',
        transactionType: 'onramp',
        ...(isMerchant ? { merchantId: id } : { userId: id }),
      },
    });

    return { bitnobCustomerId, bitnobVirtualAccount, depositAccount };
  }

  private splitName(fullName?: string): [string, string] {
    if (!fullName || !fullName.trim()) return ['', ''];
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return [parts[0], 'Customer'];
    const last = parts.pop()!;
    return [parts.join(' '), last];
  }

  private mapBitnobVirtualAccount(vaData: any) {
    return {
      provider: 'bitnob',
      id: vaData?.id,
      accountNumber: vaData?.account_number,
      accountName: vaData?.account_name,
      bankName: vaData?.bank_name,
      bankCode: vaData?.bank_code,
    };
  }

  /**
   * USDC on-ramp (base, bsc, stellar) via Bitnob. NGN user orders pay a per-order SafeHaven account and are
   * settled by Bitnob trading (no customers); other orders use a Bitnob customer + virtual account.
   */
  private async bitnobOnRamp(
    id: string,
    email: string,
    isMerchant: boolean,
    dto: onRampDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<any> {
    const reference = generateTrxReference(16, 'on');
    const country = resolveCountry(dto.country);

    let firstName: string | undefined;
    let lastName: string | undefined;
    let phoneNumber: string | undefined;

    if (isMerchant) {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id },
        include: { user: true },
      });
      // API-key auth does not carry an email; fall back to the merchant owner's.
      email = email || merchant?.user?.email || '';
      firstName = merchant?.name;
      lastName = 'Merchant';
      phoneNumber = merchant?.user?.phoneNumber || undefined;
    } else {
      const user = await this.prisma.user.findUnique({ where: { id } });
      const [fn, ln] = this.splitName(user?.contactName || email);
      firstName = fn;
      lastName = ln;
      phoneNumber = user?.phoneNumber || undefined;
    }

    // NGN user orders settle via SafeHaven + Bitnob trading on Autoramp's own balance:
    // no Bitnob customer or virtual account is created for the user.
    const useSafehaven = this.safehavenOnramp.isEnabledFor(
      country.code,
      isMerchant,
    );

    let depositAccount: any;
    let shDeposit: Awaited<
      ReturnType<SafehavenOnrampSettlementService['createDepositAccount']>
    > | null = null;
    if (useSafehaven) {
      shDeposit = await this.safehavenOnramp.createDepositAccount(
        reference,
        dto.amount,
      );
      depositAccount = shDeposit;
    } else {
      if (!email) {
        throw new BadRequestException(
          'An email address is required to create a Bitnob customer',
        );
      }
      const cached = await this.getOrCreateBitnobAccount(
        id,
        email,
        isMerchant,
        firstName,
        lastName,
        phoneNumber,
        country.code,
      );
      depositAccount = cached.depositAccount;
    }
    const shMetadata = shDeposit
      ? { safehaven: { accountNumber: shDeposit.accountNumber } }
      : null;

    let transaction: any;
    if (isMerchant) {
      transaction = await this.prisma.merchantOnrampTransaction.create({
        data: {
          chainNetwork: currentChainNetwork(),
          merchantId: id,
          reference,
          amount: dto.amount,
          currency: country.currency,
          tokenType: 'USDC',
          status: 'PENDING',
          destinationAddress: dto.destination.address,
          network: dto.network,
          depositAccount,
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });
    } else {
      transaction = await this.prisma.onrampTransaction.create({
        data: {
          chainNetwork: currentChainNetwork(),
          userId: id,
          reference,
          amount: dto.amount,
          currency: country.currency,
          tokenType: 'USDC',
          status: 'PENDING',
          destinationAddress: dto.destination.address,
          network: dto.network,
          depositAccount,
          ...(shDeposit ? { safehavenAccount: shDeposit as any, metadata: shMetadata as any } : {}),
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });
    }

    await this.prisma.transactionLog.create({
      data: {
        transactionType: 'onramp',
        transactionId: transaction.id,
        userId: isMerchant ? null : id,
        action: 'created',
        newStatus: 'PENDING',
        description: shDeposit
          ? `${dto.network} onramp initialized via SafeHaven virtual account (Bitnob trading settlement)`
          : `${dto.network} onramp initialized via Bitnob virtual account`,
      },
    });

    return {
      status: 'success',
      message: `${dto.network} onramp initialized. Deposit ${country.currency} to the virtual account.`,
      databaseRecord: {
        id: transaction.id,
        reference: transaction.reference,
        status: transaction.status,
        createdAt: transaction.createdAt,
      },
      deposit: depositAccount,
    };
  }

  /**
   * Initialize offramp transaction
   *
   * Creates an offramp transaction with Flint API and saves it to the database.
   *
   * @param userId - User ID from authenticated request
   * @param dto - Offramp transaction data
   * @param ipAddress - Client IP address (optional)
   * @param userAgent - Client user agent (optional)
   * @returns Transaction data with database record
   */
  async offRamp(
    id: string,
    email: string,
    isMerchant: boolean,
    isOtcEnabled: boolean,
    dto: offRampDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<any> {
    // All offramps (stellar, base, bsc) are served by Bitnob payouts.
    const offrampChain = this.resolveOffRampChain(dto.network);
    if (!offrampChain) {
      throw new BadRequestException(
        `Unsupported offramp network: ${dto.network}`,
      );
    }
    return this.bitnobOffRamp(
      id,
      isMerchant,
      dto,
      ipAddress,
      userAgent,
      offrampChain,
    );
  }

  private resolveOffRampChain(network: string): string | null {
    const chain = getRampChain(network);
    return chain?.offramp ? chain.bitnobChain : null;
  }

  /**
   * Stellar USDC offramp via Bitnob payouts.
   *
   * 1. Creates a quote for the NGN amount.
   * 2. Initializes the payout with the beneficiary bank details.
   * 3. Reads the onchain funding address from the initialize response (no finalize: the deposit finalizes an onchain payout).
   * 4. Persists the offramp row + provider order.
   */
  private async bitnobOffRamp(
    id: string,
    isMerchant: boolean,
    dto: offRampDto,
    ipAddress?: string,
    userAgent?: string,
    chain: string = 'STELLAR',
  ): Promise<any> {
    const sourceAddress = dto.sourceAddress?.trim();
    const rampChain = getRampChain(dto.network);
    if (!rampChain) {
      throw new BadRequestException(
        `Unsupported offramp network: ${dto.network}`,
      );
    }
    if (!sourceAddress) {
      throw new BadRequestException(
        `sourceAddress (${addressLabel(rampChain)}) is required when network is ${dto.network}`,
      );
    }
    if (!isValidAddressForChain(rampChain, sourceAddress)) {
      throw new BadRequestException(
        `sourceAddress is not a valid ${dto.network} address`,
      );
    }

    const reference = generateTrxReference(16, 'off');
    const country = resolveCountry(dto.country);

    // Stellar user off-ramps go over CCTP to a Bitnob payout opened on BASE (Bitnob's Stellar rail is unreliable):
    // the user's wallet burns Stellar USDC straight to Bitnob's Base deposit address and our relayer mints it.
    const useRelay =
      dto.network === 'stellar' && !isMerchant && this.stellarRelay.isEnabled();
    const payoutChain = useRelay ? (getRampChain('base')?.bitnobChain ?? 'BASE') : chain;
    // The client's network toggle decides the CCTP network for this order (server default: mainnet).
    const relayNetwork = this.stellarRelay.resolveNetwork(dto.chainNetwork);

    try {
      const destinationType = await this.bitnobService.destinationTypeFor(
        country.code,
        dto.destination.bankCode,
      );
      // Mobile money (e.g. M-Pesa) has no account-name lookup: best effort, then fall back to the number.
      const lookup = await this.bitnobService
        .accountLookup(
          dto.destination.bankCode,
          dto.destination.accountNumber,
          country.code,
          destinationType,
        )
        .catch((err) => {
          if (destinationType === 'mobile_money') return null;
          throw err;
        });
      const accountName =
        lookup?.data?.account_name ||
        lookup?.data?.accountName ||
        (destinationType === 'mobile_money'
          ? dto.destination.accountNumber
          : undefined);
      if (!accountName) {
        throw new HttpException(
          'Bitnob account lookup did not return an account name',
          HttpStatus.BAD_GATEWAY,
        );
      }

      const quote = await this.bitnobService.createPayoutQuote({
        fromAsset: 'USDC',
        toCurrency: country.currency,
        country: country.code,
        source: 'onchain',
        settlementAmount: dto.amount,
        reference,
        chain: payoutChain,
      });

      const quoteId = extractBitnobQuoteId(quote);
      if (!quoteId) {
        throw new HttpException(
          'Bitnob payout quote missing id',
          HttpStatus.BAD_GATEWAY,
        );
      }

      // NGN via SafeHaven: Bitnob pays a per-order SafeHaven virtual account and we forward to the user's
      // bank once it is credited (see SafehavenOfframpSettlementService). Otherwise Bitnob pays the user directly.
      const collection = this.safehavenSettlement.isEnabledFor(
        country.code,
        isMerchant,
      )
        ? await this.safehavenSettlement.createCollectionAccount(
            reference,
            dto.amount,
          )
        : null;

      const initialized = await this.bitnobService.initializePayout({
        quoteId,
        reference,
        beneficiary: {
          destinationType,
          country: country.code,
          accountName: collection?.accountName || accountName,
          accountNumber: collection?.accountNumber ?? dto.destination.accountNumber,
          bankCode: collection?.bankCode || dto.destination.bankCode,
        },
        callbackUrl: this.bitnobService.getWebhookUrl(),
      });

      // Onchain-funded payouts must NOT be finalized: initialize already moves the
      // payout to PENDING_ADDRESS_DEPOSIT and returns the deposit address; the
      // deposit finalizes it. (finalize is only for source: 'offchain'.)
      const deposit = extractPayoutDeposit(quote, initialized, undefined);

      if (!deposit?.paymentAddress) {
        throw new HttpException(
          'Bitnob payout finalized but no payment address returned',
          HttpStatus.BAD_GATEWAY,
        );
      }

      let burnPlan: Awaited<ReturnType<StellarOfframpRelayService['planBurn']>> | null = null;
      if (useRelay) {
        if (!deposit.amountToPay || !/^0x[a-fA-F0-9]{40}$/.test(deposit.paymentAddress)) {
          throw new HttpException(
            'Bitnob did not return a Base deposit address and amount for the relay',
            HttpStatus.BAD_GATEWAY,
          );
        }
        burnPlan = await this.stellarRelay.planBurn(deposit.amountToPay, relayNetwork);
      }

      const bankName =
        (await this.bitnobService.bitnobBankName(
          dto.destination.bankCode,
          country.code,
        )) || null;
      const notifyUrl =
        this.configService.get<string>('FLINT_WEBHOOK_URL') || null;

      let transaction: any;
      if (isMerchant) {
        transaction = await this.prisma.merchantOfframpTransaction.create({
          data: {
          chainNetwork: currentChainNetwork(),
            merchantId: id,
            reference,
            amount: dto.amount,
            currency: country.currency,
            tokenType: 'USDC',
            status: 'PENDING',
            bankCode: dto.destination.bankCode,
            accountNumber: dto.destination.accountNumber,
            accountName,
            bankName,
            network: dto.network,
            notifyUrl,
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
          },
        });
      } else {
        transaction = await this.prisma.offrampTransaction.create({
          data: {
          chainNetwork: currentChainNetwork(),
            userId: id,
            reference,
            amount: dto.amount,
            currency: country.currency,
            tokenType: 'USDC',
            status: 'INITIATED',
            flintTransactionId: null,
            bankCode: dto.destination.bankCode,
            accountNumber: dto.destination.accountNumber,
            accountName,
            bankName,
            network: dto.network,
            notifyUrl,
            ...(collection || burnPlan
              ? {
                  metadata: {
                    ...(collection ? { safehaven: { ...collection } } : {}),
                    ...(burnPlan
                      ? {
                          cctpRelay: {
                            status: 'awaiting_burn',
                            destinationChain: 'base',
                            mintRecipient: deposit.paymentAddress,
                            burnAmountUnits: burnPlan.burnAmountUnits,
                            maxFeeUnits: burnPlan.maxFeeUnits,
                            network: relayNetwork,
                          },
                        }
                      : {}),
                  } as any,
                }
              : {}),
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
          },
        });

        await this.prisma.transactionLog.create({
          data: {
            transactionType: 'offramp',
            transactionId: transaction.id,
            userId: id,
            action: 'created',
            newStatus: 'INITIATED',
            description: `${dto.network} offramp order created via Bitnob`,
          },
        });
      }

      await this.payoutOrders.create({
        reference,
        providerOrderId: quoteId,
        sourceAddress,
        transactionId: transaction.id,
        isMerchant,
        fundingAddress: deposit.paymentAddress ?? null,
        expectedAmount: this.parseDecimal(deposit.amountToPay),
        memo: deposit.memo ?? null,
        expiresAt: this.parseDate(deposit.expiresAt),
      });

      // An off-ramp funded over CCTP is a CCTP transfer: record it from the start (awaiting its burn).
      if (!isMerchant && burnPlan) {
        await this.recordRelayLeg(transaction.id, reference, (transaction as any).metadata);
      }

      if (!isMerchant) {
        // D1: every attempted cash-out gets a reconciliation record; funding instructions issued => AWAITING_DEPOSIT.
        await this.offrampState.recordInitiated(transaction.id);
        await this.offrampState.apply(transaction.id, 'AWAITING_DEPOSIT', {
          actor: 'system',
          reason: 'Funding instructions issued',
        });
        transaction = { ...transaction, status: 'AWAITING_DEPOSIT' };
      }

      this.logger.log(
        `${dto.network} offramp created: reference=${reference} quoteId=${quoteId}`,
      );

      // Relayed Stellar order: no deposit address is exposed; the wallet burns with the exact bridge parameters.
      const depositPayload = burnPlan
        ? {
            deposit: {
              network: dto.network,
              mode: 'cctp_relay',
              sourceAddress,
              amount: burnPlan.burnAmount,
              assetCode: 'USDC',
              validUntil: deposit.expiresAt ?? null,
            },
            bridge: this.stellarRelay.bridgeInstructions(
              deposit.paymentAddress,
              burnPlan,
              relayNetwork,
            ),
          }
        : {
            deposit: {
              network: dto.network,
              sourceAddress,
              receiveAddress: deposit.paymentAddress,
              amount: deposit.amountToPay ?? null,
              memo: deposit.memo ?? null,
              assetCode: deposit.assetCode ?? 'USDC',
              assetIssuer: deposit.assetIssuer ?? null,
              validUntil: deposit.expiresAt ?? null,
            },
          };

      return {
        status: 'success',
        message: burnPlan
          ? 'Offramp order created. Approve the transfer in your Stellar wallet.'
          : 'Offramp order created. Send the exact USDC amount to the deposit address.',
        databaseRecord: {
          id: transaction.id,
          reference: transaction.reference,
          status: transaction.status,
          createdAt: transaction.createdAt,
        },
        ...depositPayload,
      };
    } catch (error) {
      this.handleError('Failed to initialise stellar offramp', error);
    }
  }

  /**
   * Confirm the Stellar deposit_for_burn for an offramp order.
   *
   * Records the burn transaction hash and advances a PENDING order to
   * PROCESSING. Used as the client-side confirmation path; the Bitnob
   * payout webhook remains the authoritative settlement signal.
   */
  async confirmStellarOfframp(
    reference: string,
    dto: ConfirmStellarOfframpDto,
    userId: string,
    isMerchant: boolean,
  ): Promise<any> {
    const order = await this.payoutOrders.findByReference(reference);
    if (!order) {
      throw new NotFoundException('Offramp order not found');
    }

    let tx: any;
    let parentKey: 'offrampTransactionId' | 'merchantOfframpTransactionId';

    if (isMerchant && order.merchantOfframpTransactionId) {
      tx = await this.prisma.merchantOfframpTransaction.findUnique({
        where: { id: order.merchantOfframpTransactionId },
      });
      parentKey = 'merchantOfframpTransactionId';
      if (!tx || tx.merchantId !== userId) {
        throw new NotFoundException('Offramp order not found');
      }
    } else if (!isMerchant && order.offrampTransactionId) {
      tx = await this.prisma.offrampTransaction.findUnique({
        where: { id: order.offrampTransactionId },
      });
      parentKey = 'offrampTransactionId';
      if (!tx || tx.userId !== userId) {
        throw new NotFoundException('Offramp order not found');
      }
    } else {
      throw new NotFoundException('Offramp order not found');
    }

    if (
      dto.sourceAddress &&
      order.sourceAddress &&
      dto.sourceAddress !== order.sourceAddress
    ) {
      throw new BadRequestException('sourceAddress does not match the order');
    }

    const oldStatus = tx.status;
    const newStatus = oldStatus === 'PENDING' ? 'PROCESSING' : oldStatus;
    const metadata = {
      ...((tx.metadata as Record<string, any>) || {}),
      stellarTxHash: dto.stellarTxHash,
      burnConfirmedAt: new Date().toISOString(),
    };

    if (parentKey === 'offrampTransactionId') {
      // D1: the status change goes through the state machine (validated, logged, idempotent per tx hash).
      const applied = await this.offrampState.apply(tx.id, 'DEPOSIT_DETECTED', {
        actor: 'user',
        txHash: dto.stellarTxHash,
        eventKey: `stellar-deposit:${dto.stellarTxHash}`,
        eventType: 'deposit.confirmed',
        reason: `Stellar deposit_for_burn confirmed: ${dto.stellarTxHash}`,
      });
      await this.prisma.offrampTransaction.update({
        where: { id: tx.id },
        data: { metadata },
      });
      const current = await this.prisma.offrampTransaction.findUnique({
        where: { id: tx.id },
      });
      // CCTP-relayed order: start the Base mint right away (the client also polls /relay, which is idempotent).
      if ((metadata as any).cctpRelay && this.stellarRelay.isEnabled()) {
        void this.stellarRelay
          .relay(reference, userId)
          .catch((e) =>
            this.logger.warn(`Relay after burn confirm failed for ${reference}: ${e?.message}`),
          );
      }
      return {
        status: 'success',
        reference,
        newStatus: current?.status ?? oldStatus,
        outcome: applied.outcome,
        stellarTxHash: dto.stellarTxHash,
      };
    } else {
      await this.prisma.merchantOfframpTransaction.update({
        where: { id: tx.id },
        data: { status: newStatus, metadata },
      });
    }

    await this.payoutOrders.update(order, { depositTxHash: dto.stellarTxHash });
    // The burn hash is now known: put it on the CCTP record.
    if (!isMerchant) await this.recordRelayLeg(tx.id, order.reference, metadata);

    await this.prisma.transactionLog.create({
      data: {
        transactionType: 'offramp',
        transactionId: tx.id,
        // user orders returned above (state machine); only merchant orders reach this log
        userId: undefined,
        action: 'status_changed',
        oldStatus,
        newStatus,
        description: `Stellar deposit_for_burn confirmed: ${dto.stellarTxHash}`,
      },
    });

    return {
      status: 'success',
      reference,
      newStatus,
      stellarTxHash: dto.stellarTxHash,
    };
  }

  /**
   * Surface the reconciliation record for a single offramp order: the
   * transaction, its provider order (funding address, expected/received
   * amounts, expiry, failure reason) and the status-change history.
   */
  async getOfframpByReference(
    reference: string,
    userId: string,
    isMerchant: boolean,
  ): Promise<any> {
    const order = await this.payoutOrders.findByReference(reference);
    if (!order) {
      throw new NotFoundException('Offramp order not found');
    }

    let transaction: any;
    if (isMerchant && order.merchantOfframpTransactionId) {
      transaction = await this.payoutOrders.attach(
        await this.prisma.merchantOfframpTransaction.findUnique({
          where: { id: order.merchantOfframpTransactionId },
        }),
      );
      if (!transaction || transaction.merchantId !== userId) {
        throw new NotFoundException('Offramp order not found');
      }
    } else if (!isMerchant && order.offrampTransactionId) {
      transaction = await this.payoutOrders.attach(
        await this.prisma.offrampTransaction.findUnique({
          where: { id: order.offrampTransactionId },
        }),
      );
      if (!transaction || transaction.userId !== userId) {
        throw new NotFoundException('Offramp order not found');
      }
    } else {
      throw new NotFoundException('Offramp order not found');
    }

    const history = await this.prisma.transactionLog.findMany({
      where: { transactionId: transaction.id, transactionType: 'offramp' },
      orderBy: { createdAt: 'asc' },
    });

    // D1: full detail view (status label/message, history, settlement amounts, reconciliation) for user orders.
    const view = isMerchant
      ? null
      : await this.offrampState.getView(reference, userId);
    return { transaction, history, view };
  }

  /** Structured reconciliation record for one of the caller's cash-outs. */
  async getOfframpReconciliation(
    reference: string,
    userId: string,
  ): Promise<any> {
    const record = await this.offrampState.getReconciliation(reference, userId);
    if (!record) throw new NotFoundException('Reconciliation record not found');
    return record;
  }

  /** The caller's reconciliation records, newest first (filter by status or reconciliation result). */
  async listOfframpReconciliations(
    userId: string,
    filter: {
      status?: string;
      result?: string;
      limit?: number;
      skip?: number;
    } = {},
  ): Promise<any> {
    const records = await this.offrampState.listReconciliations({
      userId,
      ...filter,
    });
    return { total: records.length, records };
  }

  /**
   * Get OTC onramp quote
   *
   * @param dto - OTC onramp quote data
   * @returns Quote data
   */
  async otcOnRampQuote(dto: OtcOnRampQuoteDto): Promise<any> {
    const amount = dto.amount < 1 ? 1 : dto.amount;
    const network = dto.network || this.OTC_RAMP_NETWORK;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/v1/spec-ops/otc/onramp/quote`,
          {
            amount: amount,
            currency: this.OTC_RAMP_CURRENCY,
            network,
            asset: this.OTC_RAMP_ASSET,
            feePercent: this.OTC_RAMP_FEE_PERCENT,
          },
          {
            headers: {
              ...this.commonHeaders,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('Failed to fetch OTC onramp quote', error);
    }
  }

  /**
   * Execute OTC onramp transaction
   *
   * @param userId - User ID
   * @param dto - OTC onramp execution data
   * @returns Transaction result
   */
  async otcOnRampExecute(
    userId: string,
    dto: OtcOnRampExecuteDto,
  ): Promise<any> {
    const network = dto.network || this.OTC_RAMP_NETWORK;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/v1/spec-ops/otc/onramp/execute`,
          {
            ...dto,
            network,
            asset: this.OTC_RAMP_ASSET,
            feePercent: this.OTC_RAMP_FEE_PERCENT,
            notifyUrl:
              dto.notifyUrl ||
              this.configService.get<string>('FLINT_WEBHOOK_URL'),
          },
          {
            headers: {
              ...this.commonHeaders,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('Failed to execute OTC onramp', error);
    }
  }

  /**
   * Get OTC offramp quote
   *
   * @param dto - OTC offramp quote data
   * @returns Quote data
   */
  async otcOffRampQuote(dto: OtcOffRampQuoteDto): Promise<any> {
    const amount = dto.amount < 1 ? 1 : dto.amount;
    const network = dto.network || this.OTC_RAMP_NETWORK;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/v1/spec-ops/otc/offramp/quote`,
          {
            amount: amount,
            currency: this.OTC_RAMP_CURRENCY,
            network,
            asset: this.OTC_RAMP_ASSET,
            feePercent: this.OTC_RAMP_FEE_PERCENT,
          },
          {
            headers: {
              ...this.commonHeaders,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('Failed to fetch OTC offramp quote', error);
    }
  }

  /**
   * Execute OTC offramp transaction
   *
   * @param userId - User ID
   * @param dto - OTC offramp execution data
   * @returns Transaction result
   */
  async otcOffRampExecute(
    userId: string,
    dto: OtcOffRampExecuteDto,
  ): Promise<any> {
    const network = dto.network || this.OTC_RAMP_NETWORK;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/v1/spec-ops/otc/offramp/execute`,
          {
            ...dto,
            network,
            asset: this.OTC_RAMP_ASSET,
            feePercent: this.OTC_RAMP_FEE_PERCENT,
            notifyUrl:
              dto.notifyUrl ||
              this.configService.get<string>('FLINT_WEBHOOK_URL'),
          },
          {
            headers: {
              ...this.commonHeaders,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('Failed to execute OTC offramp', error);
    }
  }

  /**
   * Get transactions for a user
   *
   * Fetches transactions from the database for the authenticated user.
   * Can filter by transaction ID or reference.
   *
   * @param userId - User ID (required)
   * @param id - Transaction ID (optional)
   * @param reference - Transaction reference (optional)
   * @returns Transaction data from database
   */
  async getTransactions(
    id: string,
    isMerchant: boolean,
    transactionId?: string,
    reference?: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<any> {
    try {
      const where: any = isMerchant ? { merchantId: id } : { userId: id };

      if (transactionId) {
        where.id = transactionId;
      }

      if (reference) {
        where.reference = reference;
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Get total counts for pagination
      const onrampTotal = await (isMerchant
        ? this.prisma.merchantOnrampTransaction.count({ where })
        : this.prisma.onrampTransaction.count({ where }));
      const offrampTotal = await (isMerchant
        ? this.prisma.merchantOfframpTransaction.count({ where })
        : this.prisma.offrampTransaction.count({ where }));
      const swapTotal = await (isMerchant
        ? this.prisma.merchantSwapTransaction.count({ where })
        : this.prisma.swapTransaction.count({ where }));
      const total = onrampTotal + offrampTotal + swapTotal;

      // Fetch all transactions (we'll combine and paginate them)
      const allOnramp = await (isMerchant
        ? this.prisma.merchantOnrampTransaction.findMany({
            where,
            select: {
              id: true,
              reference: true,
              amount: true,
              currency: true,
              tokenAmount: true,
              tokenType: true,
              status: true,
              paymentReference: true,
              destinationAddress: true,
              network: true,
              createdAt: true,
              updatedAt: true,
              completedAt: true,
            },
            orderBy: { createdAt: 'desc' },
          })
        : this.prisma.onrampTransaction.findMany({
            where,
            select: {
              id: true,
              reference: true,
              amount: true,
              currency: true,
              tokenAmount: true,
              tokenType: true,
              status: true,
              flintTransactionId: true,
              destinationAddress: true,
              network: true,
              createdAt: true,
              updatedAt: true,
              completedAt: true,
            },
            orderBy: { createdAt: 'desc' },
          }));

      const offrampRows = await (isMerchant
        ? this.prisma.merchantOfframpTransaction.findMany({
            where,
            select: {
              id: true,
              reference: true,
              amount: true,
              fiatAmount: true,
              currency: true,
              tokenType: true,
              status: true,
              paymentReference: true,
              bankCode: true,
              accountNumber: true,
              accountName: true,
              bankName: true,
              network: true,
              createdAt: true,
              updatedAt: true,
              completedAt: true,
            },
            orderBy: { createdAt: 'desc' },
          })
        : this.prisma.offrampTransaction.findMany({
            where,
            select: {
              id: true,
              reference: true,
              amount: true,
              fiatAmount: true,
              currency: true,
              tokenType: true,
              status: true,
              flintTransactionId: true,
              bankCode: true,
              accountNumber: true,
              accountName: true,
              bankName: true,
              network: true,
              createdAt: true,
              updatedAt: true,
              completedAt: true,
            },
            orderBy: { createdAt: 'desc' },
          }));

      // The payout order's settlement fields come from the provider legs; keep the response to the fields the history always had.
      const allOfframp = (await this.payoutOrders.attachMany(offrampRows as any[])).map((row) => ({
        ...row,
        providerOrder: row.providerOrder && {
          depositTxHash: row.providerOrder.depositTxHash,
          failureReason: row.providerOrder.failureReason,
          receivedAmount: row.providerOrder.receivedAmount,
          expectedAmount: row.providerOrder.expectedAmount,
          fundingAddress: row.providerOrder.fundingAddress,
          expiresAt: row.providerOrder.expiresAt,
        },
      }));

      const allSwap = await (isMerchant
        ? this.prisma.merchantSwapTransaction.findMany({
            where,
            select: {
              id: true,
              reference: true,
              fromTokenType: true,
              fromAmount: true,
              toTokenType: true,
              toAmount: true,
              exchangeRate: true,
              sourceAddress: true,
              destinationAddress: true,
              status: true,
              transactionHash: true,
              fromNetwork: true,
              toNetwork: true,
              createdAt: true,
              updatedAt: true,
              completedAt: true,
            },
            orderBy: { createdAt: 'desc' },
          })
        : this.prisma.swapTransaction.findMany({
            where,
            select: {
              id: true,
              reference: true,
              fromTokenType: true,
              fromAmount: true,
              toTokenType: true,
              toAmount: true,
              exchangeRate: true,
              sourceAddress: true,
              destinationAddress: true,
              status: true,
              transactionHash: true,
              fromNetwork: true,
              toNetwork: true,
              createdAt: true,
              updatedAt: true,
              completedAt: true,
            },
            orderBy: { createdAt: 'desc' },
          }));

      // Combine and sort all transactions
      const allTransactions = [
        ...allOnramp.map((tx) => ({ ...tx, _type: 'onramp' as const })),
        ...allOfframp.map((tx) => ({ ...tx, _type: 'offramp' as const })),
        ...allSwap.map((tx) => ({ ...tx, _type: 'swap' as const })),
      ].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      // Apply pagination
      const paginatedTransactions = allTransactions.slice(skip, skip + limit);

      // Separate back into onramp, offramp, and swap
      // `status` is PENDING / COMPLETED / FAILED only; the finer state stays
      // available as `detailedStatus` (and on the off-ramp detail endpoint).
      const simplify = ({ _type, ...tx }: any) => ({
        ...tx,
        status: normalizeBridgeStatus(tx.status),
        detailedStatus: tx.status,
      });
      const onrampTransactions = paginatedTransactions
        .filter((tx) => tx._type === 'onramp')
        .map(simplify);
      const offrampTransactions = paginatedTransactions
        .filter((tx) => tx._type === 'offramp')
        .map(simplify);
      const swapTransactions = paginatedTransactions
        .filter((tx) => tx._type === 'swap')
        .map(simplify);

      const totalPages = Math.ceil(total / limit);

      return {
        onramp: onrampTransactions,
        offramp: offrampTransactions,
        swap: swapTransactions,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      this.handleError('Failed to fetch transactions', error);
    }
  }

  /** Writes the CCTP leg for a relayed off-ramp. Recording must never fail the order, so errors are logged and swallowed. */
  private async recordRelayLeg(transactionId: string, reference: string, metadata: unknown): Promise<void> {
    try {
      const fields = relayLegFields(reference, metadata);
      if (fields) await this.payoutOrders.recordRelayLeg(transactionId, fields);
    } catch (e) {
      this.logger.warn(`Could not record the CCTP leg for ${reference}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private parseDecimal(value: string | undefined | null): string | null {
    if (value == null) return null;
    const normalized = String(value).trim();
    if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) return null;
    return normalized;
  }

  private parseDate(value: string | undefined | null): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  private handleError(message: string, error: AxiosError | unknown): never {
    // Preserve validation / provider errors already mapped to HTTP exceptions
    if (error instanceof HttpException) {
      this.logger.error(`${message}: ${error.message}`);
      throw error;
    }
    let status = HttpStatus.BAD_GATEWAY;
    let errorMessage = 'Unknown error';
    if (error instanceof AxiosError) {
      this.logger.error(
        `[Flint Error] ${message}: Status ${error.response?.status}`,
      );
      this.logger.error(
        `Response Data: ${JSON.stringify(error.response?.data)}`,
      );
      this.logger.error(`Request URL: ${error.config?.url}`);

      status = error.response?.status || status;
      const responseData = error.response?.data;
      const dataMessage =
        responseData?.message ||
        responseData?.error?.message ||
        responseData?.error?.issues?.map((i: any) => i.message).join(', ');
      errorMessage = dataMessage || error.message || errorMessage;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    this.logger.error(`${message}: ${errorMessage}`);
    throw new HttpException(`${message}: ${errorMessage}`, status);
  }
}
