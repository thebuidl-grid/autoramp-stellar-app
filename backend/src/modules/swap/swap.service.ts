import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../database/prisma.service';
import { StablestackService } from '../stablestack/stablestack.service';
import { ADDRESSES, TOKENS } from './config/constant';
import { CreateSwapDto } from './dto/create-swap.dto';
import { InitializeSwapDto } from './dto/initialize-swap.dto';
import { CreateSimpleSwapDto } from './dto/create-simple-swap.dto';
import { generateTrxReference } from '../../utils/reference.util';
import { ethers } from 'ethers';

@Injectable()
export class SwapService {
  private readonly logger = new Logger(SwapService.name);
  private readonly rpcUrl?: string;
  private readonly swapper: any;

  // Cache for USD/NGN rate (respects 1 request/minute limit)
  private usdNgnRateCache: { rate: number; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute in milliseconds
  // constant for Quoter ABI
  private readonly QUOTER_ABI = [
    'function quoteExactInputSingle(address,address,uint24,uint256,uint160) returns (uint256)',
  ];

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private stablestackService: StablestackService,
    private httpService: HttpService,
  ) {
    this.rpcUrl = this.configService.get<string>('RPC_URL');
    if (!this.rpcUrl) {
      throw new BadRequestException('RPC_URL is required in config');
    }
    // Initialize swapper/provider/contract stuff here if needed or lazily in methods
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
   * Get USD/NGN rate from Aerodrome Quoter (On-chain) using USDC -> CNGN pool
   * Now fetches real-time on-chain data instead of cached MonieRate API
   * @returns rate (How many CNGN for 1 USDC)
   */
  async getUsdNgnRate(): Promise<number> {
    try {
      // 1. Setup Provider
      const provider = new ethers.JsonRpcProvider(this.rpcUrl);

      // 2. Setup Quoter Contract
      const quoterAddress = ADDRESSES.AERODROME.QUOTER; // Ensure this is 0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0 
      const quoter = new ethers.Contract(quoterAddress, this.QUOTER_ABI, provider);

      // 3. Prepare quote params
      // We want to know how much CNGN we get for 1 USDC
      const amountIn = ethers.parseUnits('1', 6); // 1 USDC (6 decimals)
      const tokenIn = ADDRESSES.USDC;
      const tokenOut = ADDRESSES.CNGN;
      const fee = 100; // 0.01% -> 100 ticks?  Wait, user snippet said 10. Let's start with 10 as user suggested or check constant. User used 10 in snippet. 
      // Actually, Aerodrome pools often have very low fees for stable pairs. 
      // The snippet used 10 (0.001%?). Let's stick to the snippet for now or make it configurable/constant.
      // Standard Uniswap V3 fees: 100 (0.01%), 500 (0.05%), 3000 (0.3%), 10000 (1%)
      // Aerodrome might differ. User snippet had 10.
      const feeTier = 10;
      const sqrtPriceLimitX96 = 0;

      this.logger.debug(`Fetching on-chain rate for 1 USDC -> CNGN`);

      // 4. Call static quote
      const amountOut = await quoter.quoteExactInputSingle.staticCall(
        tokenIn,
        tokenOut,
        feeTier,
        amountIn,
        sqrtPriceLimitX96
      );

      // 5. Format result
      // CNGN has 6 decimals
      const rate = parseFloat(ethers.formatUnits(amountOut, 6));

      this.logger.debug(`On-chain USDC/CNGN Rate: ${rate}`);

      if (!rate || rate <= 0) {
        throw new Error('Invalid rate returned from Quoter');
      }

      return rate;
    } catch (error: any) {
      this.logger.error('Error fetching on-chain rate:', error);
      // Fallback or rethrow? 
      // For now, rethrow as this is critical
      throw new BadRequestException(
        `Failed to fetch on-chain rate: ${error.message}`,
      );
    }
  }

  /**
   * Calculate estimated NGN value from CNGN amount
   * Uses USD/NGN rate from MonieRate API
   * Since CNGN = NGN (1:1 peg), we just multiply CNGN amount by USD/NGN rate
   * @param cngnAmount - Amount in CNGN
   * @returns Object with estimatedNgn, usdNgnRate, and usdValue
   */
  async calculateEstimatedNgn(cngnAmount: number): Promise<{ estimatedNgn: number; usdNgnRate: number; usdValue: number }> {
    try {
      // Get USD/NGN rate from MonieRate API (e.g., 1619.01 means 1 USD = 1619.01 NGN)
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
    dto: InitializeSwapDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<any> {
    try {
      // Step 1: Initialize offramp to get recipient wallet address
      const offrampResult = await this.stablestackService.offRamp(
        userId,
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
        throw new BadRequestException('Failed to initialize offramp transaction');
      }

      // Extract recipient address from offramp response
      // The address is at data.depositAddress, not data.depositAccount.address
      const recipientAddress = offrampResult?.data?.depositAddress || offrampResult?.data?.depositAccount?.address;

      if (!recipientAddress) {
        this.logger.error('Offramp response structure:', JSON.stringify(offrampResult, null, 2));
        throw new BadRequestException('Recipient address not found in offramp response');
      }

      // Step 2: Prepare swap transaction data
      // Note: Quote is not fetched here - actual amounts will be determined when the swap executes on-chain
      const fromTokenType = 'USDC';
      const toTokenType = 'CNGN';
      const fromAmountDecimal = dto.usdcAmount;

      // Placeholder values - will be updated when swap is completed
      // Using 1:1 exchange rate as placeholder (actual rate determined on-chain)
      const toAmountDecimal = fromAmountDecimal; // Placeholder - actual CNGN amount determined on-chain
      const exchangeRate = 1; // Placeholder - actual rate determined on-chain

      // Step 3: Create swap transaction record with same reference as offramp
      const swapTransaction = await this.prisma.swapTransaction.create({
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

      // Link swap to offramp
      await this.prisma.offrampTransaction.update({
        where: { id: offrampTransaction.id },
        data: {
          swapId: swapTransaction.id,
        },
      });

      // Create transaction log
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
      throw new BadRequestException(`Failed to initialize swap: ${error.message}`);
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

      // Check if this swap is linked to an offramp transaction
      // If linked to offramp, set to PROCESSING (offramp will complete it)
      // Otherwise, set to COMPLETED (simple swap, no offramp)
      const hasOfframp = await this.prisma.offrampTransaction.findFirst({
        where: { swapId: swapTransaction.id },
      });

      const newStatus = hasOfframp ? 'PROCESSING' : 'COMPLETED';
      const completedAt = hasOfframp ? null : new Date();

      const updatedSwap = await this.prisma.swapTransaction.update({
        where: { reference },
        data: {
          transactionHash,
          sourceAddress, // User's wallet address
          status: newStatus,
          completedAt,
        },
      });

      // Create transaction log
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

      return updatedSwap;
    } catch (error: any) {
      this.logger.error('Error updating swap after execution:', error.message);
      throw new BadRequestException(
        `Failed to update swap: ${error.message}`,
      );
    }
  }

  /**
   * Execute a swap transaction using exactInputSingle (DEPRECATED - use initializeSwap instead)
   * Stores the swap transaction in the database
   * If offrampDestination is provided, triggers offramp after swap completes
   * 
   * @param userId - User ID from authenticated request
   * @param dto - Swap transaction data
   * @param ipAddress - Client IP address (optional)
   * @param userAgent - Client user agent (optional)
   * @returns Swap transaction data with database record
   * @deprecated Use initializeSwap instead
   */
  async swap(
    userId: string,
    dto: CreateSwapDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<any> {
    try {
      // Generate unique reference
      const reference = generateTrxReference();

      // Determine token addresses
      const tokenIn = dto.to_cngn ? ADDRESSES.USDC : ADDRESSES.CNGN;
      const tokenOut = dto.to_cngn ? ADDRESSES.CNGN : ADDRESSES.USDC;
      const fromTokenType = dto.to_cngn ? 'USDC' : 'CNGN';
      const toTokenType = dto.to_cngn ? 'CNGN' : 'USDC';

      // Get token decimals
      const fromTokenInfo = dto.to_cngn ? TOKENS.USDC : TOKENS.CNGN;
      const toTokenInfo = dto.to_cngn ? TOKENS.CNGN : TOKENS.USDC;
      const fromDecimals = fromTokenInfo?.decimals ?? 6;
      const toDecimals = toTokenInfo?.decimals ?? 6;

      // Parse amounts
      const fromAmount = ethers.parseUnits(dto.amount.toString(), fromDecimals);
      const fromAmountDecimal = dto.amount;

      // Get quote to estimate output amount
      const quote = await this.swapper.getQuote({
        tokenIn,
        tokenOut,
        amountIn: dto.amount.toString(),
        recipient: dto.recipient,
        slippageTolerance: dto.slippage,
      });

      const toAmount = quote.amountOut;
      const toAmountDecimal = parseFloat(ethers.formatUnits(toAmount, toDecimals));
      const exchangeRate = toAmountDecimal / fromAmountDecimal;

      // Create swap transaction record in database (PENDING status)
      const swapTransaction = await this.prisma.swapTransaction.create({
        data: {
          userId,
          reference,
          fromTokenType,
          fromAmount: fromAmountDecimal,
          fromNetwork: dto.network || 'base',
          toTokenType,
          toAmount: toAmountDecimal,
          toNetwork: dto.network || 'base',
          exchangeRate,
          sourceAddress: dto.recipient, // Source is the wallet executing the swap (service wallet)
          destinationAddress: dto.recipient,
          status: 'PENDING',
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });

      // Create transaction log
      await this.prisma.transactionLog.create({
        data: {
          transactionType: 'swap',
          transactionId: swapTransaction.id,
          userId,
          action: 'created',
          newStatus: 'PENDING',
          description: 'Swap transaction initialized',
        },
      });

      // Execute swap using exactInputSingle
      const swapParams = {
        tokenIn,
        tokenOut,
        amountIn: dto.amount.toString(),
        recipient: dto.recipient,
        slippageTolerance: dto.slippage,
      };

      this.logger.log(`Executing swap transaction ${reference} for user ${userId}`);
      const tx = await this.swapper.swapExactInputSingle(swapParams);

      // Wait for transaction confirmation
      this.logger.log(`Waiting for transaction confirmation: ${tx.hash}`);
      const receipt = await tx.wait();

      if (!receipt || receipt.status !== 1) {
        throw new Error('Swap transaction failed');
      }

      // Update swap transaction with hash and status
      const updatedSwap = await this.prisma.swapTransaction.update({
        where: { id: swapTransaction.id },
        data: {
          transactionHash: tx.hash,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      // Update transaction log
      await this.prisma.transactionLog.create({
        data: {
          transactionType: 'swap',
          transactionId: swapTransaction.id,
          userId,
          action: 'status_changed',
          oldStatus: 'PENDING',
          newStatus: 'COMPLETED',
          description: 'Swap transaction completed successfully',
        },
      });

      this.logger.log(`Swap transaction ${reference} completed successfully`);

      // If offramp destination is provided, trigger offramp
      if (dto.offrampDestination && dto.to_cngn) {
        this.logger.log(`Triggering offramp for swap ${reference}`);

        try {
          const offrampResult = await this.stablestackService.offRamp(
            userId,
            {
              type: 'off',
              network: dto.network || 'base',
              amount: toAmountDecimal, // Use the CNGN amount received from swap
              destination: {
                bankCode: dto.offrampDestination.bankCode,
                accountNumber: dto.offrampDestination.accountNumber,
              },
            },
            ipAddress,
            userAgent,
          );

          // Link offramp transaction to swap transaction
          if (offrampResult?.databaseRecord?.id) {
            await this.prisma.offrampTransaction.update({
              where: { id: offrampResult.databaseRecord.id },
              data: {
                swapId: swapTransaction.id,
              },
            });

            this.logger.log(
              `Offramp transaction linked to swap ${reference}`,
            );
          }

          return {
            swap: {
              id: updatedSwap.id,
              reference: updatedSwap.reference,
              transactionHash: updatedSwap.transactionHash,
              status: updatedSwap.status,
              fromAmount: updatedSwap.fromAmount,
              toAmount: updatedSwap.toAmount,
              createdAt: updatedSwap.createdAt,
              completedAt: updatedSwap.completedAt,
            },
            offramp: offrampResult,
          };
        } catch (offrampError: any) {
          this.logger.error(
            `Failed to trigger offramp after swap: ${offrampError.message}`,
          );
          // Return swap result even if offramp fails
          return {
            swap: {
              id: updatedSwap.id,
              reference: updatedSwap.reference,
              transactionHash: updatedSwap.transactionHash,
              status: updatedSwap.status,
              fromAmount: updatedSwap.fromAmount,
              toAmount: updatedSwap.toAmount,
              createdAt: updatedSwap.createdAt,
              completedAt: updatedSwap.completedAt,
            },
            offrampError: offrampError.message,
          };
        }
      }

      return {
        id: updatedSwap.id,
        reference: updatedSwap.reference,
        transactionHash: updatedSwap.transactionHash,
        status: updatedSwap.status,
        fromAmount: updatedSwap.fromAmount,
        toAmount: updatedSwap.toAmount,
        createdAt: updatedSwap.createdAt,
        completedAt: updatedSwap.completedAt,
      };
    } catch (error: any) {
      this.logger.error('Error executing swap:', error.message);
      throw new BadRequestException(`Swap failed: ${error.message}`);
    }
  }

  /**
   * Create a simple swap transaction (just store in database)
   * Used for frontend-initiated swaps where execution happens on-chain
   */
  async createSimpleSwap(
    userId: string,
    dto: CreateSimpleSwapDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<any> {
    try {
      if (!['USDC', 'CNGN'].includes(dto.fromTokenType.toUpperCase())) {
        throw new BadRequestException('fromTokenType must be USDC or CNGN');
      }
      if (!['USDC', 'CNGN'].includes(dto.toTokenType.toUpperCase())) {
        throw new BadRequestException('toTokenType must be USDC or CNGN');
      }
      if (dto.fromTokenType.toUpperCase() === dto.toTokenType.toUpperCase()) {
        throw new BadRequestException('fromTokenType and toTokenType must be different');
      }

      // Validate minimum amounts based on swap direction
      if (dto.fromTokenType.toUpperCase() === 'CNGN' && dto.toTokenType.toUpperCase() === 'USDC') {
        // CNGN to USDC: minimum 100
        if (dto.fromAmount < 100) {
          throw new BadRequestException('Minimum amount for CNGN to USDC swap is 100 CNGN');
        }
      } else if (dto.fromTokenType.toUpperCase() === 'USDC' && dto.toTokenType.toUpperCase() === 'CNGN') {
        // USDC to CNGN: minimum 1
        if (dto.fromAmount < 1) {
          throw new BadRequestException('Minimum amount for USDC to CNGN swap is 1 USDC');
        }
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

      await this.prisma.transactionLog.create({
        data: {
          transactionType: 'swap',
          transactionId: swapTransaction.id,
          userId,
          action: 'created',
          newStatus: 'PENDING',
          description: 'Simple swap transaction created (pending on-chain execution)',
        },
      });

      this.logger.log(`Simple swap transaction ${reference} created for user ${userId}`);

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
