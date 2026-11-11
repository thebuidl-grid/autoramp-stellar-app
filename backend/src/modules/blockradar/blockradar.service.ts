import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class BlockRadarService {
  private readonly logger = new Logger(BlockRadarService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl =
      this.configService.get<string>('BLOCKRADAR_BASE_URL') ||
      'https://api.blockradar.co/v1';
    this.apiKey = this.configService.get<string>('BLOCKRADAR_API_KEY')!;
  }

  private getHeaders(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  private handleError(context: string, error: any): never {
    this.logger.error(
      `[BlockRadar] ${context}: ${error.response?.data?.message || error.message}`,
      error.response?.data,
    );
    throw new HttpException(
      error.response?.data?.message || `BlockRadar ${context} failed`,
      error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  // ─────────────────────────────────────────────────────
  // MASTER WALLET
  // ─────────────────────────────────────────────────────

  /**
   * GET /wallets/{walletId}
   * Retrieve details of a specific wallet.
   */
  async getWallet(walletId: string, showPrivateKey = false) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/wallets/${walletId}`, {
          headers: this.getHeaders(),
          params: { showPrivateKey },
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getWallet', error);
    }
  }

  /**
   * PATCH /wallets
   * Update wallet settings (name, webhookUrl, webhookSecret).
   */
  async updateWallet(data: {
    name?: string;
    webhookUrl?: string;
    webhookSecret?: string;
  }) {
    try {
      const response = await firstValueFrom(
        this.httpService.patch(`${this.baseUrl}/wallets`, data, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('updateWallet', error);
    }
  }

  /**
   * GET /wallets/balance
   * Get master wallet balance for a specific blockchain/asset.
   */
  async getWalletBalance(blockchain?: string, asset?: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/wallets/balance`, {
          headers: this.getHeaders(),
          params: { blockchain, asset },
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getWalletBalance', error);
    }
  }

  /**
   * GET /wallets/balances
   * Get all asset balances in the master wallet.
   */
  async getWalletBalances() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/wallets/balances`, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getWalletBalances', error);
    }
  }

  /**
   * POST /wallets/deposit-finder
   * Locate a deposit transaction by blockchain and txHash.
   */
  async depositFinder(data: { blockchain: string; txHash: string }) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/wallets/deposit-finder`, data, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('depositFinder', error);
    }
  }

  /**
   * POST /wallets/sweep
   * Trigger a sweep of assets to the master wallet.
   */
  async triggerSweep() {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/wallets/sweep`,
          {},
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('triggerSweep', error);
    }
  }

  /**
   * GET /wallets/webhooks/logs
   * Retrieve webhook delivery logs for the master wallet.
   */
  async getWalletWebhookLogs(page = 1, limit = 20) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/wallets/webhooks/logs`, {
          headers: this.getHeaders(),
          params: { page, limit },
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getWalletWebhookLogs', error);
    }
  }

  // ─────────────────────────────────────────────────────
  // ADDRESSES
  // ─────────────────────────────────────────────────────

  /**
   * GET /addresses
   * List all generated addresses (CRM / virtual accounts).
   */
  async getAddresses(params?: {
    page?: number;
    limit?: number;
    blockchain?: string;
    asset?: string;
  }) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/addresses`, {
          headers: this.getHeaders(),
          params: { page: 1, limit: 20, ...params },
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getAddresses', error);
    }
  }

  /**
   * POST /addresses
   * Generate a new crypto address (virtual account / CRM address).
   */
  async generateAddress(data: {
    blockchain: string;
    name?: string;
    callbackUrl?: string;
    metadata?: Record<string, any>;
  }) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/addresses`, data, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('generateAddress', error);
    }
  }

  /**
   * GET /addresses/{address}
   * Get details of a specific generated address.
   */
  async getAddress(address: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/addresses/${address}`, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getAddress', error);
    }
  }

  /**
   * PATCH /addresses/{address}
   * Update metadata/callbackUrl for a specific address.
   */
  async updateAddress(
    address: string,
    data: {
      callbackUrl?: string;
      name?: string;
      metadata?: Record<string, any>;
    },
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.patch(`${this.baseUrl}/addresses/${address}`, data, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('updateAddress', error);
    }
  }

  /**
   * POST /addresses/whitelist
   * Add an address to the withdrawal whitelist.
   */
  async whitelistAddress(address: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/addresses/whitelist`,
          { address },
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('whitelistAddress', error);
    }
  }

  /**
   * DELETE /addresses/whitelist/{address}
   * Remove an address from the withdrawal whitelist.
   */
  async unwhitelistAddress(address: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.delete(
          `${this.baseUrl}/addresses/whitelist/${address}`,
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('unwhitelistAddress', error);
    }
  }

  /**
   * GET /addresses/{address}/balance
   * Get the balance of a specific address for a given blockchain/asset.
   */
  async getAddressBalance(
    address: string,
    blockchain?: string,
    asset?: string,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/addresses/${address}/balance`, {
          headers: this.getHeaders(),
          params: { blockchain, asset },
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getAddressBalance', error);
    }
  }

  /**
   * GET /addresses/{address}/balances
   * Get all asset balances for a specific address.
   */
  async getAddressBalances(address: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/addresses/${address}/balances`, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getAddressBalances', error);
    }
  }

  /**
   * GET /wallets/{walletId}/addresses/{addressId}/transactions
   * Get all transactions for a specific CRM address.
   */
  async getAddressTransactions(
    walletId: string,
    addressId: string,
    page = 1,
    limit = 20,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/wallets/${walletId}/addresses/${addressId}/transactions`,
          {
            headers: this.getHeaders(),
            params: { page, limit },
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('getAddressTransactions', error);
    }
  }

  // ─────────────────────────────────────────────────────
  // WITHDRAW (CRYPTO)
  // ─────────────────────────────────────────────────────

  /**
   * POST /withdraw/master-wallet/network-fee
   * Estimate the network fee for a master wallet withdrawal.
   */
  async getMasterNetworkFee(data: {
    blockchain: string;
    asset: string;
    amount: number;
    to: string;
  }) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/withdraw/master-wallet/network-fee`,
          data,
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('getMasterNetworkFee', error);
    }
  }

  /**
   * POST /withdraw/master-wallet
   * Withdraw crypto from the master wallet to an external address.
   */
  async withdrawMasterWallet(data: {
    blockchain: string;
    asset: string;
    amount: number;
    to: string;
  }) {
    this.logger.log(
      `[BlockRadar] withdrawMasterWallet: ${data.amount} ${data.asset} → ${data.to}`,
    );
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/withdraw/master-wallet`, data, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('withdrawMasterWallet', error);
    }
  }

  /**
   * POST /withdraw/child-address/network-fee
   * Estimate the network fee for a child address withdrawal.
   */
  async getChildNetworkFee(data: {
    blockchain: string;
    asset: string;
    amount: number;
    to: string;
  }) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/withdraw/child-address/network-fee`,
          data,
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('getChildNetworkFee', error);
    }
  }

  /**
   * POST /withdraw/child-address
   * Withdraw crypto from a specific child address to an external address.
   */
  async withdrawChildAddress(data: {
    blockchain: string;
    asset: string;
    amount: number;
    to: string;
    from: string;
  }) {
    this.logger.log(
      `[BlockRadar] withdrawChildAddress: ${data.amount} ${data.asset} from ${data.from} → ${data.to}`,
    );
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/withdraw/child-address`, data, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('withdrawChildAddress', error);
    }
  }

  // ─────────────────────────────────────────────────────
  // WITHDRAW FIAT
  // ─────────────────────────────────────────────────────

  /**
   * GET /withdraw-fiat/assets
   * Get supported assets for fiat withdrawal.
   */
  async getFiatAssets() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/withdraw-fiat/assets`, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getFiatAssets', error);
    }
  }

  /**
   * GET /withdraw-fiat/institutions
   * Get supported financial institutions for fiat withdrawal.
   */
  async getFiatInstitutions(countryCode?: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/withdraw-fiat/institutions`, {
          headers: this.getHeaders(),
          params: countryCode ? { countryCode } : {},
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getFiatInstitutions', error);
    }
  }

  /**
   * GET /withdraw-fiat/exchange-rates
   * Get exchange rates for crypto → fiat conversions.
   */
  async getFiatExchangeRates(fromAsset?: string, toAsset?: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/withdraw-fiat/exchange-rates`, {
          headers: this.getHeaders(),
          params: { fromAsset, toAsset },
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getFiatExchangeRates', error);
    }
  }

  /**
   * POST /withdraw-fiat/quote
   * Get a fiat withdrawal quote.
   */
  async getFiatQuote(data: {
    amount: number;
    fromAsset: string;
    toAsset: string;
  }) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/withdraw-fiat/quote`, data, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getFiatQuote', error);
    }
  }

  /**
   * POST /withdraw-fiat
   * Execute a fiat withdrawal using a confirmed quote.
   */
  async withdrawFiat(data: {
    quoteId: string;
    institutionId: string;
    accountNumber: string;
  }) {
    this.logger.log(
      `[BlockRadar] withdrawFiat: quoteId=${data.quoteId} → account=${data.accountNumber}`,
    );
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/withdraw-fiat`, data, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('withdrawFiat', error);
    }
  }

  // ─────────────────────────────────────────────────────
  // ASSET MANAGEMENT
  // ─────────────────────────────────────────────────────

  /**
   * GET /asset/wallet-assets
   * Get all assets tracked by the wallet.
   */
  async getWalletAssets() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/asset/wallet-assets`, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getWalletAssets', error);
    }
  }

  /**
   * POST /asset/add-asset
   * Add a new asset to the wallet by contract address.
   */
  async addAsset(data: { blockchain: string; assetAddress: string }) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/asset/add-asset`, data, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('addAsset', error);
    }
  }

  // ─────────────────────────────────────────────────────
  // TRANSACTIONS & WEBHOOKS
  // ─────────────────────────────────────────────────────

  /**
   * GET /transactions
   * Get a paginated list of all wallet transactions.
   */
  async getTransactions(page = 1, limit = 20) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/transactions`, {
          headers: this.getHeaders(),
          params: { page, limit },
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getTransactions', error);
    }
  }

  /**
   * POST /wallets/{walletId}/transactions/webhooks/resend
   * Resend a webhook notification for a specific transaction.
   */
  async resendWebhook(walletId: string, transactionId: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/wallets/${walletId}/transactions/webhooks/resend`,
          { id: transactionId },
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('resendWebhook', error);
    }
  }

  /**
   * GET /transactions/webhooks/logs
   * Get webhook delivery logs for all transactions.
   */
  async getTransactionWebhookLogs(page = 1, limit = 20) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/transactions/webhooks/logs`, {
          headers: this.getHeaders(),
          params: { page, limit },
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getTransactionWebhookLogs', error);
    }
  }

  // ─────────────────────────────────────────────────────
  // VIRTUAL ACCOUNTS – MASTER WALLET
  // ─────────────────────────────────────────────────────

  /**
   * GET /wallets/{walletId}/virtual-accounts
   * List all virtual accounts on the master wallet.
   */
  async getMasterVirtualAccounts(walletId: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/wallets/${walletId}/virtual-accounts`,
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('getMasterVirtualAccounts', error);
    }
  }

  /**
   * POST /wallets/{walletId}/virtual-accounts
   * Create a virtual account (NGN bank account) on the master wallet.
   * Users send fiat to this account; Block Radar fires a webhook on receipt.
   */
  async createMasterVirtualAccount(
    walletId: string,
    data: { accountName: string; accountNumber?: string },
  ) {
    this.logger.log(
      `[BlockRadar] createMasterVirtualAccount: walletId=${walletId}, name=${data.accountName}`,
    );
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/wallets/${walletId}/virtual-accounts`,
          data,
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('createMasterVirtualAccount', error);
    }
  }

  /**
   * GET /wallets/{walletId}/virtual-accounts/{vId}
   * Get a single virtual account from the master wallet.
   */
  async getMasterVirtualAccount(walletId: string, vId: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/wallets/${walletId}/virtual-accounts/${vId}`,
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('getMasterVirtualAccount', error);
    }
  }

  /**
   * PATCH /wallets/{walletId}/virtual-accounts/{vId}
   * Enable or disable a master wallet virtual account.
   */
  async updateMasterVirtualAccount(
    walletId: string,
    vId: string,
    isActive: boolean,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.patch(
          `${this.baseUrl}/wallets/${walletId}/virtual-accounts/${vId}`,
          { isActive },
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('updateMasterVirtualAccount', error);
    }
  }

  /**
   * POST /wallets/{walletId}/virtual-accounts/{vId}/regenerate
   * Regenerate the bank account details for a master wallet virtual account.
   */
  async regenerateMasterVirtualAccount(walletId: string, vId: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/wallets/${walletId}/virtual-accounts/${vId}/regenerate`,
          {},
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('regenerateMasterVirtualAccount', error);
    }
  }

  /**
   * GET /wallets/{walletId}/virtual-accounts/{vId}/transactions
   * List transactions for a specific master wallet virtual account.
   */
  async getMasterVirtualAccountTransactions(walletId: string, vId: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/wallets/${walletId}/virtual-accounts/${vId}/transactions`,
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('getMasterVirtualAccountTransactions', error);
    }
  }

  // ─────────────────────────────────────────────────────
  // VIRTUAL ACCOUNTS – CHILD ADDRESS
  // ─────────────────────────────────────────────────────

  /**
   * GET /wallets/{walletId}/addresses/{addressId}/virtual-accounts
   * List all virtual accounts linked to a child address.
   */
  async getChildVirtualAccounts(walletId: string, addressId: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/wallets/${walletId}/addresses/${addressId}/virtual-accounts`,
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('getChildVirtualAccounts', error);
    }
  }

  /**
   * POST /wallets/{walletId}/addresses/{addressId}/virtual-accounts
   * Create a virtual account linked to a child address.
   * This is the preferred approach for per-user fiat collection.
   */
  async createChildVirtualAccount(
    walletId: string,
    addressId: string,
    data: {
      firstname: string;
      lastname: string;
      email: string;
      phone?: string;
    },
  ) {
    this.logger.log(
      `[BlockRadar] createChildVirtualAccount: walletId=${walletId}, addressId=${addressId}, user=${data.firstname} ${data.lastname}`,
    );
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/wallets/${walletId}/addresses/${addressId}/virtual-accounts`,
          data,
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('createChildVirtualAccount', error);
    }
  }

  /**
   * GET /wallets/{walletId}/addresses/{addressId}/virtual-accounts/{vId}
   * Get a single virtual account linked to a child address.
   */
  async getChildVirtualAccount(
    walletId: string,
    addressId: string,
    vId: string,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/wallets/${walletId}/addresses/${addressId}/virtual-accounts/${vId}`,
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('getChildVirtualAccount', error);
    }
  }

  /**
   * PATCH /wallets/{walletId}/addresses/{addressId}/virtual-accounts/{vId}
   * Enable or disable a child address virtual account.
   */
  async updateChildVirtualAccount(
    walletId: string,
    addressId: string,
    vId: string,
    isActive: boolean,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.patch(
          `${this.baseUrl}/wallets/${walletId}/addresses/${addressId}/virtual-accounts/${vId}`,
          { isActive },
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('updateChildVirtualAccount', error);
    }
  }

  /**
   * POST /wallets/{walletId}/addresses/{addressId}/virtual-accounts/{vId}/regenerate
   * Regenerate bank account details for a child address virtual account.
   */
  async regenerateChildVirtualAccount(
    walletId: string,
    addressId: string,
    vId: string,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/wallets/${walletId}/addresses/${addressId}/virtual-accounts/${vId}/regenerate`,
          {},
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('regenerateChildVirtualAccount', error);
    }
  }

  /**
   * GET /wallets/{walletId}/addresses/{addressId}/virtual-accounts/{vId}/transactions
   * List transactions for a specific child address virtual account.
   */
  async getChildVirtualAccountTransactions(
    walletId: string,
    addressId: string,
    vId: string,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/wallets/${walletId}/addresses/${addressId}/virtual-accounts/${vId}/transactions`,
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('getChildVirtualAccountTransactions', error);
    }
  }

  // ─────────────────────────────────────────────────────
  // MISCELLANEOUS
  // ─────────────────────────────────────────────────────

  /**
   * GET /assets
   * Get all supported assets, optionally filtered by blockchain.
   */
  async getSupportedAssets(blockchain?: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/assets`, {
          headers: this.getHeaders(),
          params: blockchain ? { blockchain } : {},
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getSupportedAssets', error);
    }
  }

  /**
   * GET /blockchains
   * Get all supported blockchain networks.
   */
  async getSupportedBlockchains() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/blockchains`, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getSupportedBlockchains', error);
    }
  }

  /**
   * GET /rates
   * Get current exchange rates for all supported asset pairs.
   */
  async getRates() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/rates`, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('getRates', error);
    }
  }

  // ─────────────────────────────────────────────────────
  // SWAP
  // ─────────────────────────────────────────────────────

  /**
   * POST /wallets/{walletId}/swap/quote
   * Get a quote for swapping one asset to another within the master wallet.
   */
  async getMasterSwapQuote(
    walletId: string,
    data: { fromAsset: string; toAsset: string; amount: number },
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/wallets/${walletId}/swap/quote`,
          data,
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('getMasterSwapQuote', error);
    }
  }

  /**
   * POST /wallets/{walletId}/swap/execute
   * Execute a swap using a confirmed quote on the master wallet.
   */
  async executeMasterSwap(walletId: string, quoteId: string) {
    this.logger.log(
      `[BlockRadar] executeMasterSwap: walletId=${walletId}, quoteId=${quoteId}`,
    );
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/wallets/${walletId}/swap/execute`,
          { quoteId },
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('executeMasterSwap', error);
    }
  }

  /**
   * GET /assets/rates?currency=USDT&assets=cNGN
   * Execute a swap using a confirmed quote on the master wallet.
   */
  async getUSDTRate() {
    this.logger.log(`[BlockRadar] getUSDTRate}`);
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/assets/rates?currency=USDT&assets=cNGN`,
          { headers: this.getHeaders() },
        ),
      );
      return { data: response.data?.data?.CNGN?.USDT ?? 0 };
    } catch (error) {
      this.handleError('getUSDTRate', error);
    }
  }

  /**
   * GET /assets/rates?currency=USDT&assets=cNGN
   * Execute a swap using a confirmed quote on the master wallet.
   */
  async getCNGNRate() {
    this.logger.log(`[BlockRadar] getCNGNRate}`);
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/assets/rates?currency=cNGN&assets=USDT`,
        ),
      );
      return { data: response.data?.data?.USDT?.CNGN ?? 0 };
    } catch (error) {
      this.handleError('getCNGNRate', error);
    }
  }
}
