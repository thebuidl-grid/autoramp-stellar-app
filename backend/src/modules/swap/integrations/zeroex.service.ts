import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ADDRESSES, TOKENS } from '../config/constant';

@Injectable()
export class ZeroExService {
  private readonly logger = new Logger(ZeroExService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.0x.org/swap/allowance-holder';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.configService.get<string>('ZERO_EX_API_KEY') || '';
  }

  /**
   * Get price for a token swap
   * @param sellToken - Token to sell (address)
   * @param buyToken - Token to buy (address)
   * @param sellAmount - Amount to sell in base units
   * @param chainId - Chain ID (default 8453 for Base)
   */
  async getPrice(
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    chainId: string = '8453',
    takerAddress?: string,
  ) {
    if (!this.apiKey) {
      this.logger.warn('ZERO_EX_API_KEY is not configured');
    }

    const taker =
      takerAddress ||
      this.configService.get<string>('ZERO_EX_TAKER_ADDRESS') ||
      '0x17CDB2a01e7a34CbB3DD4b83260B05d0274C8dab';

    const params = {
      chainId,
      sellToken,
      buyToken,
      sellAmount,
      taker,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/price`, {
          params,
          headers: {
            '0x-api-key': this.apiKey,
            '0x-version': 'v2',
          },
        }),
      );

      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data;
      this.logger.error(
        `0x API Error: ${error.message}`,
        errorData ? JSON.stringify(errorData) : '',
      );
      throw new BadRequestException(
        errorData?.reason || 'Failed to fetch price from 0x',
      );
    }
  }

  /**
   * Get quote for a token swap
   * @param sellToken - Token to sell (address)
   * @param buyToken - Token to buy (address)
   * @param sellAmount - Amount to sell in base units
   * @param chainId - Chain ID (default 8453 for Base)
   * @param takerAddress - The address of the user who will fill the quote
   */
  async getQuote(
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    chainId: string = '8453',
    takerAddress: string,
  ) {
    if (!this.apiKey) {
      this.logger.warn('ZERO_EX_API_KEY is not configured');
    }

    if (!takerAddress) {
      throw new BadRequestException('takerAddress is required for a quote');
    }

    const params = {
      chainId,
      sellToken,
      buyToken,
      sellAmount,
      taker: takerAddress,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/quote`, {
          params,
          headers: {
            '0x-api-key': this.apiKey,
            '0x-version': 'v2',
            '0x-client-id': 'cngn-admin-dashboard',
          },
        }),
      );

      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data;
      this.logger.error(
        `0x API Error: ${error.message}`,
        errorData ? JSON.stringify(errorData) : '',
      );
      throw new BadRequestException(
        errorData?.reason || 'Failed to fetch quote from 0x',
      );
    }
  }

  /**
   * Get USD/NGN rate with 2 NGN markup
   * Uses 0x to get the quote for 1 USDC -> CNGN
   */
  async getOtcRate(
    tokenSymbol: string = 'USDC',
    takerAddress?: string,
  ): Promise<{
    rate: number;
  }> {
    const buyTokenInfo = TOKENS[tokenSymbol.toUpperCase()];
    if (!buyTokenInfo) {
      throw new BadRequestException(`Unsupported token: ${tokenSymbol}`);
    }

    const sellToken = ADDRESSES.CNGN;
    const buyToken = buyTokenInfo.address;

    // Quote based on 10,000 NGN to get a solid market rate
    const testSellAmountNgn = 10000;
    const sellAmount = (testSellAmountNgn * 10 ** 6).toString(); // CNGN has 6 decimals

    const result = await this.getPrice(
      sellToken,
      buyToken,
      sellAmount,
      '8453',
      takerAddress,
    );

    const buyAmountHuman =
      Number(result.buyAmount) / 10 ** buyTokenInfo.decimals;

    const marketRate = testSellAmountNgn / buyAmountHuman;
    const markup = 2; // 2 NGN per dollar
    const rate = marketRate + markup;

    return {
      rate,
    };
  }
}
