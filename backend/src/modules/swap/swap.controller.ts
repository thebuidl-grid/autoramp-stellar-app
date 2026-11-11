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
import { PrismaService } from '../../database/prisma.service';
import { CreateSwapDto } from './dto/create-swap.dto';
import { InitializeSwapDto } from './dto/initialize-swap.dto';
import { CreateSimpleSwapDto } from './dto/create-simple-swap.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthOrApiKeyGuard } from '../../common/guards/auth-or-api-key.guard';

@ApiTags('Swap')
@Controller('swap')
export class SwapController {
  constructor(
    private readonly swapService: SwapService,
    private readonly prisma: PrismaService,
  ) {}

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

  @Post('/initialize')
  @UseGuards(AuthOrApiKeyGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Initialize swap transaction (USDC → CNGN → Offramp)',
    description:
      'Initializes offramp first to get recipient wallet address, then creates swap record. Returns recipient address and swap parameters for frontend to execute the swap. Requires authentication.',
  })
  @ApiBody({ type: InitializeSwapDto })
  @ApiResponse({
    status: 200,
    description:
      'Swap and offramp initialization response with recipient address',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication',
  })
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
      throw new BadRequestException('Invalid slippage specified');
    }

    // Extract IP address and user agent
    const ipAddress =
      req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // support merchant API key
    const rawApiKey =
      (req.headers['x-api-key'] as string) ||
      (req.headers['authorization'] as string)?.replace('Bearer ', '') ||
      (req.headers['authorization'] as string)?.replace('ApiKey ', '');

    if (rawApiKey) {
      const crypto = await import('crypto');
      const hashed = crypto
        .createHash('sha256')
        .update(rawApiKey)
        .digest('hex');
      const merchantKey = await this.prisma.merchantApiKey.findFirst({
        where: { key: hashed },
        include: { merchant: true },
      });
      if (
        merchantKey &&
        merchantKey.isActive &&
        merchantKey.merchant?.status === 'VERIFIED'
      ) {
        await this.prisma.merchantApiKey.update({
          where: { id: merchantKey.id },
          data: { lastUsedAt: new Date() },
        });
        return this.swapService.initializeSwap(
          user.id,
          user.isOTCEnabled || false,
          dto,
          ipAddress,
          userAgent,
          merchantKey.merchantId,
          merchantKey.id,
        );
      }
    }

    return this.swapService.initializeSwap(
      user.id,
      user.isOTCEnabled || false,
      dto,
      ipAddress,
      userAgent,
    );
  }

  @Post('/:reference/complete')
  @UseGuards(AuthOrApiKeyGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Update swap transaction after execution',
    description:
      'Updates swap transaction status after user executes the swap on blockchain. Requires authentication.',
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
  @ApiResponse({
    status: 200,
    description: 'Swap transaction updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateSwapAfterExecution(
    @CurrentUser() user: any,
    @Req() req: any,
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

    const rawApiKey =
      (req.headers['x-api-key'] as string) ||
      (req.headers['authorization'] as string)?.replace('Bearer ', '') ||
      (req.headers['authorization'] as string)?.replace('ApiKey ', '');

    if (rawApiKey) {
      const crypto = await import('crypto');
      const hashed = crypto
        .createHash('sha256')
        .update(rawApiKey)
        .digest('hex');
      const merchantKey = await this.prisma.merchantApiKey.findFirst({
        where: { key: hashed },
        include: { merchant: true },
      });
      if (
        merchantKey &&
        merchantKey.isActive &&
        merchantKey.merchant?.status === 'VERIFIED'
      ) {
        await this.prisma.merchantApiKey.update({
          where: { id: merchantKey.id },
          data: { lastUsedAt: new Date() },
        });
        return this.swapService.updateSwapAfterExecution(
          reference,
          transactionHash,
          sourceAddress,
          merchantKey.merchantId,
          merchantKey.id,
        );
      }
    }

    return this.swapService.updateSwapAfterExecution(
      reference,
      transactionHash,
      sourceAddress,
    );
  }

  @Post('/create')
  @UseGuards(AuthOrApiKeyGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Create a simple swap transaction (store in database)',
    description:
      'Creates a swap transaction record in the database. The actual swap execution happens on-chain via the frontend. Requires authentication.',
  })
  @ApiBody({ type: CreateSimpleSwapDto })
  @ApiResponse({
    status: 200,
    description: 'Swap transaction created successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createSimpleSwap(
    @CurrentUser() user: any,
    @Body() dto: CreateSimpleSwapDto,
    @Req() req: any,
  ): Promise<any> {
    // Extract IP address and user agent
    const ipAddress =
      req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Check for merchant API key in headers
    const rawApiKey =
      (req.headers['x-api-key'] as string) ||
      (req.headers['authorization'] as string)?.replace('Bearer ', '') ||
      (req.headers['authorization'] as string)?.replace('ApiKey ', '');

    if (rawApiKey) {
      const crypto = await import('crypto');
      const hashed = crypto
        .createHash('sha256')
        .update(rawApiKey)
        .digest('hex');

      const merchantKey = await this.prisma.merchantApiKey.findFirst({
        where: { key: hashed },
        include: { merchant: true },
      });

      if (
        merchantKey &&
        merchantKey.isActive &&
        merchantKey.merchant?.status === 'VERIFIED'
      ) {
        // update last used
        await this.prisma.merchantApiKey.update({
          where: { id: merchantKey.id },
          data: { lastUsedAt: new Date() },
        });

        return this.swapService.createSimpleSwap(
          dto,
          merchantKey.merchantId,
          merchantKey.id,
          undefined,
          ipAddress,
          userAgent,
        );
      }
    }

    // Fallback to authenticated user
    if (!user || !user.id) {
      throw new BadRequestException('Authentication required');
    }

    return this.swapService.createSimpleSwap(
      dto,
      undefined,
      undefined,
      user.id,
      ipAddress,
      userAgent,
    );
  }
}
