import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBody,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { StablestackService } from './stablestack.service';
import { WebhookService } from './webhook.service';
import {
  offRampDto,
  onRampDto,
} from './dto/index.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AuthOrApiKeyGuard } from '../api-keys/guards/auth-or-api-key.guard';
import { UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiLoggingInterceptor } from '../api-keys/interceptors/api-logging.interceptor';

@ApiTags('Stablestack')
@Controller('stablestack')
export class StablestackController {
  constructor(private readonly stablestackService: StablestackService) {}

  @Get('banks')
  @ApiOperation({ summary: 'Get list of banks' })
  @ApiResponse({ status: 200, description: 'List of banks' })
  async getBanks() {
    return this.stablestackService.getBanks();
  }

  @Get('resolve-account')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Resolve account name',
    description: 'Resolves account name from bank code and account number. Requires authentication (JWT token in Authorization header or API key in x-api-key header).',
  })
  @ApiQuery({ name: 'bankCode', required: true, type: String, description: 'Bank code' })
  @ApiQuery({ name: 'accountNumber', required: true, type: String, description: 'Account number' })
  @ApiResponse({ status: 200, description: 'Account name resolved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async resolveAccount(
    @Query('bankCode') bankCode: string,
    @Query('accountNumber') accountNumber: string,
  ) {
    return this.stablestackService.resolveAccount(bankCode, accountNumber);
  }

  @Post('onramp')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @Throttle({ medium: { limit: 20, ttl: 600000 } }) // 20 requests per 10 minutes
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({ 
    summary: 'Initialise onramp transaction',
    description: 'Requires authentication (JWT token in Authorization header or API key in x-api-key header)'
  })
  @ApiBody({ type: onRampDto })
  @ApiResponse({ status: 201, description: 'Onramp Initialisation response' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async onRamp(
    @CurrentUser() user: any,
    @Body() dto: onRampDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');
    return this.stablestackService.onRamp(user.id, dto, ipAddress, userAgent);
  }

  @Post('offramp')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @Throttle({ medium: { limit: 20, ttl: 600000 } }) // 20 requests per 10 minutes
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({ 
    summary: 'Initialise offramp transaction',
    description: 'Requires authentication (JWT token in Authorization header or API key in x-api-key header)'
  })
  @ApiBody({ type: offRampDto })
  @ApiResponse({ status: 201, description: 'Offramp Initialisation response' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async offRamp(
    @CurrentUser() user: any,
    @Body() dto: offRampDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');
    return this.stablestackService.offRamp(user.id, dto, ipAddress, userAgent);
  }

  @Get('transactions')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({ 
    summary: 'Get ramp transactions',
    description: 'Requires authentication (JWT token in Authorization header or API key in x-api-key header) and verified KYC status. Returns transactions for the authenticated user.'
  })
  @ApiQuery({ name: 'id', required: false, type: String })
  @ApiQuery({ name: 'reference', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
  @ApiResponse({ status: 200, description: 'List of transactions' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTransactions(
    @CurrentUser() user: any,
    @Query('id') id?: string,
    @Query('reference') reference?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.stablestackService.getTransactions(user.id, id, reference, pageNum, limitNum);
  }
}

/**
 * Webhook Controller
 * 
 * Handles webhook events from Flint API for transaction status updates.
 * This endpoint should be publicly accessible (no auth) as it's called by Flint API.
 */
@ApiTags('Stablestack')
@Controller('stablestack/webhook')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Receive webhook from Flint API' })
  @ApiBody({ type: Object })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async handleWebhook(@Body() webhookData: any) {
    return this.webhookService.processWebhook(webhookData);
  }
}
