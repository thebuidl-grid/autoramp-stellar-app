import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { SwapService } from './swap.service';
import { CreateSwapDto } from './dto/create-swap.dto';
import { InitializeSwapDto } from './dto/initialize-swap.dto';
import { CreateSimpleSwapDto } from './dto/create-simple-swap.dto';
import { AuthOrApiKeyGuard } from '../api-keys/guards/auth-or-api-key.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Swap')
@Controller('swap')
export class SwapController {
  constructor(private readonly swapService: SwapService) { }

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

  @Get('usd-ngn-rate')
  @ApiOperation({ summary: 'Get USD/NGN rate from MonieRate API' })
  @ApiResponse({ status: 200, description: 'USD/NGN rate' })
  async getUsdNgnRate(): Promise<{ rate: number }> {
    const rate = await this.swapService.getUsdNgnRate();
    return { rate };
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

    return await this.swapService.calculateEstimatedNgn(amount);
  }

  @Post('/initialize')
  @UseGuards(AuthOrApiKeyGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Initialize swap transaction (USDC → CNGN → Offramp)',
    description: 'Initializes offramp first to get recipient wallet address, then creates swap record. Returns recipient address and swap parameters for frontend to execute the swap. Requires authentication.',
  })
  @ApiBody({ type: InitializeSwapDto })
  @ApiResponse({ status: 200, description: 'Swap and offramp initialization response with recipient address' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing authentication' })
  async initializeSwap(
    @CurrentUser() user: any,
    @Body() dto: InitializeSwapDto,
    @Req() req: any,
  ): Promise<any> {
    if (dto.amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }
    // Check minimum amount in NGN (must be at least 100 NGN)
    // We strictly enforce 100 NGN minimum regardless of the USDC equivalent
    if (dto.amount < 100) {
      throw new BadRequestException('Minimum amount is 100 NGN');
    }
    if (dto.slippage < 0 || dto.slippage > 1) {
      throw new BadRequestException('Slippage must be between 0 and 1');
    }

    // Extract IP address and user agent
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.swapService.initializeSwap(user.id, dto, ipAddress, userAgent);
  }

  @Post('/:reference/complete')
  @UseGuards(AuthOrApiKeyGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Update swap transaction after execution',
    description: 'Updates swap transaction status after user executes the swap on blockchain. Requires authentication.',
  })
  @ApiParam({ name: 'reference', description: 'Swap transaction reference' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        transactionHash: { type: 'string', example: '0x...' },
        sourceAddress: { type: 'string', example: '0x...' },
      },
      required: ['transactionHash', 'sourceAddress'],
    },
  })
  @ApiResponse({ status: 200, description: 'Swap transaction updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateSwapAfterExecution(
    @CurrentUser() user: any,
    @Param('reference') reference: string,
    @Body('transactionHash') transactionHash: string,
    @Body('sourceAddress') sourceAddress: string,
  ): Promise<any> {
    if (!transactionHash || !transactionHash.startsWith('0x')) {
      throw new BadRequestException('Valid transaction hash is required');
    }
    if (!sourceAddress || !sourceAddress.startsWith('0x')) {
      throw new BadRequestException('Valid source address is required');
    }

    return this.swapService.updateSwapAfterExecution(reference, transactionHash, sourceAddress);
  }

  @Post('/create')
  @UseGuards(AuthOrApiKeyGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Create a simple swap transaction (store in database)',
    description: 'Creates a swap transaction record in the database. The actual swap execution happens on-chain via the frontend. Requires authentication.',
  })
  @ApiBody({ type: CreateSimpleSwapDto })
  @ApiResponse({ status: 200, description: 'Swap transaction created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createSimpleSwap(
    @CurrentUser() user: any,
    @Body() dto: CreateSimpleSwapDto,
    @Req() req: any,
  ): Promise<any> {
    // Extract IP address and user agent
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.swapService.createSimpleSwap(user.id, dto, ipAddress, userAgent);
  }

  @Post('/')
  @UseGuards(AuthOrApiKeyGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Execute a token swap (USDC ↔ CNGN) - DEPRECATED',
    description: 'DEPRECATED: Use /swap/initialize instead. Executes swap on backend. Requires authentication.',
  })
  @ApiBody({ type: CreateSwapDto })
  @ApiResponse({ status: 200, description: 'Swap transaction response' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing authentication' })
  async swap(
    @CurrentUser() user: any,
    @Body() dto: CreateSwapDto,
    @Req() req: any,
  ): Promise<any> {
    if (dto.amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }
    if (!dto.recipient || !dto.recipient.startsWith('0x')) {
      throw new BadRequestException('Valid recipient address is required');
    }
    if (dto.slippage < 0 || dto.slippage > 1) {
      throw new BadRequestException('Slippage must be between 0 and 1');
    }

    // Extract IP address and user agent
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.swapService.swap(user.id, dto, ipAddress, userAgent);
  }
}
