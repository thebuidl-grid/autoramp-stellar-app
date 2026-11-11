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
  BadRequestException,
  UnauthorizedException,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiQuery,
} from '@nestjs/swagger';
import { MerchantBankService } from './merchant-bank.service';
import { ApiKeyOnlyGuard } from '../../../common/guards/api-key-only.guard';
import { ApiLoggingInterceptor } from '../../../common/interceptors/api-logging.interceptor';
import { MerchantCreateSubAccountDto } from './dto/merchant-create-sub-account.dto';
import { MerchantUpdateSubAccountDto } from './dto/merchant-update-sub-account.dto';
import { MerchantCreateVirtualAccountDto } from './dto/merchant-create-virtual-account.dto';
import { MerchantTransferDto } from './dto/merchant-transfer.dto';
import { MerchantNameEnquiryDto } from './dto/merchant-name-enquiry.dto';
import { MerchantInitiateVerificationDto } from './dto/merchant-initiate-verification.dto';
import { MerchantValidateVerificationDto } from './dto/merchant-validate-verification.dto';

@ApiTags('Merchant API')
@Controller('merchants/api')
@UseGuards(ApiKeyOnlyGuard)
@UseInterceptors(ApiLoggingInterceptor)
@ApiSecurity('API-Key')
export class MerchantApiController {
  constructor(private readonly merchantBankService: MerchantBankService) {}

  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  private getMerchantId(req: Request): string {
    const user = req.user as { id: string; isMerchant?: boolean } | undefined;
    const id = user?.id;
    if (!id || !MerchantApiController.UUID_RE.test(id)) {
      throw new UnauthorizedException('Invalid merchant identity');
    }
    return id;
  }

  @Get('account')
  @ApiOperation({ summary: 'Get my bank account balance and details' })
  @ApiResponse({ status: 200, description: 'Account details retrieved' })
  async getMyAccount(@Req() req: Request) {
    return this.merchantBankService.getMyAccount(this.getMerchantId(req));
  }

  @Get('sub-accounts')
  @ApiOperation({ summary: 'List my sub-accounts' })
  @ApiResponse({ status: 200, description: 'Sub-accounts retrieved' })
  async getSubAccounts(@Req() req: Request) {
    return this.merchantBankService.getSubAccounts(this.getMerchantId(req));
  }

  @Get('sub-accounts/:id')
  @ApiOperation({ summary: 'Get a single sub-account balance and details' })
  @ApiResponse({ status: 200, description: 'Sub-account details retrieved' })
  async getSubAccount(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.merchantBankService.getSubAccount(this.getMerchantId(req), id);
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
    return this.merchantBankService.getTransfers(this.getMerchantId(req), {
      page,
      limit,
      status,
      fromDate,
      toDate,
      subAccountId,
    });
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
    return this.merchantBankService.getTransactions(this.getMerchantId(req), {
      page,
      limit,
      type,
      status,
      subAccountId,
    });
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
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('subAccountId') subAccountId?: string,
  ) {
    return this.merchantBankService.getTransfers(this.getMerchantId(req), {
      page,
      limit,
      status,
      fromDate,
      toDate,
      subAccountId,
    });
  }

  @Get('transfers/status')
  @ApiOperation({
    summary: 'Get real-time transfer status from provider by reference',
  })
  @ApiQuery({
    name: 'reference',
    required: true,
    description:
      'Transfer reference (our internal reference or provider reference)',
  })
  @ApiResponse({
    status: 200,
    description: 'Transfer status retrieved from provider',
  })
  @ApiResponse({ status: 404, description: 'Transfer not found' })
  async getTransferStatus(
    @Req() req: Request,
    @Query('reference') reference: string,
  ) {
    if (!reference) {
      throw new BadRequestException('Reference is required');
    }
    return this.merchantBankService.getTransferStatusByReference(
      this.getMerchantId(req),
      reference,
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
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('type') type?: 'onramp' | 'offramp' | 'swap' | 'transfer',
    @Query('status') status?: string,
    @Query('subAccountId') subAccountId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.merchantBankService.getTransactions(this.getMerchantId(req), {
      page,
      limit,
      type,
      status,
      subAccountId,
      fromDate,
      toDate,
    });
  }

  @Get('banks')
  @ApiOperation({ summary: 'Get list of supported banks' })
  @ApiResponse({ status: 200, description: 'List of banks' })
  async getBanks() {
    return this.merchantBankService.getBanks();
  }

  @Post('name-enquiry')
  @ApiOperation({ summary: 'Perform bank account name enquiry' })
  @ApiResponse({ status: 200, description: 'Account details found' })
  async nameEnquiry(@Req() req: Request, @Body() dto: MerchantNameEnquiryDto) {
    return this.merchantBankService.nameEnquiry(this.getMerchantId(req), dto);
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Transfer funds from my account' })
  @ApiResponse({ status: 201, description: 'Transfer initiated' })
  async transfer(@Req() req: Request, @Body() dto: MerchantTransferDto) {
    return this.merchantBankService.transfer(this.getMerchantId(req), dto);
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
      this.getMerchantId(req),
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
      this.getMerchantId(req),
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
      this.getMerchantId(req),
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
      this.getMerchantId(req),
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
      this.getMerchantId(req),
      dto,
    );
  }
}
