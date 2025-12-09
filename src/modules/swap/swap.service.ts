import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeSwapperFromPrivateKey } from './integrations/swapper';
import { ADDRESSES } from './config/constant';

@Injectable()
export class SwapService {
  private readonly logger = new Logger(SwapService.name);
  private readonly rpcUrl?: string;
  private readonly privateKey?: string;
  private readonly swapper: any;

  constructor(private configService: ConfigService) {
    this.rpcUrl = this.configService.get<string>('RPC_URL');
    if (!this.rpcUrl) {
      throw new BadRequestException('RPC_URL is required in config');
    }

    this.privateKey = this.configService.get<string>('WALLET_PRIVATE_KEY');
    if (!this.privateKey) {
      throw new BadRequestException(
        'WALLET_PRIVATE_KEY is required in config',
      );
    }

    this.swapper = initializeSwapperFromPrivateKey(
      this.rpcUrl,
      this.privateKey,
    );
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

  async swap({
    amount,
    recipient,
    to_cngn,
    slippage,
  }: {
    amount: number;
    recipient: string;
    to_cngn: boolean;
    slippage: number;
  }): Promise<any> {
    try {
      const payload = {
        amountIn: amount.toString(), // Ensure string for parseUnits if needed
        recipient,
        tokenIn: to_cngn ? ADDRESSES.USDC : ADDRESSES.CNGN,
        tokenOut: to_cngn ? ADDRESSES.CNGN : ADDRESSES.USDC,
        slippageTolerance: slippage,
      };
      return await this.swapper.swap(payload);
    } catch (error: any) {
      this.logger.error('Error executing swap:', error.message);
      throw new BadRequestException(`Swap failed: ${error.message}`);
    }
  }
}
