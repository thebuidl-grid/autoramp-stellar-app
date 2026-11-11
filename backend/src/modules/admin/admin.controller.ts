import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
// import { CreateApiKeyDto } from '../api-keys/dto/create-api-key.dto';
import { AdminCreateMerchantDto } from './dto/create-merchant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GetApiKeyStatsDto } from './dto/get-api-key-stats.dto';
import { UpdateMerchantStatusDto } from './dto/update-merchant-status.dto';

/**
 * Admin Controller
 *
 * Handles admin-only endpoints including:
 * - User management
 * - API key management
 *
 * All endpoints require admin authentication.
 */
@ApiTags('Admin')
@Controller()
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth('JWT-auth')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current admin profile' })
  @ApiResponse({
    status: 200,
    description: 'Admin profile retrieved successfully',
  })
  async getMe(@CurrentUser() admin: any) {
    return admin;
  }

  @Get('users')
  @ApiOperation({ summary: 'Get all users (paginated)' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10)',
    example: 10,
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search string (matches email, name, wallet, phone)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'suspended'],
    description: 'Filter by account status',
  })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Admin access required',
  })
  async getUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getUsers(page, limit, search, status);
  }

  @Get('users/:userId')
  @ApiOperation({ summary: 'Get user details by ID' })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'User details retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Admin access required',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async getUserById(@Param('userId') userId: string) {
    return this.adminService.getUserById(userId);
  }

  @Patch('users/:userId/flags')
  @ApiOperation({
    summary:
      "Update user's merchant flags (isMerchant, isApiAccessApproved, isOTCEnabled)",
  })
  @ApiResponse({ status: 200, description: 'User flags updated successfully' })
  async updateUserMerchantFlags(
    @Param('userId') userId: string,
    @Body() body: any,
  ) {
    return this.adminService.updateUserMerchantFlags(userId, body);
  }

  @Post('users')
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  async createUser(@Body() body: any) {
    return this.adminService.createUser(body);
  }

  @Patch('users/:userId/profile')
  @ApiOperation({ summary: "Update user's profile details" })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully',
  })
  async updateUserProfile(@Param('userId') userId: string, @Body() body: any) {
    return this.adminService.updateUserProfile(userId, body);
  }

  @Patch('users/:userId/suspend')
  @ApiOperation({ summary: 'Suspend or unsuspend a user account' })
  @ApiResponse({ status: 200, description: 'User suspension toggled' })
  async suspendUser(
    @Param('userId') userId: string,
    @Body() body: { suspend: boolean },
  ) {
    return this.adminService.suspendUser(userId, body.suspend);
  }

  @Post('approve-access')
  @ApiOperation({ summary: 'Approve merchant API access' })
  @ApiBody({ type: AdminCreateMerchantDto })
  @ApiResponse({
    status: 201,
    description: 'Merchant API access approved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Admin access required',
  })
  async approveMerchant(@Body() dto: AdminCreateMerchantDto) {
    return this.adminService.approveMerchant(dto);
  }

  @Post('merchants/:id/status')
  @ApiOperation({ summary: "Update a merchant's verification status" })
  @ApiParam({ name: 'id', description: 'Merchant ID' })
  @ApiBody({ type: UpdateMerchantStatusDto })
  @ApiResponse({
    status: 200,
    description: 'Merchant status updated successfully',
  })
  async updateMerchantStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMerchantStatusDto,
  ) {
    return this.adminService.updateMerchantStatus(id, dto);
  }

  @Get('merchants/:id/bank-account')
  @ApiOperation({ summary: "Get a merchant's bank account details" })
  @ApiParam({ name: 'id', description: 'Merchant ID' })
  @ApiResponse({ status: 200, description: 'Bank account details' })
  async getMerchantBankAccount(@Param('id') id: string) {
    return this.adminService.getMerchantBankAccount(id);
  }

  @Get('merchants/:id/sub-accounts')
  @ApiOperation({ summary: "Get a merchant's sub-accounts" })
  @ApiParam({ name: 'id', description: 'Merchant ID' })
  @ApiResponse({ status: 200, description: 'Sub-accounts list' })
  async getMerchantSubAccounts(@Param('id') id: string) {
    return this.adminService.getMerchantSubAccounts(id);
  }

  @Get('merchants/:id/sub-accounts/:subAccountId/transactions')
  @ApiOperation({
    summary:
      "Fetch live transactions for a merchant's sub-account from SafeHaven",
  })
  @ApiParam({ name: 'id', description: 'Merchant ID' })
  @ApiParam({ name: 'subAccountId', description: 'Sub-account record ID' })
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
    description: 'Items per page (default: 20)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    type: String,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'toDate',
    required: false,
    type: String,
    description: 'End date (YYYY-MM-DD)',
  })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved from SafeHaven',
  })
  @ApiResponse({ status: 404, description: 'Sub-account not found' })
  async getMerchantSubAccountTransactions(
    @Param('id') merchantId: string,
    @Param('subAccountId') subAccountId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.adminService.getMerchantSubAccountTransactions(
      merchantId,
      subAccountId,
      { page, limit, status, fromDate, toDate },
    );
  }

  @Post('merchants/:id/bank-account')
  @ApiOperation({
    summary: 'Create MFB settlement account for a verified merchant',
  })
  @ApiParam({ name: 'id', description: 'Merchant ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        accountType: {
          type: 'string',
          enum: ['Savings', 'Current'],
          example: 'Current',
        },
        suffix: { type: 'string', example: 'ACME' },
        provider: {
          type: 'string',
          enum: ['SAFEHAVEN', 'PULSE_MFB'],
          description:
            'Fiat provider. Defaults to DEFAULT_FIAT_PROVIDER env var.',
          example: 'PULSE_MFB',
        },
      },
      required: ['accountType', 'suffix'],
    },
  })
  @ApiResponse({ status: 201, description: 'Bank account created' })
  async createMerchantBankAccount(
    @Param('id') id: string,
    @Body()
    dto: {
      accountType: 'Savings' | 'Current';
      suffix: string;
      provider?: string;
    },
  ) {
    return this.adminService.createMerchantBankAccount(id, dto);
  }

  @Get('api-keys/summary')
  @ApiOperation({ summary: 'Get API keys summary statistics' })
  @ApiResponse({
    status: 200,
    description: 'API keys summary retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Admin access required',
  })
  async getApiKeysSummary() {
    return this.adminService.getApiKeysSummary();
  }

  @Get('api-keys/analytics')
  @ApiOperation({ summary: 'Get API keys usage analytics over time' })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['daily', 'weekly', 'monthly'],
    description: 'Time period for grouping (default: daily)',
  })
  @ApiResponse({
    status: 200,
    description: 'API keys analytics retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Admin access required',
  })
  async getApiKeysAnalytics(@Query() query: GetApiKeyStatsDto) {
    return this.adminService.getApiKeysAnalytics(query.period);
  }
  @Get('platform-transactions')
  @ApiOperation({ summary: 'Get all platform transactions (admin only)' })
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
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description:
      'Filter by transaction status (PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED)',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: [
      'onramp',
      'offramp',
      'swap',
      'merchant_onramp',
      'merchant_offramp',
      'merchant_swap',
      'bank_transfer',
      'otc',
      'vas',
    ],
    description: 'Filter by transaction type',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by reference',
  })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved successfully',
  })
  async getTransactions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getAllTransactions(
      page,
      limit,
      status,
      type,
      search,
    );
  }

  @Get('transactions/summary')
  @ApiOperation({ summary: 'Get transaction summary statistics (admin only)' })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['today', '7d', '30d', '90d', 'all'],
    description: 'Time period (default: all)',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction summary retrieved successfully',
  })
  async getTransactionsSummary(
    @Query('period') period?: 'today' | '7d' | '30d' | '90d' | 'all',
  ) {
    return this.adminService.getTransactionsSummary(period || 'all');
  }

  @Get('transactions/analytics')
  @ApiOperation({ summary: 'Get transaction analytics over time (admin only)' })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['daily', 'weekly', 'monthly'],
    description: 'Time period for grouping (default: daily)',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction analytics retrieved successfully',
  })
  async getTransactionsAnalytics(@Query() query: GetApiKeyStatsDto) {
    return this.adminService.getTransactionsAnalytics(query.period);
  }

  @Get('otc/swap-price')
  @ApiOperation({
    summary: 'Get indicative price for OTC swap (Admin proxy for 0x /price)',
  })
  @ApiQuery({ name: 'sellToken', required: true, type: String })
  @ApiQuery({ name: 'buyToken', required: true, type: String })
  @ApiQuery({ name: 'sellAmount', required: true, type: String })
  @ApiQuery({
    name: 'takerAddress',
    required: false,
    type: String,
    description: 'Wallet address executing the trade',
  })
  @ApiQuery({
    name: 'chainId',
    required: false,
    type: String,
    description: 'Chain ID (default: 8453 for Base, use 56 for BSC)',
  })
  @ApiResponse({
    status: 200,
    description: 'Indicative price retrieved successfully',
  })
  async getOtcSwapPrice(
    @Query('sellToken') sellToken: string,
    @Query('buyToken') buyToken: string,
    @Query('sellAmount') sellAmount: string,
    @Query('takerAddress') takerAddress?: string,
    @Query('chainId') chainId?: string,
  ) {
    return this.adminService.getOtcSwapPrice(
      sellToken,
      buyToken,
      sellAmount,
      takerAddress,
      chainId,
    );
  }

  @Get('otc/swap-quote')
  @ApiOperation({
    summary: 'Get firm quote for OTC swap (Admin proxy for 0x /quote)',
  })
  @ApiQuery({ name: 'sellToken', required: true, type: String })
  @ApiQuery({ name: 'buyToken', required: true, type: String })
  @ApiQuery({ name: 'sellAmount', required: true, type: String })
  @ApiQuery({
    name: 'takerAddress',
    required: true,
    type: String,
    description: 'Wallet address executing the trade',
  })
  @ApiQuery({
    name: 'chainId',
    required: false,
    type: String,
    description: 'Chain ID (default: 8453 for Base, use 56 for BSC)',
  })
  @ApiResponse({
    status: 200,
    description: 'Firm quote retrieved successfully',
  })
  async getOtcSwapQuote(
    @Query('sellToken') sellToken: string,
    @Query('buyToken') buyToken: string,
    @Query('sellAmount') sellAmount: string,
    @Query('takerAddress') takerAddress: string,
    @Query('chainId') chainId?: string,
  ) {
    return this.adminService.getOtcSwapQuote(
      sellToken,
      buyToken,
      sellAmount,
      takerAddress,
      chainId,
    );
  }

  @Get('transfer-logs')
  @ApiOperation({
    summary: 'Get all transfer logs (MFB + Stablestack) (admin only)',
  })
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
  @ApiQuery({
    name: 'transactionId',
    required: false,
    type: String,
    description: 'Filter by transaction ID',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by status (PENDING, COMPLETED, FAILED)',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Filter by start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'Filter by end date (YYYY-MM-DD)',
  })
  @ApiResponse({ status: 200, description: 'MFB logs retrieved successfully' })
  async getTransferLogs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('transactionId') transactionId?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getTransferLogs(
      page,
      limit,
      transactionId,
      startDate,
      endDate,
      status,
    );
  }

  @Get('transfer-logs/:transactionId')
  @ApiOperation({
    summary: 'Get transfer log with transaction & user details (admin only)',
  })
  @ApiParam({
    name: 'transactionId',
    description: 'Transaction ID',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Transfer log retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Log not found' })
  async getTransferLogByTransactionId(
    @Param('transactionId') transactionId: string,
  ) {
    return this.adminService.getTransferLogByTransactionId(transactionId);
  }

  @Get('otc/transactions')
  @ApiOperation({ summary: 'Get all OTC transactions (admin only)' })
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
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description:
      'Filter by transaction status (PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED)',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Filter by start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'Filter by end date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by reference or ID',
  })
  @ApiResponse({
    status: 200,
    description: 'OTC Transactions retrieved successfully',
  })
  async getOtcTransactions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getOtcTransactions(
      page,
      limit,
      status,
      startDate,
      endDate,
      search,
    );
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Get audit logs (all or filtered by merchantId)' })
  @ApiQuery({ name: 'merchantId', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved' })
  async getAuditLogs(
    @Query('merchantId') merchantId?: string,
    @Query('action') action?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.adminService.getAuditLogs(merchantId, action, page, limit);
  }

  @Get('safehaven/sub-account-transactions')
  @ApiOperation({
    summary:
      'Fetch live sub-account transactions directly from SafeHaven (admin only)',
  })
  @ApiQuery({
    name: 'accountId',
    required: true,
    type: String,
    description:
      'SafeHaven account _id (the SafeHaven internal ID, not the bank account number)',
  })
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
    description: 'Items per page (default: 20)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    type: String,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'toDate',
    required: false,
    type: String,
    description: 'End date (YYYY-MM-DD)',
  })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved from SafeHaven',
  })
  async getSubAccountTransactions(
    @Query('accountId') accountId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.adminService.getSubAccountTransactions(accountId, {
      page,
      limit,
      status,
      fromDate,
      toDate,
    });
  }
}
