import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { getAssetForCorridor } from '../swap/config/constant';
import type { RampProcessor } from './ramp-processor.interface';
import { RampProcessorRegistry } from './ramp-processor.registry';
import { CorridorService } from '../corridor/corridor.service';
import { offRampDto, onRampDto } from './dto/index.dto';
import { generateTrxReference } from '../../utils/reference.util';
import { ChainRegistryService } from '../bridge/chain-registry.service';
import { ChainTokenRegistryService } from '../bridge/chain-token-registry.service';

@Injectable()
export class StablestackService {
  private readonly logger = new Logger(StablestackService.name);

  constructor(
    private readonly rampProcessorRegistry: RampProcessorRegistry,
    private readonly corridorService: CorridorService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
    private readonly chainRegistry: ChainRegistryService,
    private readonly chainTokenRegistry: ChainTokenRegistryService,
  ) {}

  /**
   * The app-wide default processor (RAMP_PROCESSOR_PROVIDER), resolved
   * lazily at call time — NOT constructed at app boot. Constructing it
   * eagerly (the original design, via a DI-injected singleton) meant a
   * misconfigured default provider (e.g. SafeHaven credentials unset)
   * crashed the *entire app's* startup, not just the requests that
   * actually needed it. Found by running the app for real.
   */
  private getDefaultProcessor(): RampProcessor {
    // process.env, not ConfigService — see WebhookService.getDefaultProcessor
    // for why (ConfigService bakes this into a frozen snapshot at
    // ConfigModule import time and never reflects later changes).
    const provider = process.env.RAMP_PROCESSOR_PROVIDER || 'flint';
    return this.rampProcessorRegistry.get(provider);
  }

  /**
   * The processor for a given currency's corridor, or the app-wide default
   * when no currency is specified — preserves backward compatibility for
   * callers that predate multi-corridor support.
   */
  private async resolveProcessor(currency?: string): Promise<RampProcessor> {
    if (!currency) return this.getDefaultProcessor();
    const corridor = await this.corridorService.findByCurrency(currency.toUpperCase());
    return this.rampProcessorRegistry.get(corridor.rampProcessorProvider);
  }

  async getBanks(currency?: string): Promise<any> {
    const processor = await this.resolveProcessor(currency);
    return processor.getBanks(currency ? { currency: currency.toUpperCase() } : undefined);
  }

  /**
   * Resolve account name
   *
   * Resolves the account name from bank code and account number via the
   * configured RampProcessor.
   *
   * @param bankCode - Bank code
   * @param accountNumber - Account number
   * @param currency - Fiat currency (ISO 4217); selects the corridor's processor. Defaults to the app-wide default processor.
   * @returns Account name resolution data
   */
  async resolveAccount(bankCode: string, accountNumber: string, currency?: string): Promise<any> {
    const processor = await this.resolveProcessor(currency);
    return processor.resolveAccount(
      bankCode,
      accountNumber,
      currency ? { currency: currency.toUpperCase() } : undefined,
    );
  }

  /**
   * Initialize onramp transaction
   *
   * Resolves the corridor for the requested currency (defaults to NGN),
   * initiates the NGN bank-rail leg via that corridor's RampProcessor, and
   * saves it to the database. The actual mint happens in WebhookService
   * once the fiat payment is confirmed.
   *
   * @param userId - User ID from authenticated request
   * @param dto - Onramp transaction data
   * @param ipAddress - Client IP address (optional)
   * @param userAgent - Client user agent (optional)
   * @returns Transaction data with database record
   */
  async onRamp(
    userId: string,
    dto: onRampDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<any> {
    const reference = generateTrxReference();
    const webhookUrl = this.configService.get<string>('WEBHOOK_URL');
    const currency = (dto.currency || 'NGN').toUpperCase();
    const corridor = await this.corridorService.findByCurrency(currency);
    const rampProcessor = this.rampProcessorRegistry.get(corridor.rampProcessorProvider);

    // Cross-chain delivery: validated up front so a typo/unregistered
    // chain-token fails now, not silently once the fiat payment already
    // confirmed and WebhookService.completeOnrampTransaction tries to
    // deliver it. Defaults preserve today's only behavior exactly (plain
    // payoutChain='stellar' + no payoutTokenCode = the corridor's own
    // stablecoin, straight to the user's wallet).
    const payoutChain = dto.payoutChain || 'stellar';
    const chain = await this.chainRegistry.findByName(payoutChain);
    const payoutTokenCode = dto.payoutTokenCode?.toUpperCase() || (chain.chainType === 'EVM' ? 'USDC' : null);

    if (payoutTokenCode && payoutTokenCode !== corridor.stablecoinCode.toUpperCase() && payoutTokenCode !== 'USDC') {
      if (chain.chainType === 'STELLAR') {
        await this.corridorService.findByStablecoinCode(payoutTokenCode);
      } else {
        await this.chainTokenRegistry.findByCode(payoutChain, payoutTokenCode);
      }
    }

    // Only needed by processors built around a persistent per-customer
    // deposit account (see RampProcessor.initiateOnramp) — cheap lookup,
    // and avoids threading userEmail through every onRamp call site.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const result = await rampProcessor.initiateOnramp({
      reference,
      amount: dto.amount,
      destinationAddress: dto.destination.address, // Stellar G... address
      notifyUrl: webhookUrl,
      userEmail: user?.email,
      phoneNumber: dto.destination.phoneNumber,
      currency,
      countryCode: corridor.countryCode,
    });

    // depositAccount is a free-form JSONB blob (no migration needed): either
    // the usual bank-transfer account details, or — for a push-to-phone
    // collection method (e.g. KES/M-Pesa, see RampProcessorTransaction) —
    // the collectionMethod/displayMessage the frontend needs to show a
    // "check your phone" prompt instead of an account number.
    const depositAccount =
      result.depositAccount ??
      (result.collectionMethod
        ? { collectionMethod: result.collectionMethod, displayMessage: result.displayMessage }
        : undefined);

    const transaction = await this.prisma.onrampTransaction.create({
      data: {
        userId,
        reference,
        amount: dto.amount,
        currency,
        tokenType: corridor.stablecoinCode,
        status: 'PENDING',
        flintTransactionId: result.providerTransactionId,
        destinationAddress: dto.destination.address,
        network: 'stellar',
        payoutChain,
        payoutTokenCode,
        notifyUrl: webhookUrl || null,
        depositAccount,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });

    await this.prisma.transactionLog.create({
      data: {
        transactionType: 'onramp',
        transactionId: transaction.id,
        userId,
        action: 'created',
        newStatus: 'PENDING',
        description: 'Onramp transaction initialized',
      },
    });

    return {
      ...result.raw,
      databaseRecord: {
        id: transaction.id,
        reference: transaction.reference,
        status: transaction.status,
        createdAt: transaction.createdAt,
      },
    };
  }

  /**
   * Initialize offramp transaction
   *
   * Resolves the corridor for the requested currency (defaults to NGN) and
   * saves a PENDING record. Deliberately does NOT call the processor's
   * money-moving endpoint here — SafeHaven's `POST /transfers` and
   * Paystack's `POST /transfer` both execute the fiat payout synchronously
   * the moment they're called, so calling them at offramp *creation* time
   * (this method's old behavior) would pay the user out before they've
   * sent any crypto. The real payout is deferred to
   * completeDepositIfMemoMatched, which only fires once the on-chain
   * deposit is confirmed. This method only validates the destination bank
   * account resolves (fails fast on a bad account number/bank code, before
   * the user sends anything) via the same RampProcessor.
   *
   * Stellar offramp deposits land on AutoRamp's shared collection account
   * (no per-transaction address like Base), disambiguated by this
   * transaction's memo. STELLAR_DISTRIBUTION_PUBLIC_KEY must match the
   * account for STELLAR_DISTRIBUTION_SECRET used by StellarService.
   *
   * @param userId - User ID from authenticated request
   * @param dto - Offramp transaction data
   * @param ipAddress - Client IP address (optional)
   * @param userAgent - Client user agent (optional)
   * @returns Transaction data with database record
   */
  async offRamp(
    userId: string,
    dto: offRampDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<any> {
    const reference = generateTrxReference();
    const webhookUrl = this.configService.get<string>('WEBHOOK_URL');
    const currency = (dto.currency || 'NGN').toUpperCase();
    const corridor = await this.corridorService.findByCurrency(currency);
    const rampProcessor = this.rampProcessorRegistry.get(corridor.rampProcessorProvider);

    const collectionAddress = this.configService.get<string>(
      'STELLAR_DISTRIBUTION_PUBLIC_KEY',
    );
    if (!collectionAddress) {
      throw new HttpException(
        'STELLAR_DISTRIBUTION_PUBLIC_KEY missing in config',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const resolved = await rampProcessor.resolveAccount(
      dto.destination.bankCode,
      dto.destination.accountNumber,
      { currency, countryCode: corridor.countryCode },
    );
    const accountName =
      resolved?.data?.accountName || resolved?.data?.account_name || null;

    const transaction = await this.prisma.offrampTransaction.create({
      data: {
        userId,
        reference,
        amount: dto.amount,
        currency,
        tokenType: corridor.stablecoinCode,
        status: 'PENDING',
        flintTransactionId: null, // no payout has happened yet — set once the on-chain deposit is confirmed and the payout executes
        bankCode: dto.destination.bankCode,
        accountNumber: dto.destination.accountNumber,
        accountName,
        bankName: null,
        network: 'stellar',
        notifyUrl: webhookUrl || null,
        memo: reference,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });

    await this.prisma.transactionLog.create({
      data: {
        transactionType: 'offramp',
        transactionId: transaction.id,
        userId,
        action: 'created',
        newStatus: 'PENDING',
        description: 'Offramp transaction initialized (fiat payout withheld until crypto deposit confirmed)',
      },
    });

    return {
      databaseRecord: {
        id: transaction.id,
        reference: transaction.reference,
        status: transaction.status,
        createdAt: transaction.createdAt,
      },
      data: {
        depositAddress: collectionAddress,
        memo: reference,
      },
    };
  }

  /**
   * Confirm a CNGN deposit for an offramp transaction.
   *
   * The configured RampProcessor can't detect this itself — Stellar
   * deposits land on AutoRamp's own shared collection account, so we
   * verify the reported transaction ourselves via Horizon before moving
   * the transaction out of PENDING. Final COMPLETED status still arrives
   * via the processor's webhook once the NGN payout to the user's bank
   * account clears.
   *
   * @param reference - Offramp transaction reference
   * @param transactionHash - Stellar transaction hash reported by the frontend
   */
  async confirmOfframpDeposit(reference: string, transactionHash: string): Promise<any> {
    const transaction = await this.prisma.offrampTransaction.findUnique({
      where: { reference },
    });

    if (!transaction) {
      throw new HttpException('Offramp transaction not found', HttpStatus.NOT_FOUND);
    }

    if (transaction.status !== 'PENDING') {
      return transaction;
    }

    if (!transaction.memo) {
      throw new HttpException(
        'Offramp transaction has no memo to verify against',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Sanity-check the client-supplied hash actually succeeded on-chain
    // before doing the (slower) memo search — fails fast on garbage input.
    const verified = await this.stellarService.getTransactionByHash(transactionHash);
    if (!verified || !verified.successful) {
      throw new HttpException(
        'Deposit transaction not found or not successful',
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.completeDepositIfMemoMatched(transaction);
    if (!updated) {
      throw new HttpException(
        'Matching deposit not found for this reference yet',
        HttpStatus.BAD_REQUEST,
      );
    }

    return updated;
  }

  /**
   * Shared state transition: PENDING -> PROCESSING once a matching
   * memo-tagged deposit is found on-chain — and the point where the real
   * fiat payout actually executes (see offRamp's doc comment for why it's
   * not triggered any earlier). Used by both confirmOfframpDeposit (client
   * reports a hash, we verify it, then still re-derive proof via memo
   * match) and OfframpDepositWatcherService (no client callback at all —
   * the memo match against Horizon is itself the proof, no hash to verify).
   *
   * The claim on the transaction (PENDING -> PROCESSING) is done via an
   * atomic conditional update *before* calling the processor, so a
   * concurrent caller (the watcher and a client confirm-deposit request
   * racing) can't both trigger the payout for the same transaction.
   *
   * The asset to watch for, and the processor to pay out through, are
   * derived from the transaction's own `tokenType`/`currency` — not
   * hardcoded, since different offramps can be on different corridors.
   *
   * Returns null (does not throw) if there's nothing to confirm yet, so
   * the scheduled watcher can call this in a loop without try/catch per
   * "not found yet" case — that's the expected, common outcome there.
   */
  async completeDepositIfMemoMatched(transaction: {
    id: string;
    reference: string;
    status: string;
    memo: string | null;
    userId: string;
    tokenType: string;
    currency: string;
    amount: any;
    bankCode: string;
    accountNumber: string;
  }): Promise<any | null> {
    if (transaction.status !== 'PENDING' || !transaction.memo) {
      return null;
    }

    const collectionAddress = this.configService.get<string>(
      'STELLAR_DISTRIBUTION_PUBLIC_KEY',
    );
    if (!collectionAddress) {
      throw new HttpException(
        'STELLAR_DISTRIBUTION_PUBLIC_KEY missing in config',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const corridor = await this.corridorService.findByStablecoinCode(transaction.tokenType || 'CNGN');
    const found = await this.stellarService.findIncomingPaymentByMemo(
      collectionAddress,
      transaction.memo,
      getAssetForCorridor(corridor),
    );
    if (!found) {
      return null;
    }

    // Pay out what was actually deposited, capped at what the offramp was
    // created for — `transaction.amount` is only the user's declared
    // intent, so paying it unconditionally would let a dust deposit with
    // the right memo cash out any amount. Any excess over the declared
    // amount stays in the distribution account for manual refund.
    const declaredAmount = new Prisma.Decimal(transaction.amount.toString());
    const depositedAmount = new Prisma.Decimal(found.amount);
    const payoutAmount = Prisma.Decimal.min(declaredAmount, depositedAmount);
    if (payoutAmount.lte(0)) {
      return null;
    }

    const claim = await this.prisma.offrampTransaction.updateMany({
      where: { id: transaction.id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    if (claim.count === 0) {
      // Someone else (the watcher, or a concurrent confirm-deposit call)
      // already claimed this transaction — return its current state
      // rather than double-triggering the payout below.
      return this.prisma.offrampTransaction.findUnique({ where: { id: transaction.id } });
    }

    await this.prisma.transactionLog.create({
      data: {
        transactionType: 'offramp',
        transactionId: transaction.id,
        userId: transaction.userId,
        action: 'status_changed',
        oldStatus: 'PENDING',
        newStatus: 'PROCESSING',
        description: `Deposit confirmed on-chain (${found.transactionHash}). Triggering fiat payout of ${payoutAmount.toString()}.`,
        metadata: {
          depositTxHash: found.transactionHash,
          declaredAmount: declaredAmount.toString(),
          depositedAmount: depositedAmount.toString(),
          payoutAmount: payoutAmount.toString(),
        },
      },
    });
    if (!depositedAmount.eq(declaredAmount)) {
      this.logger.warn(
        `Offramp ${transaction.reference}: deposited ${depositedAmount.toString()} but declared ${declaredAmount.toString()} — paying out ${payoutAmount.toString()}`,
      );
    }

    const rampProcessor = this.rampProcessorRegistry.get(corridor.rampProcessorProvider);
    const webhookUrl = this.configService.get<string>('WEBHOOK_URL');

    try {
      const payout = await rampProcessor.executeOfframpPayout({
        reference: transaction.reference,
        amount: payoutAmount.toNumber(),
        bankCode: transaction.bankCode,
        accountNumber: transaction.accountNumber,
        notifyUrl: webhookUrl,
        currency: transaction.currency,
        countryCode: corridor.countryCode,
      });

      return await this.prisma.offrampTransaction.update({
        where: { id: transaction.id },
        data: { flintTransactionId: payout.providerTransactionId },
      });
    } catch (error: any) {
      // The on-chain deposit is real and already confirmed at this point,
      // so we deliberately do NOT revert to PENDING — silently retrying
      // the payout risks a double-payout if the processor actually
      // executed the transfer but we lost the response. Left in
      // PROCESSING for manual ops reconciliation; a proper fix needs
      // idempotency-key-based safe retries, which is out of scope here.
      this.logger.error(
        `Offramp ${transaction.reference}: on-chain deposit confirmed but fiat payout failed — needs manual reconciliation: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Scans PENDING offramp transactions for a matching memo-tagged deposit,
   * independent of any client callback — called by
   * OfframpDepositWatcherService. Without this, an offramp can get stuck
   * in PENDING forever if the user's browser closes (or the confirm
   * request just fails) after they've already sent the deposit asset.
   *
   * Bounded to recent transactions: one older than `sinceHoursAgo` is
   * presumably abandoned and needs manual review, not indefinite polling.
   */
  async findAndConfirmPendingDeposits(
    sinceHoursAgo = 24,
  ): Promise<{ checked: number; confirmed: number }> {
    const since = new Date(Date.now() - sinceHoursAgo * 60 * 60 * 1000);
    const pending = await this.prisma.offrampTransaction.findMany({
      where: { status: 'PENDING', memo: { not: null }, createdAt: { gte: since } },
    });

    let confirmed = 0;
    for (const transaction of pending) {
      try {
        const updated = await this.completeDepositIfMemoMatched(transaction);
        if (updated) confirmed++;
      } catch (error: any) {
        this.logger.error(
          `Deposit watcher: failed checking offramp ${transaction.reference}: ${error.message}`,
        );
      }
    }

    return { checked: pending.length, confirmed };
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
    userId: string,
    id?: string,
    reference?: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<any> {
    try {
      const where: any = { userId };

      if (id) {
        where.id = id;
      }

      if (reference) {
        where.reference = reference;
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Get total counts for pagination
      const onrampTotal = await this.prisma.onrampTransaction.count({ where });
      const offrampTotal = await this.prisma.offrampTransaction.count({ where });
      const swapTotal = await this.prisma.swapTransaction.count({ where });
      const total = onrampTotal + offrampTotal + swapTotal;

      // Fetch all transactions (we'll combine and paginate them)
      const allOnramp = await this.prisma.onrampTransaction.findMany({
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
        orderBy: {
          createdAt: 'desc',
        },
      });

      const allOfframp = await this.prisma.offrampTransaction.findMany({
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
          memo: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      const allSwap = await this.prisma.swapTransaction.findMany({
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
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Combine and sort all transactions
      const allTransactions = [
        ...allOnramp.map((tx) => ({ ...tx, _type: 'onramp' as const })),
        ...allOfframp.map((tx) => ({ ...tx, _type: 'offramp' as const })),
        ...allSwap.map((tx) => ({ ...tx, _type: 'swap' as const })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Apply pagination
      const paginatedTransactions = allTransactions.slice(skip, skip + limit);

      // Separate back into onramp, offramp, and swap
      const onrampTransactions = paginatedTransactions
        .filter((tx) => tx._type === 'onramp')
        .map(({ _type, ...tx }) => tx);
      const offrampTransactions = paginatedTransactions
        .filter((tx) => tx._type === 'offramp')
        .map(({ _type, ...tx }) => tx);
      const swapTransactions = paginatedTransactions
        .filter((tx) => tx._type === 'swap')
        .map(({ _type, ...tx }) => tx);

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
      throw new HttpException(
        `Failed to fetch transactions: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
