import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  BadRequestException,
  UnauthorizedException,
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
import type { Request } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { StablestackService } from './stablestack.service';
import { WebhookService } from './webhook.service';
import { offRampDto, onRampDto } from './dto/index.dto';
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
  @ApiQuery({
    name: 'currency',
    required: false,
    type: String,
    description: "Fiat currency (ISO 4217), selects the corridor's processor. Defaults to the app-wide default processor when omitted.",
  })
  @ApiResponse({ status: 200, description: 'List of banks' })
  async getBanks(@Query('currency') currency?: string) {
    return this.stablestackService.getBanks(currency);
  }

  @Get('resolve-account')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Resolve account name',
    description:
      'Resolves account name from bank code and account number. Requires authentication (JWT token in Authorization header or API key in x-api-key header).',
  })
  @ApiQuery({
    name: 'bankCode',
    required: true,
    type: String,
    description: 'Bank code',
  })
  @ApiQuery({
    name: 'accountNumber',
    required: true,
    type: String,
    description: 'Account number',
  })
  @ApiQuery({
    name: 'currency',
    required: false,
    type: String,
    description: "Fiat currency (ISO 4217), selects the corridor's processor. Defaults to the app-wide default processor when omitted.",
  })
  @ApiResponse({
    status: 200,
    description: 'Account name resolved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async resolveAccount(
    @Query('bankCode') bankCode: string,
    @Query('accountNumber') accountNumber: string,
    @Query('currency') currency?: string,
  ) {
    return this.stablestackService.resolveAccount(bankCode, accountNumber, currency);
  }

  @Post('onramp')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @Throttle({ medium: { limit: 20, ttl: 600000 } }) // 20 requests per 10 minutes
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Initialise onramp transaction',
    description:
      'Requires authentication (JWT token in Authorization header or API key in x-api-key header)',
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
    description:
      'Requires authentication (JWT token in Authorization header or API key in x-api-key header)',
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

  @Post('offramp/:reference/confirm-deposit')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Confirm a CNGN deposit for an offramp transaction',
    description:
      'Reports the Stellar transaction hash of a CNGN deposit sent to the offramp collection account. Verifies it on-chain via Horizon before moving the transaction out of PENDING.',
  })
  @ApiParam({ name: 'reference', description: 'Offramp transaction reference' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { transactionHash: { type: 'string' } },
      required: ['transactionHash'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Deposit confirmed, transaction moved to PROCESSING',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async confirmOfframpDeposit(
    @Param('reference') reference: string,
    @Body('transactionHash') transactionHash: string,
  ) {
    if (!transactionHash || !/^[a-fA-F0-9]{64}$/.test(transactionHash)) {
      throw new BadRequestException(
        'Valid Stellar transaction hash is required',
      );
    }
    return this.stablestackService.confirmOfframpDeposit(
      reference,
      transactionHash,
    );
  }

  @Get('transactions')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Get ramp transactions',
    description:
      'Requires authentication (JWT token in Authorization header or API key in x-api-key header) and verified KYC status. Returns transactions for the authenticated user.',
  })
  @ApiQuery({ name: 'id', required: false, type: String })
  @ApiQuery({ name: 'reference', required: false, type: String })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10)',
  })
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
    return this.stablestackService.getTransactions(
      user.id,
      id,
      reference,
      pageNum,
      limitNum,
    );
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
  constructor(
    private readonly webhookService: WebhookService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Receive webhook from Flint API' })
  @ApiBody({ type: Object })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async handleWebhook(@Body() webhookData: any) {
    return this.webhookService.processWebhook(webhookData);
  }

  @Post('paystack')
  @Public()
  @ApiOperation({ summary: 'Receive webhook from Paystack' })
  @ApiBody({ type: Object })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async handlePaystackWebhook(
    @Body() webhookData: any,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const secretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY');
    const signature = req.headers['x-paystack-signature'] as string | undefined;

    if (!secretKey || !signature || !req.rawBody) {
      throw new UnauthorizedException('Missing Paystack webhook signature');
    }

    const expected = crypto.createHmac('sha512', secretKey).update(req.rawBody).digest('hex');
    if (expected !== signature) {
      throw new UnauthorizedException('Invalid Paystack webhook signature');
    }

    return this.webhookService.processPaystackWebhook(webhookData);
  }

  @Post('safehaven')
  @Public()
  @ApiOperation({ summary: 'Receive webhook from SafeHaven MFB' })
  @ApiBody({ type: Object })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or missing shared-secret key' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async handleSafeHavenWebhook(@Body() webhookData: any, @Req() req: Request) {
    // SafeHaven's docs don't document a webhook signature scheme (see
    // SafeHavenRampProcessor's class doc), so as a lightweight mitigation
    // we require a shared secret appended as `?key=` to the callback/
    // dashboard-configured webhook URL we control — set
    // SAFEHAVEN_WEBHOOK_SHARED_SECRET and configure the URL accordingly.
    // This is defense in depth, not the real guarantee: the actual
    // trustworthiness comes from WebhookService re-verifying status via an
    // authenticated call before mutating anything.
    const expectedKey = this.configService.get<string>('SAFEHAVEN_WEBHOOK_SHARED_SECRET');
    if (expectedKey) {
      const providedKey = (req.query?.key as string | undefined) || undefined;
      if (providedKey !== expectedKey) {
        throw new UnauthorizedException('Missing or invalid SafeHaven webhook key');
      }
    }

    return this.webhookService.processSafeHavenWebhook(webhookData);
  }
}
