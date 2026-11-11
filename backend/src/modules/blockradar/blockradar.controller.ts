import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { BlockRadarService } from './blockradar.service';
import { GenerateAddressDto } from './dto/generate-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { WhitelistAddressDto } from './dto/whitelist-address.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { DepositFinderDto } from './dto/deposit-finder.dto';
import { WithdrawMasterWalletDto } from './dto/withdraw-master.dto';
import { WithdrawChildAddressDto } from './dto/withdraw-child.dto';
import { NetworkFeeDto } from './dto/network-fee.dto';
import { WithdrawFiatDto } from './dto/withdraw-fiat.dto';
import { WithdrawFiatQuoteDto } from './dto/withdraw-fiat-quote.dto';
import { AddAssetDto } from './dto/add-asset.dto';
import { ResendWebhookDto } from './dto/resend-webhook.dto';
import { CreateMasterVirtualAccountDto } from './dto/create-master-virtual-account.dto';
import { CreateChildVirtualAccountDto } from './dto/create-child-virtual-account.dto';
import { UpdateVirtualAccountDto } from './dto/update-virtual-account.dto';
import { SwapQuoteDto } from './dto/swap-quote.dto';
import { SwapExecuteDto } from './dto/swap-execute.dto';

@ApiTags('BlockRadar')
@Controller('blockradar')
export class BlockRadarController {
  constructor(private readonly blockRadarService: BlockRadarService) {}

  // ─────────────────────────────────────────────────────
  // MASTER WALLET
  // ─────────────────────────────────────────────────────

  @Get('wallet/:walletId')
  @ApiOperation({ summary: 'Get details of a specific wallet' })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiQuery({ name: 'showPrivateKey', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Wallet details returned' })
  async getWallet(
    @Param('walletId') walletId: string,
    @Query('showPrivateKey') showPrivateKey?: boolean,
  ) {
    return this.blockRadarService.getWallet(walletId, showPrivateKey);
  }

  @Patch('wallet')
  @ApiOperation({
    summary: 'Update wallet settings (name, webhookUrl, webhookSecret)',
  })
  @ApiResponse({ status: 200, description: 'Wallet updated' })
  async updateWallet(@Body() dto: UpdateWalletDto) {
    return this.blockRadarService.updateWallet(dto);
  }

  @Get('wallet/balance')
  @ApiOperation({
    summary: 'Get master wallet balance for a specific blockchain/asset',
  })
  @ApiQuery({ name: 'blockchain', required: false })
  @ApiQuery({ name: 'asset', required: false })
  @ApiResponse({ status: 200, description: 'Balance returned' })
  async getWalletBalance(
    @Query('blockchain') blockchain?: string,
    @Query('asset') asset?: string,
  ) {
    return this.blockRadarService.getWalletBalance(blockchain, asset);
  }

  @Get('wallet/balances')
  @ApiOperation({ summary: 'Get all asset balances in the master wallet' })
  @ApiResponse({ status: 200, description: 'All wallet balances returned' })
  async getWalletBalances() {
    return this.blockRadarService.getWalletBalances();
  }

  @Post('wallet/deposit-finder')
  @ApiOperation({
    summary: 'Find a deposit transaction by txHash on a given blockchain',
  })
  @ApiResponse({ status: 200, description: 'Deposit transaction found' })
  async depositFinder(@Body() dto: DepositFinderDto) {
    return this.blockRadarService.depositFinder(dto);
  }

  @Post('wallet/sweep')
  @ApiOperation({
    summary: 'Trigger a sweep of all child-address assets to master wallet',
  })
  @ApiResponse({ status: 200, description: 'Sweep triggered' })
  async triggerSweep() {
    return this.blockRadarService.triggerSweep();
  }

  @Get('wallet/webhooks/logs')
  @ApiOperation({ summary: 'Get webhook delivery logs for the master wallet' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Webhook logs returned' })
  async getWalletWebhookLogs(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.blockRadarService.getWalletWebhookLogs(page, limit);
  }

  // ─────────────────────────────────────────────────────
  // ADDRESSES
  // ─────────────────────────────────────────────────────

  @Get('addresses')
  @ApiOperation({ summary: 'List all generated CRM addresses' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'blockchain', required: false })
  @ApiQuery({ name: 'asset', required: false })
  @ApiResponse({ status: 200, description: 'Address list returned' })
  async getAddresses(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('blockchain') blockchain?: string,
    @Query('asset') asset?: string,
  ) {
    return this.blockRadarService.getAddresses({
      page,
      limit,
      blockchain,
      asset,
    });
  }

  @Post('addresses')
  @ApiOperation({
    summary: 'Generate a new crypto address (virtual account / CRM address)',
  })
  @ApiResponse({ status: 201, description: 'Address generated' })
  async generateAddress(@Body() dto: GenerateAddressDto) {
    return this.blockRadarService.generateAddress(dto);
  }

  @Get('addresses/:address')
  @ApiOperation({ summary: 'Get details of a specific generated address' })
  @ApiParam({ name: 'address', description: 'Crypto address' })
  @ApiResponse({ status: 200, description: 'Address details returned' })
  async getAddress(@Param('address') address: string) {
    return this.blockRadarService.getAddress(address);
  }

  @Patch('addresses/:address')
  @ApiOperation({
    summary: 'Update callbackUrl / name / metadata for an address',
  })
  @ApiParam({ name: 'address', description: 'Crypto address' })
  @ApiResponse({ status: 200, description: 'Address updated' })
  async updateAddress(
    @Param('address') address: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.blockRadarService.updateAddress(address, dto);
  }

  @Post('addresses/whitelist')
  @ApiOperation({ summary: 'Add an address to the withdrawal whitelist' })
  @ApiResponse({ status: 201, description: 'Address whitelisted' })
  async whitelistAddress(@Body() dto: WhitelistAddressDto) {
    return this.blockRadarService.whitelistAddress(dto.address);
  }

  @Delete('addresses/whitelist/:address')
  @ApiOperation({ summary: 'Remove an address from the withdrawal whitelist' })
  @ApiParam({
    name: 'address',
    description: 'Crypto address to remove from whitelist',
  })
  @ApiResponse({ status: 200, description: 'Address removed from whitelist' })
  async unwhitelistAddress(@Param('address') address: string) {
    return this.blockRadarService.unwhitelistAddress(address);
  }

  @Get('addresses/:address/balance')
  @ApiOperation({
    summary: 'Get balance of a specific address for a blockchain/asset',
  })
  @ApiParam({ name: 'address', description: 'Crypto address' })
  @ApiQuery({ name: 'blockchain', required: false })
  @ApiQuery({ name: 'asset', required: false })
  @ApiResponse({ status: 200, description: 'Address balance returned' })
  async getAddressBalance(
    @Param('address') address: string,
    @Query('blockchain') blockchain?: string,
    @Query('asset') asset?: string,
  ) {
    return this.blockRadarService.getAddressBalance(address, blockchain, asset);
  }

  @Get('addresses/:address/balances')
  @ApiOperation({ summary: 'Get all asset balances for a specific address' })
  @ApiParam({ name: 'address', description: 'Crypto address' })
  @ApiResponse({ status: 200, description: 'All address balances returned' })
  async getAddressBalances(@Param('address') address: string) {
    return this.blockRadarService.getAddressBalances(address);
  }

  @Get('wallet/:walletId/addresses/:addressId/transactions')
  @ApiOperation({ summary: 'Get all transactions for a specific CRM address' })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiParam({ name: 'addressId', description: 'Address ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Address transactions returned' })
  async getAddressTransactions(
    @Param('walletId') walletId: string,
    @Param('addressId') addressId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.blockRadarService.getAddressTransactions(
      walletId,
      addressId,
      page,
      limit,
    );
  }

  // ─────────────────────────────────────────────────────
  // WITHDRAW (CRYPTO)
  // ─────────────────────────────────────────────────────

  @Post('withdraw/master/network-fee')
  @ApiOperation({
    summary: 'Estimate network fee for a master wallet withdrawal',
  })
  @ApiResponse({ status: 200, description: 'Network fee estimate returned' })
  async getMasterNetworkFee(@Body() dto: NetworkFeeDto) {
    return this.blockRadarService.getMasterNetworkFee(dto);
  }

  @Post('withdraw/master')
  @ApiOperation({
    summary: 'Withdraw crypto from the master wallet to an external address',
  })
  @ApiResponse({ status: 200, description: 'Withdrawal initiated' })
  async withdrawMasterWallet(@Body() dto: WithdrawMasterWalletDto) {
    return this.blockRadarService.withdrawMasterWallet(dto);
  }

  @Post('withdraw/child/network-fee')
  @ApiOperation({
    summary: 'Estimate network fee for a child address withdrawal',
  })
  @ApiResponse({ status: 200, description: 'Network fee estimate returned' })
  async getChildNetworkFee(@Body() dto: NetworkFeeDto) {
    return this.blockRadarService.getChildNetworkFee(dto);
  }

  @Post('withdraw/child')
  @ApiOperation({
    summary:
      'Withdraw crypto from a specific child address to an external address',
  })
  @ApiResponse({ status: 200, description: 'Withdrawal initiated' })
  async withdrawChildAddress(@Body() dto: WithdrawChildAddressDto) {
    return this.blockRadarService.withdrawChildAddress(dto);
  }

  // ─────────────────────────────────────────────────────
  // WITHDRAW FIAT
  // ─────────────────────────────────────────────────────

  @Get('fiat/assets')
  @ApiOperation({ summary: 'Get list of assets supported for fiat withdrawal' })
  @ApiResponse({ status: 200, description: 'Fiat-supported assets returned' })
  async getFiatAssets() {
    return this.blockRadarService.getFiatAssets();
  }

  @Get('fiat/institutions')
  @ApiOperation({
    summary: 'Get supported financial institutions for fiat withdrawal',
  })
  @ApiQuery({ name: 'countryCode', required: false, example: 'NG' })
  @ApiResponse({ status: 200, description: 'Institution list returned' })
  async getFiatInstitutions(@Query('countryCode') countryCode?: string) {
    return this.blockRadarService.getFiatInstitutions(countryCode);
  }

  @Get('fiat/exchange-rates')
  @ApiOperation({ summary: 'Get exchange rates for crypto → fiat conversions' })
  @ApiQuery({ name: 'fromAsset', required: false, example: 'USDT' })
  @ApiQuery({ name: 'toAsset', required: false, example: 'NGN' })
  @ApiResponse({ status: 200, description: 'Exchange rates returned' })
  async getFiatExchangeRates(
    @Query('fromAsset') fromAsset?: string,
    @Query('toAsset') toAsset?: string,
  ) {
    return this.blockRadarService.getFiatExchangeRates(fromAsset, toAsset);
  }

  @Post('fiat/quote')
  @ApiOperation({ summary: 'Get a fiat withdrawal quote' })
  @ApiResponse({ status: 201, description: 'Quote returned' })
  async getFiatQuote(@Body() dto: WithdrawFiatQuoteDto) {
    return this.blockRadarService.getFiatQuote(dto);
  }

  @Post('fiat/withdraw')
  @ApiOperation({
    summary: 'Execute a fiat withdrawal using a confirmed quote',
  })
  @ApiResponse({ status: 201, description: 'Fiat withdrawal initiated' })
  async withdrawFiat(@Body() dto: WithdrawFiatDto) {
    return this.blockRadarService.withdrawFiat(dto);
  }

  // ─────────────────────────────────────────────────────
  // ASSET MANAGEMENT
  // ─────────────────────────────────────────────────────

  @Get('assets')
  @ApiOperation({ summary: 'Get all assets tracked by the wallet' })
  @ApiResponse({ status: 200, description: 'Asset list returned' })
  async getWalletAssets() {
    return this.blockRadarService.getWalletAssets();
  }

  @Post('assets')
  @ApiOperation({
    summary: 'Add a new asset to the wallet by contract address',
  })
  @ApiResponse({ status: 201, description: 'Asset added to wallet' })
  async addAsset(@Body() dto: AddAssetDto) {
    return this.blockRadarService.addAsset(dto);
  }

  @Get('assets/rate/USDT')
  @ApiOperation({ summary: 'Get the rate of USDT against cNGN' })
  @ApiResponse({ status: 200, description: 'Rate returned' })
  async getUSDTRate() {
    return this.blockRadarService.getUSDTRate();
  }

  @Get('assets/rate/cNGN')
  @ApiOperation({ summary: 'Get the rate of cNGN against USDT' })
  @ApiResponse({ status: 200, description: 'Rate returned' })
  async getCNGNRate() {
    return this.blockRadarService.getCNGNRate();
  }

  // ─────────────────────────────────────────────────────
  // TRANSACTIONS & WEBHOOKS
  // ─────────────────────────────────────────────────────

  @Get('transactions')
  @ApiOperation({ summary: 'Get a paginated list of all wallet transactions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Transaction list returned' })
  async getTransactions(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.blockRadarService.getTransactions(page, limit);
  }

  @Post('transactions/resend-webhook/:walletId')
  @ApiOperation({
    summary: 'Resend a webhook notification for a specific transaction',
  })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiResponse({ status: 200, description: 'Webhook resent' })
  async resendWebhook(
    @Param('walletId') walletId: string,
    @Body() dto: ResendWebhookDto,
  ) {
    return this.blockRadarService.resendWebhook(walletId, dto.id);
  }

  @Get('transactions/webhooks/logs')
  @ApiOperation({ summary: 'Get webhook delivery logs for all transactions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Transaction webhook logs returned',
  })
  async getTransactionWebhookLogs(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.blockRadarService.getTransactionWebhookLogs(page, limit);
  }

  // ─────────────────────────────────────────────────────
  // VIRTUAL ACCOUNTS – MASTER WALLET
  // ─────────────────────────────────────────────────────

  @Get('wallet/:walletId/virtual-accounts')
  @ApiOperation({ summary: 'List all virtual accounts on the master wallet' })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiResponse({ status: 200, description: 'Virtual accounts returned' })
  async getMasterVirtualAccounts(@Param('walletId') walletId: string) {
    return this.blockRadarService.getMasterVirtualAccounts(walletId);
  }

  @Post('wallet/:walletId/virtual-accounts')
  @ApiOperation({
    summary: 'Create a virtual account (NGN bank account) on the master wallet',
  })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiResponse({ status: 201, description: 'Virtual account created' })
  async createMasterVirtualAccount(
    @Param('walletId') walletId: string,
    @Body() dto: CreateMasterVirtualAccountDto,
  ) {
    return this.blockRadarService.createMasterVirtualAccount(walletId, dto);
  }

  @Get('wallet/:walletId/virtual-accounts/:vId')
  @ApiOperation({ summary: 'Get a single master wallet virtual account' })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiParam({ name: 'vId', description: 'Virtual account ID' })
  @ApiResponse({ status: 200, description: 'Virtual account details returned' })
  async getMasterVirtualAccount(
    @Param('walletId') walletId: string,
    @Param('vId') vId: string,
  ) {
    return this.blockRadarService.getMasterVirtualAccount(walletId, vId);
  }

  @Patch('wallet/:walletId/virtual-accounts/:vId')
  @ApiOperation({
    summary: 'Enable or disable a master wallet virtual account',
  })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiParam({ name: 'vId', description: 'Virtual account ID' })
  @ApiResponse({ status: 200, description: 'Virtual account updated' })
  async updateMasterVirtualAccount(
    @Param('walletId') walletId: string,
    @Param('vId') vId: string,
    @Body() dto: UpdateVirtualAccountDto,
  ) {
    return this.blockRadarService.updateMasterVirtualAccount(
      walletId,
      vId,
      dto.isActive,
    );
  }

  @Post('wallet/:walletId/virtual-accounts/:vId/regenerate')
  @ApiOperation({
    summary:
      'Regenerate bank account details for a master wallet virtual account',
  })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiParam({ name: 'vId', description: 'Virtual account ID' })
  @ApiResponse({ status: 200, description: 'Virtual account regenerated' })
  async regenerateMasterVirtualAccount(
    @Param('walletId') walletId: string,
    @Param('vId') vId: string,
  ) {
    return this.blockRadarService.regenerateMasterVirtualAccount(walletId, vId);
  }

  @Get('wallet/:walletId/virtual-accounts/:vId/transactions')
  @ApiOperation({
    summary: 'List transactions for a specific master wallet virtual account',
  })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiParam({ name: 'vId', description: 'Virtual account ID' })
  @ApiResponse({ status: 200, description: 'Transactions returned' })
  async getMasterVirtualAccountTransactions(
    @Param('walletId') walletId: string,
    @Param('vId') vId: string,
  ) {
    return this.blockRadarService.getMasterVirtualAccountTransactions(
      walletId,
      vId,
    );
  }

  // ─────────────────────────────────────────────────────
  // VIRTUAL ACCOUNTS – CHILD ADDRESS
  // ─────────────────────────────────────────────────────

  @Get('wallet/:walletId/addresses/:addressId/virtual-accounts')
  @ApiOperation({
    summary: 'List all virtual accounts linked to a child address',
  })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiParam({ name: 'addressId', description: 'Child address ID' })
  @ApiResponse({ status: 200, description: 'Child virtual accounts returned' })
  async getChildVirtualAccounts(
    @Param('walletId') walletId: string,
    @Param('addressId') addressId: string,
  ) {
    return this.blockRadarService.getChildVirtualAccounts(walletId, addressId);
  }

  @Post('wallet/:walletId/addresses/:addressId/virtual-accounts')
  @ApiOperation({
    summary:
      'Create a virtual account linked to a child address (per-user fiat collection)',
  })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiParam({ name: 'addressId', description: 'Child address ID' })
  @ApiResponse({ status: 201, description: 'Child virtual account created' })
  async createChildVirtualAccount(
    @Param('walletId') walletId: string,
    @Param('addressId') addressId: string,
    @Body() dto: CreateChildVirtualAccountDto,
  ) {
    return this.blockRadarService.createChildVirtualAccount(
      walletId,
      addressId,
      dto,
    );
  }

  @Get('wallet/:walletId/addresses/:addressId/virtual-accounts/:vId')
  @ApiOperation({
    summary: 'Get a single virtual account linked to a child address',
  })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiParam({ name: 'addressId', description: 'Child address ID' })
  @ApiParam({ name: 'vId', description: 'Virtual account ID' })
  @ApiResponse({
    status: 200,
    description: 'Child virtual account details returned',
  })
  async getChildVirtualAccount(
    @Param('walletId') walletId: string,
    @Param('addressId') addressId: string,
    @Param('vId') vId: string,
  ) {
    return this.blockRadarService.getChildVirtualAccount(
      walletId,
      addressId,
      vId,
    );
  }

  @Patch('wallet/:walletId/addresses/:addressId/virtual-accounts/:vId')
  @ApiOperation({
    summary: 'Enable or disable a child address virtual account',
  })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiParam({ name: 'addressId', description: 'Child address ID' })
  @ApiParam({ name: 'vId', description: 'Virtual account ID' })
  @ApiResponse({ status: 200, description: 'Child virtual account updated' })
  async updateChildVirtualAccount(
    @Param('walletId') walletId: string,
    @Param('addressId') addressId: string,
    @Param('vId') vId: string,
    @Body() dto: UpdateVirtualAccountDto,
  ) {
    return this.blockRadarService.updateChildVirtualAccount(
      walletId,
      addressId,
      vId,
      dto.isActive,
    );
  }

  @Post(
    'wallet/:walletId/addresses/:addressId/virtual-accounts/:vId/regenerate',
  )
  @ApiOperation({
    summary:
      'Regenerate bank account details for a child address virtual account',
  })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiParam({ name: 'addressId', description: 'Child address ID' })
  @ApiParam({ name: 'vId', description: 'Virtual account ID' })
  @ApiResponse({
    status: 200,
    description: 'Child virtual account regenerated',
  })
  async regenerateChildVirtualAccount(
    @Param('walletId') walletId: string,
    @Param('addressId') addressId: string,
    @Param('vId') vId: string,
  ) {
    return this.blockRadarService.regenerateChildVirtualAccount(
      walletId,
      addressId,
      vId,
    );
  }

  @Get(
    'wallet/:walletId/addresses/:addressId/virtual-accounts/:vId/transactions',
  )
  @ApiOperation({
    summary: 'List transactions for a specific child address virtual account',
  })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiParam({ name: 'addressId', description: 'Child address ID' })
  @ApiParam({ name: 'vId', description: 'Virtual account ID' })
  @ApiResponse({
    status: 200,
    description: 'Child virtual account transactions returned',
  })
  async getChildVirtualAccountTransactions(
    @Param('walletId') walletId: string,
    @Param('addressId') addressId: string,
    @Param('vId') vId: string,
  ) {
    return this.blockRadarService.getChildVirtualAccountTransactions(
      walletId,
      addressId,
      vId,
    );
  }

  // ─────────────────────────────────────────────────────
  // MISCELLANEOUS
  // ─────────────────────────────────────────────────────

  @Get('misc/assets')
  @ApiOperation({
    summary: 'Get all supported assets (optionally filtered by blockchain)',
  })
  @ApiQuery({ name: 'blockchain', required: false, example: 'ethereum' })
  @ApiResponse({ status: 200, description: 'Supported assets returned' })
  async getSupportedAssets(@Query('blockchain') blockchain?: string) {
    return this.blockRadarService.getSupportedAssets(blockchain);
  }

  @Get('misc/blockchains')
  @ApiOperation({ summary: 'Get all supported blockchain networks' })
  @ApiResponse({ status: 200, description: 'Supported blockchains returned' })
  async getSupportedBlockchains() {
    return this.blockRadarService.getSupportedBlockchains();
  }

  @Get('misc/rates')
  @ApiOperation({
    summary: 'Get current exchange rates for all supported asset pairs',
  })
  @ApiResponse({ status: 200, description: 'Exchange rates returned' })
  async getRates() {
    return this.blockRadarService.getRates();
  }

  // ─────────────────────────────────────────────────────
  // SWAP
  // ─────────────────────────────────────────────────────

  @Post('wallet/:walletId/swap/quote')
  @ApiOperation({
    summary: 'Get a swap quote for two assets within the master wallet',
  })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiResponse({ status: 201, description: 'Swap quote returned' })
  async getMasterSwapQuote(
    @Param('walletId') walletId: string,
    @Body() dto: SwapQuoteDto,
  ) {
    return this.blockRadarService.getMasterSwapQuote(walletId, dto);
  }

  @Post('wallet/:walletId/swap/execute')
  @ApiOperation({
    summary: 'Execute a swap using a confirmed quote on the master wallet',
  })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiResponse({ status: 201, description: 'Swap executed' })
  async executeMasterSwap(
    @Param('walletId') walletId: string,
    @Body() dto: SwapExecuteDto,
  ) {
    return this.blockRadarService.executeMasterSwap(walletId, dto.quoteId);
  }
}
