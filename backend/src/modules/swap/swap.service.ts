import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Asset } from '@stellar/stellar-sdk';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../database/prisma.service';
import { StablestackService } from '../stablestack/stablestack.service';
import { StellarService } from '../stellar/stellar.service';
import { getUsdcAsset, getBridgeUsdcAsset, getAssetForCorridor } from './config/constant';

/**
 * Hub-like assets that trade freely against each other with no corridor
 * minimum — USDC (the NGN-corridor hub), native XLM, and Circle's real
 * bridge-compatible USDC. Everything else is a corridor stablecoin, which
 * keeps the $100 floor (see createSimpleSwap).
 */
const HUB_ASSET_CODES = new Set(['USDC', 'XLM', 'BRIDGE_USDC']);
import { CorridorService } from '../corridor/corridor.service';
import { InitializeSwapDto } from './dto/initialize-swap.dto';
import { CreateSimpleSwapDto } from './dto/create-simple-swap.dto';
import { generateTrxReference } from '../../utils/reference.util';
import { MOBILE_MONEY_ONRAMP_CURRENCIES } from '../stablestack/providers/paystack-ramp-processor.service';

@Injectable()
export class SwapService {
  private readonly logger = new Logger(SwapService.name);

  // Cache for USD/NGN rate (respects 1 request/minute limit)
  private usdNgnRateCache: { rate: number; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute in milliseconds

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private stablestackService: StablestackService,
    private httpService: HttpService,
    private stellarService: StellarService,
    private corridorService: CorridorService,
  ) {}

  /**
   * Public discovery list for the frontend: every active corridor's
   * fiat/stablecoin pair, so currency selectors can be driven by the
   * corridor registry instead of hardcoding NGN/CNGN.
   */
  async getActiveCorridors(): Promise<
    {
      countryCode: string;
      fiatCurrency: string;
      stablecoinCode: string;
      /**
       * How the frontend should collect the fiat side of a buy/onramp for
       * this corridor: the usual bank-transfer deposit account, or (KES
       * today) a phone number that gets an M-Pesa push prompt — see
       * MOBILE_MONEY_ONRAMP_CURRENCIES / PaystackRampProcessor.
       */
      onrampCollectionMethod: 'bank_transfer' | 'mobile_money';
    }[]
  > {
    const corridors = await this.corridorService.findAll({ activeOnly: true });
    return corridors.map((c) => ({
      countryCode: c.countryCode,
      fiatCurrency: c.fiatCurrency,
      stablecoinCode: c.stablecoinCode,
      onrampCollectionMethod: MOBILE_MONEY_ONRAMP_CURRENCIES.has(c.fiatCurrency.toUpperCase())
        ? 'mobile_money'
        : 'bank_transfer',
    }));
  }

  /**
   * Resolves any tradable asset code to a Stellar Asset. 'USDC' is the
   * fixed hub asset every corridor pairs against; 'XLM' is native lumens;
   * 'BRIDGE_USDC' is Circle's real, CCTP-bridge-compatible USDC (a
   * different issuer than 'USDC' — see getBridgeUsdcAsset's doc comment).
   * Anything else is looked up in the corridor registry by stablecoin code
   * (e.g. 'CNGN', 'CGHS') — so a new corridor becomes tradable the moment
   * its row exists, with no code change here.
   */
  async resolveAsset(code: string): Promise<Asset> {
    const upper = code.toUpperCase();
    if (upper === 'USDC') return getUsdcAsset();
    if (upper === 'XLM') return Asset.native();
    if (upper === 'BRIDGE_USDC') return getBridgeUsdcAsset();
    const corridor = await this.corridorService.findByStablecoinCode(upper);
    return getAssetForCorridor(corridor);
  }

  /**
   * Get a live swap quote between two tradable assets (USDC/XLM/BRIDGE_USDC
   * or a corridor stablecoin) via Stellar's native path-payment routing
   * (replaces the old direct on-chain Aerodrome quoter call the frontend
   * used to make). `issuer` is omitted for native XLM — callers must treat
   * a missing issuer as native, not attempt `new Asset(code, undefined)`.
   */
  async getSwapQuote(
    fromToken: string,
    toToken: string,
    amount: number,
  ): Promise<{
    sourceAmount: string;
    destinationAmount: string;
    exchangeRate: number;
    sourceAsset: { code: string; issuer?: string };
    destAsset: { code: string; issuer?: string };
  }> {
    try {
      const sourceAsset = await this.resolveAsset(fromToken);
      const destAsset = await this.resolveAsset(toToken);

      const quote = await this.stellarService.getStrictSendQuote(
        sourceAsset,
        amount.toString(),
        destAsset,
      );

      const exchangeRate =
        parseFloat(quote.destinationAmount) / parseFloat(quote.sourceAmount);

      return {
        sourceAmount: quote.sourceAmount,
        destinationAmount: quote.destinationAmount,
        exchangeRate,
        sourceAsset: { code: sourceAsset.getCode(), issuer: sourceAsset.getIssuer() },
        destAsset: { code: destAsset.getCode(), issuer: destAsset.getIssuer() },
      };
    } catch (error: any) {
      this.logger.error('Error getting swap quote:', error.message);
      throw new BadRequestException(`Failed to get swap quote: ${error.message}`);
    }
  }

  async hasTrustline(token: string, address: string): Promise<{ hasTrustline: boolean }> {
    try {
      const asset = await this.resolveAsset(token);
      const hasTrustline = await this.stellarService.hasTrustline(address, asset);
      return { hasTrustline };
    } catch (error: any) {
      this.logger.error('Error checking trustline:', error.message);
      throw new BadRequestException(`Failed to check trustline: ${error.message}`);
    }
  }

  /**
   * Build a distribution-account-sponsored trustline transaction for the
   * user to sign — they never have to fund the reserve a new trustline
   * would normally require.
   */
  async getSponsoredTrustlineTransaction(
    token: string,
    address: string,
  ): Promise<{ xdr: string; networkPassphrase: string }> {
    try {
      const asset = await this.resolveAsset(token);
      return await this.stellarService.buildSponsoredTrustlineTransaction({
        userPublicKey: address,
        asset,
      });
    } catch (error: any) {
      this.logger.error('Error building sponsored trustline transaction:', error.message);
      throw new BadRequestException(`Failed to build sponsored trustline transaction: ${error.message}`);
    }
  }

  async getTokenBalance(
    token: string,
    address: string,
  ): Promise<string | null> {
    try {
      const asset = await this.resolveAsset(token);
      return await this.stellarService.getBalance(address, asset);
    } catch (error: any) {
      this.logger.error('Error fetching token balance:', error.message);
      throw new BadRequestException(
        `Failed to fetch balance: ${error.message}`,
      );
    }
  }

  /**
   * Balances for USDC (the hub) plus every active corridor's stablecoin —
   * dynamic over the corridor registry rather than a fixed cngn/usdc pair.
   * Also includes native XLM always, and Circle's real bridge-compatible
   * USDC when BRIDGE_USDC_ISSUER_PUBLIC_KEY is configured (omitted rather
   * than erroring for deployments that haven't set it up).
   */
  async getTokenBalances(
    address: string,
  ): Promise<Record<string, string | null>> {
    try {
      const corridors = await this.corridorService.findAll({ activeOnly: true });
      const assets: Record<string, Asset> = { usdc: getUsdcAsset(), xlm: Asset.native() };
      for (const corridor of corridors) {
        assets[corridor.stablecoinCode.toLowerCase()] = getAssetForCorridor(corridor);
      }
      if (process.env.BRIDGE_USDC_ISSUER_PUBLIC_KEY) {
        assets.bridge_usdc = getBridgeUsdcAsset();
      }
      return await this.stellarService.getBalances(address, assets);
    } catch (error: any) {
      this.logger.error('Error fetching token balances:', error.message);
      throw new BadRequestException(
        `Failed to fetch balances: ${error.message}`,
      );
    }
  }

  /**
   * Get USD/NGN rate from MonieRate API with caching
   * Caches the rate for 1 minute to respect API rate limit (1 request/minute)
   * @returns USD/NGN rate (e.g., 1619.01 means 1 USD = 1619.01 NGN)
   */
  async getUsdNgnRate(): Promise<number> {
    try {
      const now = Date.now();

      if (
        this.usdNgnRateCache &&
        now - this.usdNgnRateCache.timestamp < this.CACHE_TTL_MS
      ) {
        this.logger.debug(
          `Using cached USD/NGN rate: ${this.usdNgnRateCache.rate}`,
        );
        return this.usdNgnRateCache.rate;
      }

      const apiKey = this.configService.get<string>('MONIE_RATE_API_KEY');
      if (!apiKey) {
        throw new Error('MONIE_RATE_API_KEY is not configured');
      }

      this.logger.debug('Fetching USD/NGN rate from MonieRate API');
      const response = await firstValueFrom(
        this.httpService.get<{
          status: string;
          message: string;
          data: {
            timestamp: number;
            base: string;
            market: string;
            rates: {
              NGN: number;
            };
          };
        }>(
          'https://api.monierate.com/core/rates/latest.json?base=USD&market=mid',
          {
            headers: {
              api_key: apiKey,
            },
          },
        ),
      );

      const rate = response.data?.data?.rates?.NGN;
      if (!rate || rate <= 0) {
        throw new Error('Invalid rate from MonieRate API');
      }

      this.usdNgnRateCache = {
        rate,
        timestamp: now,
      };

      this.logger.debug(`Cached USD/NGN rate: ${rate}`);
      return rate;
    } catch (error: any) {
      this.logger.error(
        'Error fetching USD/NGN rate from MonieRate:',
        error.message,
      );
      throw new BadRequestException(
        `Failed to fetch USD/NGN rate: ${error.message}`,
      );
    }
  }

  /**
   * Calculate estimated NGN value from CNGN amount
   * Since CNGN = NGN (1:1 peg), we just multiply CNGN amount by USD/NGN rate
   */
  async calculateEstimatedNgn(
    cngnAmount: number,
  ): Promise<{ estimatedNgn: number; usdNgnRate: number; usdValue: number }> {
    try {
      const usdNgnRate = await this.getUsdNgnRate();
      const estimatedNgn = cngnAmount * usdNgnRate;
      const usdValue = cngnAmount;

      return {
        estimatedNgn,
        usdNgnRate,
        usdValue,
      };
    } catch (error: any) {
      this.logger.error('Error calculating estimated NGN:', error.message);
      throw new BadRequestException(
        `Failed to calculate estimated NGN: ${error.message}`,
      );
    }
  }

  /**
   * Initialize swap transaction
   * Creates offramp first to get the AutoRamp collection account + memo,
   * then creates a linked swap record. Frontend builds/signs the actual
   * PathPaymentStrictSend transaction using the returned swapParams.
   */
  async initializeSwap(
    userId: string,
    dto: InitializeSwapDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<any> {
    try {
      const currency = (dto.currency || 'NGN').toUpperCase();
      const corridor = await this.corridorService.findByCurrency(currency);

      // Validated (and the offramp only created) before touching anything
      // stateful — an invalid fromTokenType shouldn't leave an orphaned
      // offramp transaction behind.
      const fromTokenType = (dto.fromTokenType || 'USDC').toUpperCase();
      const fromAsset = await this.resolveAsset(fromTokenType);
      if (fromTokenType === corridor.stablecoinCode) {
        throw new BadRequestException(
          `fromTokenType and the destination corridor's stablecoin (${corridor.stablecoinCode}) must differ — selling a coin for its own fiat doesn't need a swap`,
        );
      }
      if (!HUB_ASSET_CODES.has(fromTokenType) && dto.fromAmount < 100) {
        throw new BadRequestException(`Minimum amount for ${fromTokenType} is 100`);
      }

      const offrampResult = await this.stablestackService.offRamp(
        userId,
        {
          type: 'off',
          network: 'stellar',
          amount: dto.amount, // fiat amount (estimated value from frontend), in the corridor's currency
          destination: {
            bankCode: dto.offrampDestination.bankCode,
            accountNumber: dto.offrampDestination.accountNumber,
          },
          currency,
        },
        ipAddress,
        userAgent,
      );

      const offrampTransaction = offrampResult?.databaseRecord;
      if (!offrampTransaction) {
        throw new BadRequestException(
          'Failed to initialize offramp transaction',
        );
      }

      // Stellar offramp deposits land on AutoRamp's shared collection
      // account, disambiguated by memo (no per-transaction address like Base).
      const recipientAddress = offrampResult?.data?.depositAddress;
      const memo = offrampResult?.data?.memo;

      if (!recipientAddress || !memo) {
        this.logger.error(
          'Offramp response structure:',
          JSON.stringify(offrampResult, null, 2),
        );
        throw new BadRequestException(
          'Recipient address/memo not found in offramp response',
        );
      }

      const toTokenType = corridor.stablecoinCode;
      const fromAmountDecimal = dto.fromAmount;

      // Use estimated fiat amount from frontend as the expected output amount
      const toAmountDecimal = dto.amount;
      const exchangeRate = dto.fromAmount > 0 ? dto.amount / dto.fromAmount : 0;

      const swapTransaction = await this.prisma.swapTransaction.create({
        data: {
          userId,
          reference: offrampTransaction.reference, // Same reference as offramp
          fromTokenType,
          fromAmount: fromAmountDecimal,
          fromNetwork: 'stellar',
          toTokenType,
          toAmount: toAmountDecimal,
          toNetwork: 'stellar',
          exchangeRate,
          sourceAddress: '', // Will be set when user executes swap from frontend
          destinationAddress: recipientAddress,
          memo,
          status: 'PENDING',
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });

      await this.prisma.offrampTransaction.update({
        where: { id: offrampTransaction.id },
        data: {
          swapId: swapTransaction.id,
        },
      });

      await this.prisma.transactionLog.create({
        data: {
          transactionType: 'swap',
          transactionId: swapTransaction.id,
          userId,
          action: 'created',
          newStatus: 'PENDING',
          description: 'Swap transaction initialized (pending user execution)',
        },
      });

      const corridorAsset = getAssetForCorridor(corridor);
      // toFixed(7), not toString() — Stellar rejects more than 7 decimal
      // places, and floating-point multiplication routinely produces more
      // (e.g. 354.6341872 * 0.95 === 336.90247783999996), which
      // pathPaymentStrictSend's destMin then rejects outright.
      const destMin = (dto.amount * (1 - dto.slippage)).toFixed(7);

      return {
        swap: {
          id: swapTransaction.id,
          reference: swapTransaction.reference,
          fromAmount: swapTransaction.fromAmount,
          toAmount: swapTransaction.toAmount,
          exchangeRate: swapTransaction.exchangeRate,
          status: swapTransaction.status,
          createdAt: swapTransaction.createdAt,
        },
        offramp: {
          id: offrampTransaction.id,
          reference: offrampTransaction.reference,
          status: offrampTransaction.status,
        },
        recipientAddress,
        // Params for the frontend to build/sign a PathPaymentStrictSend
        swapParams: {
          sendAsset: {
            code: fromAsset.getCode(),
            issuer: fromAsset.getIssuer(),
          },
          sendAmount: dto.fromAmount.toString(),
          destAsset: {
            code: corridorAsset.getCode(),
            issuer: corridorAsset.getIssuer(),
          },
          destMin,
          destination: recipientAddress,
          memo,
          slippage: dto.slippage,
        },
      };
    } catch (error: any) {
      this.logger.error('Error initializing swap:', error.message);
      throw new BadRequestException(
        `Failed to initialize swap: ${error.message}`,
      );
    }
  }

  /**
   * Update swap transaction after frontend executes the swap.
   * Sanity-checks the reported hash against Horizon before trusting it.
   */
  async updateSwapAfterExecution(
    reference: string,
    transactionHash: string,
    sourceAddress: string,
  ): Promise<any> {
    try {
      const swapTransaction = await this.prisma.swapTransaction.findUnique({
        where: { reference },
      });

      if (!swapTransaction) {
        throw new BadRequestException('Swap transaction not found');
      }

      if (swapTransaction.status !== 'PENDING') {
        throw new BadRequestException(
          `Swap transaction is already ${swapTransaction.status}`,
        );
      }

      const verified =
        await this.stellarService.getTransactionByHash(transactionHash);
      if (verified && !verified.successful) {
        throw new BadRequestException(
          'Reported transaction was not successful on-chain',
        );
      }

      // If linked to an offramp, leave COMPLETED to the offramp webhook/memo
      // watcher. Otherwise (plain swap), this execution is the whole story.
      const hasOfframp = await this.prisma.offrampTransaction.findFirst({
        where: { swapId: swapTransaction.id },
      });

      const newStatus = hasOfframp ? 'PROCESSING' : 'COMPLETED';
      const completedAt = hasOfframp ? null : new Date();

      const updatedSwap = await this.prisma.swapTransaction.update({
        where: { reference },
        data: {
          transactionHash,
          sourceAddress,
          status: newStatus,
          completedAt,
        },
      });

      await this.prisma.transactionLog.create({
        data: {
          transactionType: 'swap',
          transactionId: swapTransaction.id,
          userId: swapTransaction.userId,
          action: 'status_changed',
          oldStatus: 'PENDING',
          newStatus: newStatus,
          description: `Swap transaction executed on-chain: ${transactionHash}`,
        },
      });

      return updatedSwap;
    } catch (error: any) {
      this.logger.error('Error updating swap after execution:', error.message);
      throw new BadRequestException(`Failed to update swap: ${error.message}`);
    }
  }

  /**
   * Create a simple swap transaction (just store in database).
   * Used for frontend-initiated swaps where execution happens on-chain,
   * self-to-self (source === destination), so no memo is needed.
   */
  async createSimpleSwap(
    userId: string,
    dto: CreateSimpleSwapDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<any> {
    try {
      const fromToken = dto.fromTokenType.toUpperCase();
      const toToken = dto.toTokenType.toUpperCase();
      // Validates against the corridor registry (plus the fixed USDC hub) —
      // throws NotFoundException for anything not USDC and not a known
      // corridor's stablecoin code.
      await this.resolveAsset(fromToken);
      await this.resolveAsset(toToken);
      if (fromToken === toToken) {
        throw new BadRequestException(
          'fromTokenType and toTokenType must be different',
        );
      }

      // The $100 floor exists for corridor stablecoins (meant to represent
      // meaningful real-world fiat amounts); it doesn't make sense for
      // hub-like assets — XLM trades well under $1/unit, and BRIDGE_USDC
      // (like USDC) is already dollar-denominated.
      if (!HUB_ASSET_CODES.has(fromToken) && dto.fromAmount < 100) {
        throw new BadRequestException(
          `Minimum amount for ${fromToken} to ${toToken} swap is 100 ${fromToken}`,
        );
      } else if (!HUB_ASSET_CODES.has(toToken) && dto.toAmount < 100) {
        throw new BadRequestException(
          `Minimum amount for ${fromToken} to ${toToken} swap is 100 ${toToken}`,
        );
      }

      const reference = generateTrxReference();
      const fromAmountDecimal = dto.fromAmount.toString();
      const toAmountDecimal = dto.toAmount.toString();

      const swapTransaction = await this.prisma.swapTransaction.create({
        data: {
          userId,
          reference,
          fromTokenType: dto.fromTokenType.toUpperCase(),
          fromAmount: fromAmountDecimal,
          fromNetwork: 'stellar',
          toTokenType: dto.toTokenType.toUpperCase(),
          toAmount: toAmountDecimal,
          toNetwork: 'stellar',
          exchangeRate: dto.exchangeRate.toString(),
          sourceAddress: dto.sourceAddress,
          destinationAddress: dto.destinationAddress,
          status: 'PENDING',
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });

      await this.prisma.transactionLog.create({
        data: {
          transactionType: 'swap',
          transactionId: swapTransaction.id,
          userId,
          action: 'created',
          newStatus: 'PENDING',
          description:
            'Simple swap transaction created (pending on-chain execution)',
        },
      });

      this.logger.log(
        `Simple swap transaction ${reference} created for user ${userId}`,
      );

      return {
        id: swapTransaction.id,
        reference: swapTransaction.reference,
        fromTokenType: swapTransaction.fromTokenType,
        fromAmount: dto.fromAmount,
        toTokenType: swapTransaction.toTokenType,
        toAmount: dto.toAmount,
        exchangeRate: dto.exchangeRate,
        sourceAddress: swapTransaction.sourceAddress,
        destinationAddress: swapTransaction.destinationAddress,
        status: swapTransaction.status,
        network: swapTransaction.fromNetwork,
        createdAt: swapTransaction.createdAt,
      };
    } catch (error: any) {
      this.logger.error('Error creating simple swap:', error.message);
      throw new BadRequestException(`Failed to create swap: ${error.message}`);
    }
  }
}
