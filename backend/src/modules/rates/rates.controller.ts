import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiSecurity,
} from '@nestjs/swagger';
import {
  ChainRateService,
  RATE_NETWORKS,
  RateDirection,
  RateNetwork,
} from './chain-rate.service';

@ApiTags('Rates')
@Controller('rates')
export class RatesController {
  constructor(
    private readonly chainRates: ChainRateService,
  ) {}

  @Get('usd-ngn-rate')
  @ApiOperation({
    summary: 'USD/NGN rate, optionally for a specific chain and direction',
  })
  @ApiQuery({ name: 'network', required: false, enum: RATE_NETWORKS })
  @ApiQuery({ name: 'direction', required: false, enum: ['onramp', 'offramp'] })
  @ApiResponse({ status: 200, description: 'USD/NGN rate' })
  async getUsdNgnRate(
    @Query('network') network?: string,
    @Query('direction') direction?: string,
  ): Promise<{
    rate: number;
    network?: RateNetwork;
    direction?: RateDirection;
    source?: string;
  }> {
    const net = (network || 'base').toLowerCase();
    if (!(RATE_NETWORKS as readonly string[]).includes(net)) {
      throw new BadRequestException(
        `network must be one of: ${RATE_NETWORKS.join(', ')}`,
      );
    }
    const dir = (direction || 'offramp').toLowerCase();
    if (dir !== 'onramp' && dir !== 'offramp') {
      throw new BadRequestException('direction must be onramp or offramp');
    }
    return this.chainRates.getRate(net as RateNetwork, dir as RateDirection);
  }

  @Get('estimate-ngn')
  @ApiOperation({ summary: 'Calculate estimated NGN value from CNGN amount' })
  @ApiQuery({
    name: 'cngnAmount',
    description: 'Amount in CNGN',
    required: true,
    type: Number,
  })
  @ApiResponse({ status: 200, description: 'Estimated NGN value with rates' })
  async estimateNgn(
    @Query('cngnAmount') cngnAmount: string,
  ): Promise<{ estimatedNgn: number; usdNgnRate: number; usdValue: number }> {
    const amount = parseFloat(cngnAmount);
    if (isNaN(amount) || amount <= 0) {
      throw new BadRequestException('Valid CNGN amount is required');
    }

    const { rate } = await this.chainRates.getRate('base', 'offramp');
    return { estimatedNgn: amount * rate, usdNgnRate: rate, usdValue: amount };
  }
}
