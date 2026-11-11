import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  Req,
  UnauthorizedException,
  DefaultValuePipe,
  ParseIntPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { MerchantBankService } from './merchant-bank.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { IsMerchantGuard } from '../guards/is-merchant.guard';
import { ApiLoggingInterceptor } from '../../../common/interceptors/api-logging.interceptor';
import { PrismaService } from '../../../database/prisma.service';
import { MerchantCreateSubAccountDto } from './dto/merchant-create-sub-account.dto';
import { MerchantUpdateSubAccountDto } from './dto/merchant-update-sub-account.dto';
import { MerchantCreateVirtualAccountDto } from './dto/merchant-create-virtual-account.dto';
import { MerchantTransferDto } from './dto/merchant-transfer.dto';
import { MerchantNameEnquiryDto } from './dto/merchant-name-enquiry.dto';
import { MerchantInitiateVerificationDto } from './dto/merchant-initiate-verification.dto';
import { MerchantValidateVerificationDto } from './dto/merchant-validate-verification.dto';

@ApiTags('Merchant Dashboard')
@Controller('merchants/bank')
@UseGuards(JwtAuthGuard, IsMerchantGuard)
@UseInterceptors(ApiLoggingInterceptor)
@ApiBearerAuth('JWT-auth')
export class MerchantDashboardController {
  constructor(
    private readonly merchantBankService: MerchantBankService,
    private readonly prisma: PrismaService,
  ) {}

  private async getMerchantId(req: Request): Promise<string> {
    const user = req.user as { id: string; role?: string } | undefined;
    if (!user?.id) {
      throw new UnauthorizedException('Authentication required');
    }

    // Admins can pass merchantId as query param to act on behalf of a merchant
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const merchantIdFromQuery = (req.query as any)?.merchantId as
      | string
      | undefined;
    if (user.role === 'ADMIN' && merchantIdFromQuery) {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: merchantIdFromQuery },
        select: { id: true },
      });
      if (!merchant) {
        throw new UnauthorizedException('Merchant not found');
      }
      return merchant.id;
    }

    const merchant = await this.prisma.merchant.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!merchant) {
      throw new UnauthorizedException('Merchant not found');
    }
    return merchant.id;
  }

  @Get('account')
  @ApiOperation({ summary: 'Get my bank account balance and details' })
  @ApiResponse({ status: 200, description: 'Account details retrieved' })
  async getMyAccount(@Req() req: Request) {
    return this.merchantBankService.getMyAccount(await this.getMerchantId(req));
  }

  @Get('banks')
  @ApiOperation({ summary: 'Get list of supported banks' })
  @ApiResponse({ status: 200, description: 'List of banks' })
  async getBanks() {
    return this.merchantBankService.getBanks();
  }

  @Get('sub-accounts')
  @ApiOperation({ summary: 'List my sub-accounts' })
  @ApiResponse({ status: 200, description: 'Sub-accounts retrieved' })
  async getSubAccounts(@Req() req: Request) {
    return this.merchantBankService.getSubAccounts(
      await this.getMerchantId(req),
    );
  }

  @Get('sub-accounts/:id')
  @ApiOperation({ summary: 'Get a single sub-account balance and details' })
  @ApiResponse({ status: 200, description: 'Sub-account details retrieved' })
  async getSubAccount(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.merchantBankService.getSubAccount(
      await this.getMerchantId(req),
      id,
    );
  }

  @Get('sub-accounts/:subAccountId/transfers')
  @ApiOperation({ summary: 'Get transfer history for a specific sub-account' })
  @ApiResponse({ status: 200, description: 'Transfers retrieved' })
  async getSubAccountTransfers(
    @Req() req: Request,
    @Param('subAccountId', ParseUUIDPipe) subAccountId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.merchantBankService.getTransfers(
      await this.getMerchantId(req),
      { page, limit, status, fromDate, toDate, subAccountId },
    );
  }

  @Get('sub-accounts/:subAccountId/transactions')
  @ApiOperation({
    summary: 'Get transaction history for a specific sub-account',
  })
  @ApiResponse({ status: 200, description: 'Transactions retrieved' })
  async getSubAccountTransactions(
    @Req() req: Request,
    @Param('subAccountId', ParseUUIDPipe) subAccountId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('type') type?: 'onramp' | 'offramp' | 'swap',
    @Query('status') status?: string,
  ) {
    return this.merchantBankService.getTransactions(
      await this.getMerchantId(req),
      { page, limit, type, status, subAccountId },
    );
  }

  @Get('transfers')
  @ApiOperation({ summary: 'Get my bank transfer history' })
  @ApiQuery({
    name: 'subAccountId',
    required: false,
    description: 'Filter by sub-account ID',
  })
  @ApiResponse({ status: 200, description: 'Transfers retrieved' })
  async getTransfers(
    @Req() req: Request,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('subAccountId') subAccountId?: string,
  ) {
    return this.merchantBankService.getTransfers(
      await this.getMerchantId(req),
      { page, limit, status, fromDate, toDate, subAccountId },
    );
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get my transaction history' })
  @ApiQuery({
    name: 'subAccountId',
    required: false,
    description: 'Filter by sub-account ID',
  })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    description: 'Filter from date (ISO 8601)',
  })
  @ApiQuery({
    name: 'toDate',
    required: false,
    description: 'Filter to date (ISO 8601)',
  })
  @ApiResponse({ status: 200, description: 'Transactions retrieved' })
  async getTransactions(
    @Req() req: Request,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('type') type?: 'onramp' | 'offramp' | 'swap' | 'transfer',
    @Query('status') status?: string,
    @Query('subAccountId') subAccountId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.merchantBankService.getTransactions(
      await this.getMerchantId(req),
      { page, limit, type, status, subAccountId, fromDate, toDate },
    );
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get my usage stats (requests, money moved, activity)',
  })
  @ApiResponse({ status: 200, description: 'Stats retrieved' })
  async getStats(@Req() req: Request) {
    return this.merchantBankService.getStats(await this.getMerchantId(req));
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get time-series analytics for charts' })
  @ApiResponse({ status: 200, description: 'Analytics data retrieved' })
  async getAnalytics(
    @Req() req: Request,
    @Query('period') period: 'daily' | 'weekly' | 'monthly',
  ) {
    return this.merchantBankService.getAnalytics(
      await this.getMerchantId(req),
      period || 'daily',
    );
  }

  // Routes without /bank/ prefix for merchant dashboard
  @Get('webhook-logs')
  @ApiOperation({ summary: 'Get webhook delivery history' })
  @ApiResponse({ status: 200, description: 'Webhook logs retrieved' })
  async getWebhookLogsAlt(
    @Req() req: Request,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('event') event?: string,
    @Query('success') success?: boolean,
  ) {
    return this.merchantBankService.getWebhookLogs(
      await this.getMerchantId(req),
      { page, limit, event, success },
    );
  }

  @Get('webhook-logs/:id')
  @ApiOperation({ summary: 'Get full detail of a single webhook delivery log (includes payload + response body)' })
  @ApiResponse({ status: 200, description: 'Webhook log detail retrieved' })
  async getWebhookLogDetail(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.merchantBankService.getWebhookLogDetail(
      await this.getMerchantId(req),
      id,
    );
  }

  @Post('webhook-logs/:id/retry')
  @ApiOperation({ summary: 'Retry a failed webhook delivery' })
  @ApiResponse({ status: 200, description: 'Webhook retry initiated' })
  async retryWebhookAlt(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.merchantBankService.retryWebhookLog(
      await this.getMerchantId(req),
      id,
    );
  }

  @Post('name-enquiry')
  @ApiOperation({ summary: 'Perform bank account name enquiry' })
  @ApiResponse({ status: 200, description: 'Account details found' })
  async nameEnquiry(@Req() req: Request, @Body() dto: MerchantNameEnquiryDto) {
    return this.merchantBankService.nameEnquiry(
      await this.getMerchantId(req),
      dto,
    );
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Transfer funds from my account' })
  @ApiResponse({ status: 201, description: 'Transfer initiated' })
  async transfer(@Req() req: Request, @Body() dto: MerchantTransferDto) {
    return this.merchantBankService.transfer(
      await this.getMerchantId(req),
      dto,
    );
  }

  @Post('virtual-account')
  @ApiOperation({
    summary: 'Create a virtual account tied to my settlement account',
  })
  @ApiResponse({ status: 201, description: 'Virtual account created' })
  async createVirtualAccount(
    @Req() req: Request,
    @Body() dto: MerchantCreateVirtualAccountDto,
  ) {
    return this.merchantBankService.createVirtualAccount(
      await this.getMerchantId(req),
      dto,
    );
  }

  @Post('sub-account')
  @ApiOperation({ summary: 'Create a new sub-account' })
  @ApiResponse({ status: 201, description: 'Sub-account created' })
  async createSubAccount(
    @Req() req: Request,
    @Body() dto: MerchantCreateSubAccountDto,
  ) {
    return this.merchantBankService.createSubAccount(
      await this.getMerchantId(req),
      dto,
    );
  }

  @Patch('sub-accounts/:id')
  @ApiOperation({ summary: 'Update a sub-account (e.g. toggle auto-sweep)' })
  @ApiResponse({ status: 200, description: 'Sub-account updated' })
  async updateSubAccount(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MerchantUpdateSubAccountDto,
  ) {
    return this.merchantBankService.updateSubAccount(
      await this.getMerchantId(req),
      id,
      dto,
    );
  }

  @Post('verify-identity')
  @ApiOperation({ summary: 'Initiate identity verification (BVN/NIN)' })
  @ApiResponse({ status: 201, description: 'Verification initiated' })
  async initiateVerification(
    @Req() req: Request,
    @Body() dto: MerchantInitiateVerificationDto,
  ) {
    return this.merchantBankService.initiateVerification(
      await this.getMerchantId(req),
      dto,
    );
  }

  @Post('validate-identity')
  @ApiOperation({ summary: 'Validate identity verification OTP' })
  @ApiResponse({ status: 200, description: 'Identity validated' })
  async validateVerification(
    @Req() req: Request,
    @Body() dto: MerchantValidateVerificationDto,
  ) {
    return this.merchantBankService.validateVerification(
      await this.getMerchantId(req),
      dto,
    );
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Get my audit logs' })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved' })
  async getAuditLogs(
    @Req() req: Request,
    @Query('action') action?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.merchantBankService.getAuditLogs(
      await this.getMerchantId(req),
      action,
      page,
      limit,
    );
  }
}
