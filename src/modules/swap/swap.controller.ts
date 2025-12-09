import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  ParseBoolPipe,
  ParseFloatPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { SwapService } from './swap.service';

@ApiTags('Swap')
@Controller('swap')
export class SwapController {
  constructor(private readonly swapService: SwapService) {}

  @Get('balance/:token/:address')
  @ApiOperation({ summary: 'Get token balance for an address' })
  @ApiParam({ name: 'token', description: 'Token symbol (e.g., USDC, CNGN)' })
  @ApiParam({ name: 'address', description: 'Wallet address' })
  @ApiResponse({ status: 200, description: 'Token balance as string' })
  async getTokenBalance(
    @Param('token') token: string,
    @Param('address') address: string,
  ): Promise<string | null> {
    if (!['USDC', 'CNGN'].includes(token.toUpperCase())) {
      throw new BadRequestException('Token must be USDC or CNGN');
    }
    if (!address || !address.startsWith('0x')) {
      throw new BadRequestException('Valid address is required');
    }
    return this.swapService.getTokenBalance(token.toUpperCase(), address);
  }

  @Get('balances')
  @ApiOperation({ summary: 'Get balances for USDC and CNGN for an address' })
  @ApiQuery({
    name: 'address',
    description: 'Wallet address (optional; uses signer if omitted)',
    required: false,
    type: String,
  })
  @ApiResponse({ status: 200, description: 'Record of balances' })
  async getTokenBalances(
    @Query('address') address?: string,
  ): Promise<Record<string, string>> {
    if (address && !address.startsWith('0x')) {
      throw new BadRequestException('Valid address is required');
    }
    return this.swapService.getTokenBalances(address);
  }

  @Post('/')
  @ApiOperation({ summary: 'Execute a token swap (USDC ↔ CNGN)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', example: 100 },
        recipient: { type: 'string', example: '0x...' },
        to_cngn: { type: 'boolean', example: true },
        slippage: { type: 'number', example: 0.05 },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Swap transaction response' })
  async swap(
    @Body('amount', ParseFloatPipe) amount: number,
    @Body('recipient') recipient: string,
    @Body('to_cngn', ParseBoolPipe) to_cngn: boolean,
    @Body('slippage', ParseFloatPipe) slippage: number,
  ): Promise<any> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }
    if (!recipient || !recipient.startsWith('0x')) {
      throw new BadRequestException('Valid recipient address is required');
    }
    if (slippage < 0 || slippage > 1) {
      throw new BadRequestException('Slippage must be between 0 and 1');
    }
    return this.swapService.swap({ amount, recipient, to_cngn, slippage });
  }
}
