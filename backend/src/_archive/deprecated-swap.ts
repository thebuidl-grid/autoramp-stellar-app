import { BadRequestException } from '@nestjs/common';
import { ethers } from 'ethers';
import { ADDRESSES, TOKENS } from '../modules/swap/config/constant';

/**
 * DEPRECATED swap implementation from SwapService
 * @deprecated Use initializeSwap instead
 */
/*
  async swap(
    userId: string,
    dto: CreateSwapDto,
    ipAddress?: string,
    userAgent?: string,
    merchantId?: string,
    merchantApiKeyId?: string,
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
      const toAmountDecimal = parseFloat(
        ethers.formatUnits(toAmount, toDecimals),
      );
      const exchangeRate = toAmountDecimal / fromAmountDecimal;

      // Create swap transaction record in database (PENDING status)
      let swapTransaction: any;
      if (merchantId) {
        swapTransaction = await this.prisma.merchantSwapTransaction.create({
          data: {
            merchantId,
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

        // Create merchant api request log
        try {
          await this.prisma.merchantApiRequestLog.create({
            data: {
              merchantApiKeyId: merchantApiKeyId || null,
              merchantId: merchantId || null,
              method: 'POST',
              path: '/swap',
              statusCode: 201,
              ipAddress: ipAddress || null,
              userAgent: userAgent || null,
              requestBody: dto as any,
              responseBody: {
                id: swapTransaction.id,
                reference: swapTransaction.reference,
              },
              errorMessage: null,
            },
          });
        } catch (logErr) {
          this.logger.error(
            'Failed to write merchant_api_request_log for swap',
            logErr,
          );
        }
      } else {
        swapTransaction = await this.prisma.swapTransaction.create({
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
      }

      // Execute swap using exactInputSingle
      const swapParams = {
        tokenIn,
        tokenOut,
        amountIn: dto.amount.toString(),
        recipient: dto.recipient,
        slippageTolerance: dto.slippage,
      };

      this.logger.log(
        `Executing swap transaction ${reference} for user ${userId}`,
      );
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
          const offrampResult = await this.rampService.offRamp(
            merchantId || userId,
            '',
            merchantId ? true : false,
            false, // isOtcEnabled placeholder
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

            this.logger.log(`Offramp transaction linked to swap ${reference}`);
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
*/
