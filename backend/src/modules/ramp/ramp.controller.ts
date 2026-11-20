import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
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
import { RampService } from './ramp.service';
import { PaymentCheckService } from './payment-check.service';
import { StellarOfframpRelayService } from './stellar-offramp-relay.service';
import {
  ConfirmStellarOfframpDto,
  offRampDto,
  onRampDto,
} from './dto/index.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthOrApiKeyGuard } from '../../common/guards/auth-or-api-key.guard';
import { ApiLoggingInterceptor } from '../../common/interceptors/api-logging.interceptor';

@ApiTags('Ramp')
@Controller('ramp')
export class RampController {
  constructor(
    private readonly rampService: RampService,
    private readonly paymentCheck: PaymentCheckService,
    private readonly stellarRelay: StellarOfframpRelayService,
  ) {}

  @Get('resolve-account')
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
    name: 'network',
    required: false,
    type: String,
    description:
      "Set to 'stellar' to resolve via Bitnob. Defaults to Flint for base/bsc.",
  })
  @ApiQuery({
    name: 'country',
    required: false,
    type: String,
    description: 'NG (default), GH or KE. Non-NG always resolves via Bitnob.',
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
    @Query('network') network?: string,
    @Query('country') country?: string,
  ) {
    return this.rampService.resolveAccount(
      bankCode,
      accountNumber,
      network,
      country,
    );
  }

  @Post('onramp')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @Throttle({ medium: { limit: 20, ttl: 600000 } })
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
    return this.rampService.onRamp(
      user.id,
      user.email,
      user.isMerchant,
      user.isOTCEnabled || false,
      dto,
      ipAddress,
      userAgent,
    );
  }

  @Post('offramp')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @Throttle({ medium: { limit: 20, ttl: 600000 } })
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
    return this.rampService.offRamp(
      user.id,
      user.email,
      user.isMerchant,
      user.isOTCEnabled || false,
      dto,
      ipAddress,
      userAgent,
    );
  }

  @Post('offramp/:reference/confirm')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @Throttle({ medium: { limit: 20, ttl: 600000 } })
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Confirm Stellar offramp deposit_for_burn',
    description:
      'Records the Stellar transaction hash and advances a PENDING order to PROCESSING.',
  })
  @ApiBody({ type: ConfirmStellarOfframpDto })
  @ApiResponse({ status: 200, description: 'Offramp deposit confirmed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async confirmStellarOfframp(
    @CurrentUser() user: any,
    @Param('reference') reference: string,
    @Body() dto: ConfirmStellarOfframpDto,
  ) {
    return this.rampService.confirmStellarOfframp(
      reference,
      dto,
      user.id,
      user.isMerchant,
    );
  }

  @Post('offramp/:reference/relay')
  @HttpCode(200)
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @Throttle({ medium: { limit: 60, ttl: 600000 } })
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Relay a Stellar off-ramp burn to Base',
    description:
      "For Stellar off-ramps served over CCTP: once the user's burn is confirmed, mints the USDC on Base (relayer pays gas) to the payout provider. Idempotent; clients poll it until state is 'minted'.",
  })
  @ApiResponse({ status: 200, description: 'Relay state' })
  async relayStellarOfframp(@CurrentUser() user: any, @Param('reference') reference: string) {
    return this.stellarRelay.relay(reference, user.id);
  }

  @Post('onramp/:reference/check')
  @HttpCode(200)
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @Throttle({ medium: { limit: 20, ttl: 600000 } })
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: "Check an on-ramp payment now (\"I've made the transfer\")",
    description:
      'Asks the provider whether the NGN deposit arrived and, if so, settles the order exactly as the webhook would. Safe to call repeatedly.',
  })
  @ApiResponse({ status: 200, description: 'Check result' })
  async checkOnramp(@CurrentUser() user: any, @Param('reference') reference: string) {
    return this.paymentCheck.check('onramp', reference, user.id, user.isMerchant);
  }

  @Post('offramp/:reference/check')
  @HttpCode(200)
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @Throttle({ medium: { limit: 20, ttl: 600000 } })
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: "Check an off-ramp deposit now (\"I've made the transfer\")",
    description:
      'Asks Bitnob / SafeHaven for the latest state of the order and applies it exactly as the webhook would. Safe to call repeatedly.',
  })
  @ApiResponse({ status: 200, description: 'Check result' })
  async checkOfframp(@CurrentUser() user: any, @Param('reference') reference: string) {
    return this.paymentCheck.check('offramp', reference, user.id, user.isMerchant);
  }

  @Get('offramp/:reference')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Get offramp reconciliation detail',
    description:
      'Returns the offramp transaction, its provider order (funding address, expected/received amounts, expiry, failure reason) and status-change history.',
  })
  @ApiResponse({ status: 200, description: 'Offramp detail' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getOfframpByReference(
    @CurrentUser() user: any,
    @Param('reference') reference: string,
  ) {
    return this.rampService.getOfframpByReference(
      reference,
      user.id,
      user.isMerchant,
    );
  }

  @Get('offramp/:reference/reconciliation')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'Get the structured reconciliation record for a cash-out',
    description:
      'Internal and external references, Stellar tx hash, asset and amount, expected vs actual settlement, outstanding amount, status, failure reason, timestamps and the reconciliation result.',
  })
  @ApiResponse({ status: 200, description: 'Reconciliation record' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async getOfframpReconciliation(
    @CurrentUser() user: any,
    @Param('reference') reference: string,
  ) {
    return this.rampService.getOfframpReconciliation(reference, user.id);
  }

  @Get('reconciliation')
  @UseGuards(AuthOrApiKeyGuard)
  @UseInterceptors(ApiLoggingInterceptor)
  @ApiBearerAuth('JWT-auth')
  @ApiSecurity('API-Key')
  @ApiOperation({
    summary: 'List reconciliation records for your cash-outs',
    description:
      'Optional filters: status (off-ramp state), result (e.g. MATCHED, UNDERPAID, TIMED_OUT), limit, skip.',
  })
  async listOfframpReconciliations(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('result') result?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.rampService.listOfframpReconciliations(user.id, {
      status,
      result,
      limit: limit ? Number(limit) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
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
    return this.rampService.getTransactions(
      user.id,
      user.isMerchant,
      id,
      reference,
      pageNum,
      limitNum,
    );
  }
}
