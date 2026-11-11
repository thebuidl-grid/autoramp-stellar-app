import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { RampService } from '../ramp/ramp.service';
import { NotificationsService } from '../merchants/notifications/notifications.service';
import { ADDRESSES, TOKENS } from './config/constant';
import { InitializeSwapDto } from './dto/initialize-swap.dto';
import { CreateSimpleSwapDto } from './dto/create-simple-swap.dto';
import { generateTrxReference } from '../../utils/reference.util';
import { ethers } from 'ethers';
import { Swapper } from './integrations/swapper';

@Injectable()
export class SwapService {
  private readonly logger = new Logger(SwapService.name);
  private readonly rpcUrl?: string;
  private readonly swapper: any;

  // Cache for USD/NGN rate (respects 1 request/minute limit)
  private usdNgnRateCache: { rate: number; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute in milliseconds
  // If a fresh quote can't be fetched (RPC outage), serve the last good rate for up to this long.
  private readonly STALE_RATE_MAX_MS = 60 * 60 * 1000;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private rampService: RampService,
    private notificationsService: NotificationsService,
  ) {
    this.rpcUrl = this.configService.get<string>('RPC_URL');
    if (!this.rpcUrl) {
      throw new BadRequestException('RPC_URL is required in config');
    }

    // Initialize swapper for on-chain queries
    const provider = new ethers.JsonRpcProvider(this.rpcUrl);
    // Provide a random wallet for read-only Quoter tasks if explicit signer is needed
    const wallet = ethers.Wallet.createRandom().connect(provider);
    this.swapper = new Swapper(provider, wallet);
  }

  async getTokenBalance(
    token: string,
    address?: string,
  ): Promise<string | null> {
    try {
      return await this.swapper.getTokenBalance(token, address);
    } catch (error: any) {
      this.logger.error('Error fetching token balance:', error.message);
      throw new BadRequestException(
        `Failed to fetch balance: ${error.message}`,
      );
    }
  }

  async getTokenBalances(address?: string): Promise<Record<string, string>> {
    try {
      return await this.swapper.getTokenBalances(address);
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

      // Check if we have a valid cached rate (within 1 minute)
      if (
        this.usdNgnRateCache &&
        now - this.usdNgnRateCache.timestamp < this.CACHE_TTL_MS
      ) {
        this.logger.debug(
          `Using cached USD/NGN rate: ${this.usdNgnRateCache.rate}`,
        );
        return this.usdNgnRateCache.rate;
      }

      // Cache expired or doesn't exist - fetch new rate from on-chain
      this.logger.debug('Fetching USD/NGN rate from on-chain Swapper');

      const quote = await this.swapper.getQuote({
        tokenIn: ADDRESSES.USDC,
        tokenOut: ADDRESSES.CNGN,
        amountIn: '1', // 1 USDC
        slippageTolerance: 50, // 0.5%
      });

      // Convert from BigInt amountOut to decimal number
      const cngnDecimals = TOKENS.CNGN?.decimals ?? 18;
      const rate = parseFloat(
        ethers.formatUnits(quote.amountOut, cngnDecimals),
      );

      if (!rate || rate <= 0) {
        throw new Error('Invalid rate from Swapper quote');
      }

      // Cache the rate with current timestamp
      this.usdNgnRateCache = {
        rate,
        timestamp: now,
      };

      this.logger.debug(`Cached on-chain USD/NGN rate: ${rate}`);
      return rate;
    } catch (error: any) {
      this.logger.error(
        'Error fetching USD/NGN rate from on-chain:',
        error.message,
      );
      const cached = this.usdNgnRateCache;
      if (cached && Date.now() - cached.timestamp < this.STALE_RATE_MAX_MS) {
        this.logger.warn(
          `Serving stale USD/NGN rate ${cached.rate} (${Math.round((Date.now() - cached.timestamp) / 1000)}s old) because the live quote failed`,
        );
        return cached.rate;
      }
      throw new BadRequestException(
        `Failed to fetch USD/NGN rate: ${error.message}`,
      );
    }
  }

  /**
   * Calculate estimated NGN value from CNGN amount
   * Uses USD/NGN rate from on-chain Swapper
   * Since CNGN = NGN (1:1 peg), we just multiply CNGN amount by USD/NGN rate
   * @param cngnAmount - Amount in CNGN
   * @returns Object with estimatedNgn, usdNgnRate, and usdValue
   */
  async calculateEstimatedNgn(
    cngnAmount: number,
  ): Promise<{ estimatedNgn: number; usdNgnRate: number; usdValue: number }> {
    try {
      // Get USD/NGN rate from on-chain Swapper (e.g., 1619.01 means 1 USD = 1619.01 NGN)
      const usdNgnRate = await this.getUsdNgnRate();

      // Since CNGN = NGN (1:1), multiply CNGN amount by USD/NGN rate
      // Example: 100 CNGN * 1619.01 = 161,901 NGN
      const estimatedNgn = cngnAmount * usdNgnRate;

      // Calculate USD value: NGN / (USD/NGN rate)
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
   * Creates offramp first to get recipient wallet address, then creates swap record
   * Frontend will execute the swap using the returned recipient address
   *
   * @param userId - User ID from authenticated request
   * @param dto - Swap initialization data
   * @param ipAddress - Client IP address (optional)
   * @param userAgent - Client user agent (optional)
   * @returns Swap and offramp transaction data with recipient address
   */
  async initializeSwap(
    userId: string,
    isOtcEnabled: boolean,
    dto: InitializeSwapDto,
    ipAddress?: string,
    userAgent?: string,
    merchantId?: string,
    merchantApiKeyId?: string,
  ): Promise<any> {
    try {
      // Step 1: Initialize offramp to get recipient wallet address
      // If merchantId is provided, use merchant owner's user id for external API calls
      let actorUserId = userId;
      if (merchantId) {
        const merchant = await this.prisma.merchant.findUnique({
          where: { id: merchantId },
          include: { user: true },
        });
        if (!merchant || !merchant.user) {
          throw new BadRequestException('Merchant or merchant user not found');
        }
        actorUserId = merchant.user.id;
      }

      const offrampResult = await this.rampService.offRamp(
        merchantId || userId,
        '',
        merchantId ? true : false,
        isOtcEnabled,
        {
          type: 'off',
          network: dto.network || 'base',
          amount: dto.amount, // NGN amount (estimated NGN value from frontend)
          destination: {
            bankCode: dto.offrampDestination.bankCode,
            accountNumber: dto.offrampDestination.accountNumber,
          },
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

      // Extract recipient address from offramp response
      // The address is at data.depositAddress, not data.depositAccount.address
      const recipientAddress =
        offrampResult?.data?.depositAddress ||
        offrampResult?.data?.depositAccount?.address;

      if (!recipientAddress) {
        this.logger.error(
          'Offramp response structure:',
          JSON.stringify(offrampResult, null, 2),
        );
        throw new BadRequestException(
          'Recipient address not found in offramp response',
        );
      }

      // Step 2: Prepare swap transaction data
      // Note: Quote is not fetched here - actual amounts will be determined when the swap executes on-chain
      const fromTokenType = 'USDC';
      const toTokenType = 'CNGN';
      const fromAmountDecimal = dto.usdcAmount;

      // Use estimated NGN amount from frontend as the expected output amount
      const toAmountDecimal = dto.amount;

      // Calculate estimated exchange rate (NGN / USDC)
      // explicit check to avoid division by zero, though DTO validation should prevent it
      const exchangeRate = dto.usdcAmount > 0 ? dto.amount / dto.usdcAmount : 0;

      // Step 3: Create swap transaction record with same reference as offramp
      let swapTransaction: any = null;
      if (merchantId) {
        swapTransaction = await this.prisma.merchantSwapTransaction.create({
          data: {
            merchantId,
            reference: offrampTransaction.reference,
            fromTokenType,
            fromAmount: fromAmountDecimal,
            fromNetwork: dto.network || 'base',
            toTokenType,
            toAmount: toAmountDecimal,
            toNetwork: dto.network || 'base',
            exchangeRate,
            sourceAddress: '',
            destinationAddress: recipientAddress,
            status: 'PENDING',
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
          },
        });
      } else {
        swapTransaction = await this.prisma.swapTransaction.create({
          data: {
            userId,
            reference: offrampTransaction.reference, // Same reference as offramp
            fromTokenType,
            fromAmount: fromAmountDecimal,
            fromNetwork: dto.network || 'base',
            toTokenType,
            toAmount: toAmountDecimal,
            toNetwork: dto.network || 'base',
            exchangeRate,
            sourceAddress: '', // Will be set when user executes swap from frontend
            destinationAddress: recipientAddress, // Offramp recipient address
            status: 'PENDING',
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
          },
        });
      }

      // Link swap to offramp
      // For user-level offramp, link swapId on OfframpTransaction
      try {
        if (!merchantId) {
          await this.prisma.offrampTransaction.update({
            where: { id: offrampTransaction.id },
            data: {
              swapId: swapTransaction.id,
            },
          });
        } else {
          // Create a merchant-level offramp record to mirror the offramp
          const depositAccount = offrampResult?.data?.depositAccount || {};
          await this.prisma.merchantOfframpTransaction.create({
            data: {
              merchantId,
              reference: offrampTransaction.reference,
              amount: dto.amount,
              currency: 'NGN',
              tokenType: 'CNGN',
              status: offrampTransaction.status || 'PENDING',
              bankCode: dto.offrampDestination.bankCode,
              accountNumber: dto.offrampDestination.accountNumber,
              accountName: depositAccount?.accountName || null,
              bankName: depositAccount?.bankName || null,
              network: dto.network || null,
              notifyUrl: null,
              ipAddress: ipAddress || null,
              userAgent: userAgent || null,
            },
          });
        }
      } catch (e) {
        this.logger.error(
          'Failed linking offramp to swap or creating merchant offramp record',
          e,
        );
      }

      // Create transaction log
      // Create transaction log for user swaps
      if (!merchantId) {
        await this.prisma.transactionLog.create({
          data: {
            transactionType: 'swap',
            transactionId: swapTransaction.id,
            userId,
            action: 'created',
            newStatus: 'PENDING',
            description:
              'Swap transaction initialized (pending user execution)',
          },
        });
      } else {
        // For merchant flows, create a merchant API request log
        try {
          await this.prisma.merchantApiRequestLog.create({
            data: {
              merchantApiKeyId: merchantApiKeyId || null,
              merchantId: merchantId || null,
              method: 'POST',
              path: '/swap/initialize',
              statusCode: 201,
              ipAddress: ipAddress || null,
              userAgent: userAgent || null,
              requestBody: dto as any,
              responseBody: {
                swapId: swapTransaction.id,
                reference: swapTransaction.reference,
              },
              errorMessage: null,
            },
          });
        } catch (logErr) {
          this.logger.error(
            'Failed to write merchant_api_request_log for initializeSwap',
            logErr,
          );
        }
      }

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
        // Return recipient address for frontend to use in swap
        recipientAddress,
        // Return swap parameters for frontend
        swapParams: {
          tokenIn: ADDRESSES.USDC,
          tokenOut: ADDRESSES.CNGN,
          amountIn: dto.usdcAmount.toString(),
          recipient: recipientAddress,
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
   * Update swap transaction after frontend executes the swap
   * Called when user successfully executes the swap transaction
   *
   * @param reference - Swap transaction reference
   * @param transactionHash - Blockchain transaction hash
   * @param sourceAddress - User's wallet address that executed the swap
   * @returns Updated swap transaction
   */
  async updateSwapAfterExecution(
    reference: string,
    transactionHash: string,
    sourceAddress: string,
    merchantId?: string,
    merchantApiKeyId?: string,
  ): Promise<any> {
    try {
      let swapTransaction: any = null;
      if (merchantId) {
        swapTransaction = await this.prisma.merchantSwapTransaction.findUnique({
          where: { reference },
        });
      } else {
        swapTransaction = await this.prisma.swapTransaction.findUnique({
          where: { reference },
        });
      }

      if (!swapTransaction) {
        throw new BadRequestException('Swap transaction not found');
      }

      if (swapTransaction.status !== 'PENDING') {
        throw new BadRequestException(
          `Swap transaction is already ${swapTransaction.status}`,
        );
      }

      // Check if this swap is linked to an offramp transaction
      // If linked to offramp, set to PROCESSING (offramp will complete it)
      // Otherwise, set to COMPLETED (simple swap, no offramp)
      let hasOfframp: any = null;
      if (merchantId) {
        hasOfframp = await this.prisma.merchantOfframpTransaction.findFirst({
          where: { reference },
        });
      } else {
        hasOfframp = await this.prisma.offrampTransaction.findFirst({
          where: { swapId: swapTransaction.id },
        });
      }

      const newStatus = hasOfframp ? 'PROCESSING' : 'COMPLETED';
      const completedAt = hasOfframp ? null : new Date();

      let updatedSwap: any;
      if (merchantId) {
        updatedSwap = await this.prisma.merchantSwapTransaction.update({
          where: { reference },
          data: {
            transactionHash,
            sourceAddress,
            status: newStatus,
            completedAt,
          },
        });
        await this.notificationsService.notifyMerchant(
          merchantId,
          'swap.updated',
          updatedSwap,
        );
      } else {
        updatedSwap = await this.prisma.swapTransaction.update({
          where: { reference },
          data: {
            transactionHash,
            sourceAddress, // User's wallet address
            status: newStatus,
            completedAt,
          },
        });
      }

      // Create transaction log
      if (!merchantId) {
        await this.prisma.transactionLog.create({
          data: {
            transactionType: 'swap',
            transactionId: swapTransaction.id,
            userId: swapTransaction.userId,
            action: 'status_changed',
            oldStatus: 'PENDING',
            newStatus: newStatus,
            description: `Swap transaction executed on blockchain: ${transactionHash}`,
          },
        });
      } else {
        // Optionally create merchant api request log for execution
        try {
          await this.prisma.merchantApiRequestLog.create({
            data: {
              merchantApiKeyId: merchantApiKeyId || null,
              merchantId: merchantId || null,
              method: 'POST',
              path: '/swap/:reference/complete',
              statusCode: 200,
              ipAddress: null,
              userAgent: null,
              requestBody: { transactionHash, sourceAddress },
              responseBody: updatedSwap,
              errorMessage: null,
            },
          });
        } catch (logErr) {
          this.logger.error(
            'Failed to write merchant_api_request_log for updateSwapAfterExecution',
            logErr,
          );
        }
      }

      return updatedSwap;
    } catch (error: any) {
      this.logger.error('Error updating swap after execution:', error.message);
      throw new BadRequestException(`Failed to update swap: ${error.message}`);
    }
  }

  /**
   * Create a simple swap transaction (just store in database)
   * Used for frontend-initiated swaps where execution happens on-chain
   */
  async createSimpleSwap(
    dto: CreateSimpleSwapDto,
    merchantId?: string,
    merchantApiKeyId?: string,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<any> {
    try {
      if (!TOKENS[dto.fromTokenType.toUpperCase()]) {
        throw new BadRequestException(
          `fromTokenType must be ${Object.keys(TOKENS).join(', ')}`,
        );
      }
      if (!TOKENS[dto.toTokenType.toUpperCase()]) {
        throw new BadRequestException(
          `toTokenType must be ${Object.keys(TOKENS).join(', ')}`,
        );
      }
      if (dto.fromTokenType.toUpperCase() === dto.toTokenType.toUpperCase()) {
        throw new BadRequestException(
          'fromTokenType and toTokenType must be different',
        );
      }

      // if (dto.fromAmount < 100 || dto.toAmount < 100) {
      //   throw new BadRequestException(
      //     `Minimum amount for ${dto.fromTokenType.toUpperCase()} to ${dto.toTokenType.toUpperCase()} swap is 100 ${dto.fromTokenType.toUpperCase()}`,
      //   );
      // }

      const reference = generateTrxReference(16, 'swp');
      const fromAmountDecimal = dto.fromAmount.toString();
      const toAmountDecimal = dto.toAmount.toString();
      if (merchantId) {
        const merchantSwapTransaction =
          await this.prisma.merchantSwapTransaction.create({
            data: {
              merchantId,
              reference,
              fromTokenType: dto.fromTokenType.toUpperCase(),
              fromAmount: fromAmountDecimal,
              fromNetwork: dto.network || 'base',
              toTokenType: dto.toTokenType.toUpperCase(),
              toAmount: toAmountDecimal,
              toNetwork: dto.network || 'base',
              exchangeRate: dto.exchangeRate.toString(),
              sourceAddress: dto.sourceAddress,
              destinationAddress: dto.destinationAddress,
              status: 'PENDING',
              ipAddress: ipAddress || null,
              userAgent: userAgent || null,
            },
          });

        this.logger.log(
          `Simple swap transaction ${reference} created for merchant ${merchantId}`,
        );

        // Log merchant API request
        try {
          await this.prisma.merchantApiRequestLog.create({
            data: {
              merchantApiKeyId: merchantApiKeyId || null,
              merchantId,
              method: 'POST',
              path: '/swap/create',
              statusCode: 201,
              ipAddress: ipAddress || null,
              userAgent: userAgent || null,
              requestBody: dto as any,
              responseBody: {
                id: merchantSwapTransaction.id,
                reference: merchantSwapTransaction.reference,
              },
              errorMessage: null,
            },
          });
        } catch (logErr) {
          this.logger.error(
            'Failed to write merchant_api_request_log:',
            logErr,
          );
        }

        return {
          id: merchantSwapTransaction.id,
          reference: merchantSwapTransaction.reference,
          fromTokenType: merchantSwapTransaction.fromTokenType,
          fromAmount: dto.fromAmount,
          toTokenType: merchantSwapTransaction.toTokenType,
          toAmount: dto.toAmount,
          exchangeRate: dto.exchangeRate,
          sourceAddress: merchantSwapTransaction.sourceAddress,
          destinationAddress: merchantSwapTransaction.destinationAddress,
          status: merchantSwapTransaction.status,
          network: merchantSwapTransaction.fromNetwork,
          createdAt: merchantSwapTransaction.createdAt,
        };
      }
      if (userId) {
        const userSwapTransaction = await this.prisma.swapTransaction.create({
          data: {
            userId,
            reference,
            fromTokenType: dto.fromTokenType.toUpperCase(),
            fromAmount: fromAmountDecimal,
            fromNetwork: dto.network || 'base',
            toTokenType: dto.toTokenType.toUpperCase(),
            toAmount: toAmountDecimal,
            toNetwork: dto.network || 'base',
            exchangeRate: dto.exchangeRate.toString(),
            sourceAddress: dto.sourceAddress,
            destinationAddress: dto.destinationAddress,
            status: 'PENDING',
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
          },
        });

        if (userSwapTransaction) {
          await this.prisma.transactionLog.create({
            data: {
              transactionType: 'swap',
              transactionId: userSwapTransaction.id,
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
            id: userSwapTransaction.id,
            reference: userSwapTransaction.reference,
            fromTokenType: userSwapTransaction.fromTokenType,
            fromAmount: dto.fromAmount,
            toTokenType: userSwapTransaction.toTokenType,
            toAmount: dto.toAmount,
            exchangeRate: dto.exchangeRate,
            sourceAddress: userSwapTransaction.sourceAddress,
            destinationAddress: userSwapTransaction.destinationAddress,
            status: userSwapTransaction.status,
            network: userSwapTransaction.fromNetwork,
            createdAt: userSwapTransaction.createdAt,
          };
        }
      }
    } catch (error: any) {
      this.logger.error('Error creating simple swap:', error.message);
      throw new BadRequestException(`Failed to create swap: ${error.message}`);
    }
  }
}
