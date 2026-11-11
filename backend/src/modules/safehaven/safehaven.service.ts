import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { JwtService } from '@nestjs/jwt';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../database/prisma.service';
import { redactSensitiveFields } from '../../utils/pii.util';

@Injectable()
export class MFBService {
  private readonly logger = new Logger(MFBService.name);
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly ibsClientId: string;
  private readonly debitAccountNumber: string;
  private readonly bankCode: string;

  private accessToken: string | null = null;
  private tokenExpiresAt: number | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {
    this.baseUrl = this.configService.get<string>('SAFEHAVEN_BASE_URL')!;
    this.clientId = this.configService.get<string>('SAFEHAVEN_CLIENT_ID')!;
    this.ibsClientId = this.configService.get<string>(
      'SAFEHAVEN_IBS_CLIENT_ID',
    )!;
    this.debitAccountNumber = this.configService.get<string>(
      'SAFEHAVEN_DEBIT_ACCOUNT_NUMBER',
    )!;
    this.bankCode = this.configService.get<string>('SAFEHAVEN_BANK_CODE')!;
  }
  /**
   * Validates a SafeHaven response body for business errors.
   * SafeHaven returns HTTP 200 with error payloads — axios doesn't throw.
   */
  private validateResponse<T>(data: T, context: string): T {
    if (data && typeof data === 'object') {
      const body = data as Record<string, any>;
      if (
        body.statusCode === 400 ||
        body.statusCode >= 400 ||
        (body.responseCode && body.responseCode !== '00')
      ) {
        const rawMessage = body.message || `${context} failed`;
        const message = Array.isArray(rawMessage)
          ? rawMessage.map((m: unknown) => String(m)).join(', ')
          : String(rawMessage);
        const status =
          typeof body.statusCode === 'number' && body.statusCode >= 400
            ? body.statusCode
            : HttpStatus.BAD_REQUEST;
        this.logger.error(
          `SafeHaven ${context} rejected: ${JSON.stringify(redactSensitiveFields(body))}`,
        );
        throw new HttpException(message, status);
      }
    }
    return data;
  }

  /**
   * Safely extract a string message from any error value.
   * Handles arrays, objects, and non-string values from provider responses.
   */
  private toErrorMessage(value: unknown, fallback: string): string {
    if (value == null) return fallback;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  /**
   * Generates or retrieves a valid OAuth2 token.
   */
  async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (
      this.accessToken &&
      this.tokenExpiresAt &&
      now < this.tokenExpiresAt - 60
    ) {
      return this.accessToken;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/oauth2/token`,
          {
            grant_type: 'client_credentials',
            client_id: this.clientId,
            client_assertion: this.ibsClientId,
            client_assertion_type:
              'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
          },
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiresAt = now + (response.data.expires_in || 3600);
      return this.accessToken as string;
    } catch (error) {
      this.logger.error(
        'Failed to generate MFB token',
        error.response?.data || error.message,
      );
      throw new HttpException(
        'Failed to authenticate with MFB',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Creates a sub-account (individual).
   */
  async createSubAccount(data: {
    phoneNumber: string;
    emailAddress: string;
    externalReference: string;
    identityType: 'NIN' | 'vNIN' | 'BVN' | 'BVNUSSD' | 'vID';
    identityNumber?: string;
    identityId?: string;
    otp?: string;
    autoSweep?: boolean;
    callbackUrl?: string;
  }) {
    const token = await this.getAccessToken();
    try {
      const requestBody = {
        phoneNumber: data.phoneNumber,
        emailAddress: data.emailAddress,
        externalReference: data.externalReference,
        identityType: data.identityType,
        identityNumber: data.identityNumber,
        identityId: data.identityId,
        otp: data.otp,
        autoSweep: data.autoSweep ?? false,
        callbackUrl: data.callbackUrl,
      };
      this.logger.log(
        `SafeHaven createSubAccount request: ${JSON.stringify(redactSensitiveFields(requestBody))}`,
      );
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/accounts/v2/subaccount`,
          requestBody,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              ClientID: this.ibsClientId,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          },
        ),
      );
      this.logger.log(
        `SafeHaven createSubAccount response: ${JSON.stringify(redactSensitiveFields(response.data))}`,
      );
      return this.validateResponse(response.data, 'createSubAccount');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        'Failed to create sub-account',
        redactSensitiveFields(error.response?.data || error.message),
      );
      throw new HttpException(
        this.toErrorMessage(
          error.response?.data?.message,
          'Failed to create sub-account',
        ),
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Retrieves the list of banks.
   */
  async getBankList() {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/transfers/banks`, {
          headers: {
            Authorization: `Bearer ${token}`,
            ClientID: this.ibsClientId,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );
      return this.validateResponse(response.data, 'getBankList');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        'Failed to get bank list',
        error.response?.data || error.message,
      );
      throw new HttpException(
        this.toErrorMessage(
          error.response?.data?.message,
          'Failed to retrieve bank list',
        ),
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Creates a virtual account for accepting payments.
   */
  async createVirtualAccount(data: {
    validFor: number;
    callbackUrl: string;
    amount: number;
    amountControl: 'Fixed' | 'UnderPayment' | 'OverPayment';
    bankCode?: string;
    accountNumber?: string;
    externalReference?: string;
  }) {
    this.logger.log(
      `Creating virtual account: amount=${data.amount} NGN, amountControl=${data.amountControl}, validFor=${data.validFor}s, callbackUrl=${data.callbackUrl}`,
    );

    const token = await this.getAccessToken();

    const requestBody = {
      validFor: data.validFor || 3600,
      callbackUrl: data.callbackUrl || null,
      settlementAccount: {
        bankCode: data.bankCode || this.bankCode,
        accountNumber: data.accountNumber || this.debitAccountNumber,
      },
      amountControl: data.amountControl || 'OverPayment',
      amount: data.amount,
      externalReference: data.externalReference,
    };

    this.logger.log(
      `Virtual account request payload: ${JSON.stringify(requestBody)}`,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/virtual-accounts`, requestBody, {
          headers: {
            Authorization: `Bearer ${token}`,
            ClientID: this.ibsClientId,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );

      this.logger.log(
        `Virtual account response: ${JSON.stringify(response.data)}`,
      );

      const account = response.data?.data || response.data;
      this.logger.log(
        `Virtual account created: accountNumber=${account?.accountNumber}, accountName=${account?.accountName}, bankName=${account?.bankName}`,
      );

      return this.validateResponse(response.data, 'createVirtualAccount');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to create virtual account (amount=${data.amount} NGN): ${error.response?.data?.message || error.message}`,
        error.response?.data,
      );
      throw new HttpException(
        this.toErrorMessage(
          error.response?.data?.message,
          'Failed to create virtual account',
        ),
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Performs name enquiry for a bank account.
   */
  async nameEnquiry(bankCode: string, accountNumber: string) {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/transfers/name-enquiry`,
          { bankCode, accountNumber },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              ClientID: this.ibsClientId,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          },
        ),
      );
      return this.validateResponse(response.data, 'nameEnquiry');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const upstreamError =
        error.response?.data || error.message || 'Unknown error';
      this.logger.error(
        `MFB Name Enquiry failed: ${JSON.stringify(upstreamError)}`,
      );
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const message =
        typeof upstreamError === 'object' && upstreamError !== null
          ? upstreamError.message ||
            upstreamError.error ||
            'Name enquiry failed'
          : 'Name enquiry failed';
      throw new HttpException(message, status);
    }
  }

  /**
   * Initiates a funds transfer.
   */
  async transfer(
    data: {
      beneficiaryBankCode: string;
      beneficiaryAccountNumber: string;
      amount: number;
      narration: string;
      paymentReference: string;
      saveBeneficiary?: boolean;
      debitAccountNumber?: string;
      callbackUrl?: string;
    },
    logContext?: {
      transactionId: string;
      type: 'ONRAMP' | 'OFFRAMP';
    },
  ) {
    // 1. Perform Name Enquiry to get sessionId
    const nameEnquiryResult = await this.nameEnquiry(
      data.beneficiaryBankCode,
      data.beneficiaryAccountNumber,
    );
    const sessionId = nameEnquiryResult?.data?.sessionId;
    if (!sessionId) {
      throw new HttpException(
        'Name enquiry did not return a session ID',
        HttpStatus.BAD_REQUEST,
      );
    }

    // 2. Execute Transfer
    const token = await this.getAccessToken();
    const requestBody = {
      nameEnquiryReference: sessionId,
      beneficiaryBankCode: data.beneficiaryBankCode,
      beneficiaryAccountNumber: data.beneficiaryAccountNumber,
      amount: data.amount,
      saveBeneficiary: data.saveBeneficiary || false,
      narration: data.narration,
      debitAccountNumber: data.debitAccountNumber || this.debitAccountNumber,
      // Forward our internal reference so SafeHaven echoes it back in
      // webhooks + status lookups (paymentReference is the correlatable field).
      ...(data.paymentReference
        ? { paymentReference: data.paymentReference }
        : {}),
      ...(data.callbackUrl ? { callbackUrl: data.callbackUrl } : {}),
    };
    this.logger.log(`MFB transfer request: ${JSON.stringify(requestBody)}`);
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/transfers`, requestBody, {
          headers: {
            Authorization: `Bearer ${token}`,
            ClientID: this.ibsClientId,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );

      // MFB can return HTTP 200 with business errors in the body
      const body = response.data;
      if (
        body &&
        (body.statusCode === 400 ||
          (body.responseCode && body.responseCode !== '00'))
      ) {
        this.logger.error(
          `MFB Transfer rejected by API: ${JSON.stringify(body)}`,
        );

        if (logContext) {
          await this.prisma.safeHavenStablestackLog.create({
            data: {
              transactionId: logContext.transactionId,
              type: logContext.type,
              safehavenPayload: requestBody as any,
              stablestackPayload: body,
              status: 'FAILED',
            },
          });
        }

        throw new HttpException(
          body.message || 'Transfer rejected by MFB',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (logContext) {
        await this.prisma.safeHavenStablestackLog.create({
          data: {
            transactionId: logContext.transactionId,
            type: logContext.type,
            safehavenPayload: requestBody as any,
            stablestackPayload: body,
            status: 'COMPLETED',
          },
        });
      }

      return body;
    } catch (error) {
      this.logger.error(
        'MFB Transfer failed',
        error.response?.data || error.message,
      );

      if (logContext) {
        try {
          await this.prisma.safeHavenStablestackLog.create({
            data: {
              transactionId: logContext.transactionId,
              type: logContext.type,
              safehavenPayload: requestBody as any,
              stablestackPayload: error.response?.data || {
                error: error.message,
              },
              status: 'FAILED',
            },
          });
        } catch (logError) {
          this.logger.error('Failed to log MFB transfer', logError);
        }
      }

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        this.toErrorMessage(error.response?.data?.message, 'Transfer failed'),
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Creates a new account under the profile.
   */
  async createAccount(data: {
    accountType: 'Savings' | 'Current';
    suffix: string;
    metadata?: any;
  }) {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/accounts`,
          {
            accountType: data.accountType,
            suffix: data.suffix,
            metadata: data.metadata,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              ClientID: this.ibsClientId,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          },
        ),
      );
      return this.validateResponse(response.data, 'createAccount');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        'Failed to create account',
        error.response?.data || error.message,
      );
      throw new HttpException(
        this.toErrorMessage(
          error.response?.data?.message,
          'Failed to create account',
        ),
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Initiates identity verification.
   */
  async initiateVerification(data: {
    type: 'BVN' | 'NIN' | 'vNIN' | 'BVNUSSD' | 'CAC' | 'CREDITCHECK';
    number: string;
    debitAccountNumber: string;
    otp?: string; // Only for BVNUSSD
    verifierId?: string; // Only for vNIN
    provider?: string; // Only for CREDITCHECK
    async?: boolean; // Only for CREDITCHECK
  }) {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/identity/v2`,
          {
            type: data.type,
            number: data.number,
            debitAccountNumber: data.debitAccountNumber,
            otp: data.otp,
            verifierId: data.verifierId,
            provider: data.provider,
            async: data.async ?? false,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              ClientID: this.ibsClientId,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          },
        ),
      );
      return this.validateResponse(response.data, 'initiateVerification');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        'Failed to initiate verification',
        redactSensitiveFields(error.response?.data || error.message),
      );
      throw new HttpException(
        this.toErrorMessage(
          error.response?.data?.message,
          'Failed to initiate verification',
        ),
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Validates identity verification.
   */
  async validateVerification(data: {
    identityId: string;
    type: 'BVN' | 'NIN';
    otp: string;
  }) {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/identity/v2/validate`,
          {
            identityId: data.identityId,
            type: data.type,
            otp: data.otp,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              ClientID: this.ibsClientId,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          },
        ),
      );
      return this.validateResponse(response.data, 'validateVerification');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to validate verification: ${JSON.stringify(error.response?.data || error.message || 'Unknown error')}`,
      );
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const upstreamError = error.response?.data || error.message;
      const message =
        typeof upstreamError === 'object' && upstreamError !== null
          ? upstreamError.message ||
            upstreamError.error ||
            'Failed to validate verification'
          : 'Failed to validate verification';
      throw new HttpException(message, status);
    }
  }
  async getSubAccounts(
    page: number = 0,
    limit: number = 100,
    isSubAccount: boolean = true,
  ) {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/accounts`, {
          params: { page, limit, isSubAccount },
          headers: {
            Authorization: `Bearer ${token}`,
            ClientID: this.ibsClientId,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );
      return this.validateResponse(response.data, 'getSubAccounts');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to fetch sub-accounts: ${JSON.stringify(error.response?.data || error.message || 'Unknown error')}`,
      );
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const upstreamError = error.response?.data || error.message;
      const message =
        typeof upstreamError === 'object' && upstreamError !== null
          ? upstreamError.message ||
            upstreamError.error ||
            'Failed to fetch sub-accounts'
          : 'Failed to fetch sub-accounts';
      throw new HttpException(message, status);
    }
  }

  /**
   * Fetch a single sub-account by its MFB _id.
   */
  async getSubAccount(subAccountId: string) {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/accounts/${subAccountId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            ClientID: this.ibsClientId,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );
      return this.validateResponse(response.data, 'getSubAccount');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to fetch sub-account ${subAccountId}: ${JSON.stringify(error.response?.data || error.message || 'Unknown error')}`,
      );
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const upstreamError = error.response?.data || error.message;
      const message =
        typeof upstreamError === 'object' && upstreamError !== null
          ? upstreamError.message ||
            upstreamError.error ||
            'Failed to fetch sub-account'
          : 'Failed to fetch sub-account';
      throw new HttpException(message, status);
    }
  }

  /**
   * Updates a sub-account (e.g. toggle autoSweep).
   * PUT /accounts/{id}/subaccount
   */
  async updateSubAccount(
    subAccountId: string,
    data: {
      phoneNumber: string;
      emailAddress: string;
      externalReference: string;
      identityType: 'NIN' | 'vNIN' | 'BVN' | 'BVNUSSD' | 'vID';
      identityNumber?: string;
      identityId?: string;
      otp?: string;
      metadata?: Record<string, unknown>;
      autoSweep?: boolean;
      autoSweepDetails?: {
        schedule?: string;
        accountNumber?: string;
        callbackUrl?: string;
      };
      callbackUrl?: string;
    },
  ) {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.put(
          `${this.baseUrl}/accounts/${subAccountId}/subaccount`,
          {
            phoneNumber: data.phoneNumber,
            emailAddress: data.emailAddress,
            externalReference: data.externalReference,
            identityType: data.identityType,
            identityNumber: data.identityNumber,
            identityId: data.identityId,
            otp: data.otp,
            metadata: data.metadata,
            autoSweep: data.autoSweep,
            ...(data.autoSweepDetails?.schedule &&
            data.autoSweepDetails?.accountNumber
              ? { autoSweepDetails: data.autoSweepDetails }
              : {}),
            callbackUrl: data.callbackUrl,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              ClientID: this.ibsClientId,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          },
        ),
      );
      return this.validateResponse(response.data, 'updateSubAccount');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to update sub-account ${subAccountId}: ${JSON.stringify(error.response?.data || error.message || 'Unknown error')}`,
      );
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const upstreamError = error.response?.data || error.message;
      const message =
        typeof upstreamError === 'object' && upstreamError !== null
          ? upstreamError.message ||
            upstreamError.error ||
            'Failed to update sub-account'
          : 'Failed to update sub-account';
      throw new HttpException(message, status);
    }
  }

  /**
   * Single-transfer status lookup via POST /transfers/status.
   * Accepts either the provider sessionId or the paymentReference we sent
   * at initiation time. This is the reliable correlatable lookup — prefer
   * it over the date-windowed GET /transfers list scan.
   */
  async getTransferStatus(params: {
    sessionId?: string;
    paymentReference?: string;
  }) {
    if (!params.sessionId && !params.paymentReference) {
      throw new HttpException(
        'Either sessionId or paymentReference is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/transfers/status`, params, {
          headers: {
            Authorization: `Bearer ${token}`,
            ClientID: this.ibsClientId,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );
      return this.validateResponse(response.data, 'getTransferStatus');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to fetch transfer status: ${JSON.stringify(error.response?.data || error.message || 'Unknown error')}`,
      );
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const upstreamError = error.response?.data || error.message;
      const message =
        typeof upstreamError === 'object' && upstreamError !== null
          ? upstreamError.message ||
            upstreamError.error ||
            'Failed to fetch transfer status'
          : 'Failed to fetch transfer status';
      throw new HttpException(message, status);
    }
  }

  async getTransfers(params: {
    accountId?: string;
    page?: number;
    limit?: number;
    status?: string;
    accountNumber?: string;
    fromDate?: string;
    toDate?: string;
  }) {
    const token = await this.getAccessToken();
    const queryParams = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null),
    );
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/transfers`, {
          params: queryParams,
          headers: {
            Authorization: `Bearer ${token}`,
            ClientID: this.ibsClientId,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );
      return this.validateResponse(response.data, 'getTransfers');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to fetch transfers: ${JSON.stringify(error.response?.data || error.message || 'Unknown error')}`,
      );
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const upstreamError = error.response?.data || error.message;
      const message =
        typeof upstreamError === 'object' && upstreamError !== null
          ? upstreamError.message ||
            upstreamError.error ||
            'Failed to fetch transfers'
          : 'Failed to fetch transfers';
      throw new HttpException(message, status);
    }
  }

  // ─── VAS Methods ──────────────────────────────────────────────

  async getVasServices() {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/vas/services`, {
          headers: {
            Authorization: `Bearer ${token}`,
            ClientID: this.ibsClientId,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );
      return this.validateResponse(response.data, 'getVasServices');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to fetch VAS services: ${JSON.stringify(error.response?.data || error.message)}`,
      );
      throw new HttpException(
        this.toErrorMessage(
          error.response?.data?.message,
          'Failed to fetch VAS services',
        ),
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getVasService(serviceId: string) {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/vas/service/${serviceId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            ClientID: this.ibsClientId,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );
      return this.validateResponse(response.data, 'getVasService');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to fetch VAS service ${serviceId}: ${JSON.stringify(error.response?.data || error.message)}`,
      );
      throw new HttpException(
        this.toErrorMessage(
          error.response?.data?.message,
          'Failed to fetch VAS service',
        ),
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getVasServiceCategories(serviceId: string) {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/vas/service/${serviceId}/service-categories`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              ClientID: this.ibsClientId,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          },
        ),
      );
      return this.validateResponse(response.data, 'getVasServiceCategories');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to fetch VAS categories for service ${serviceId}: ${JSON.stringify(error.response?.data || error.message)}`,
      );
      throw new HttpException(
        this.toErrorMessage(
          error.response?.data?.message,
          'Failed to fetch VAS categories',
        ),
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getVasCategoryProducts(categoryId: string) {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/vas/service-category/${categoryId}/products`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              ClientID: this.ibsClientId,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          },
        ),
      );
      return this.validateResponse(response.data, 'getVasCategoryProducts');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to fetch VAS products for category ${categoryId}: ${JSON.stringify(error.response?.data || error.message)}`,
      );
      throw new HttpException(
        this.toErrorMessage(
          error.response?.data?.message,
          'Failed to fetch VAS products',
        ),
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async verifyVasEntity(data: {
    serviceCategoryId: string;
    entityNumber: string;
  }) {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/vas/verify`, data, {
          headers: {
            Authorization: `Bearer ${token}`,
            ClientID: this.ibsClientId,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );
      return this.validateResponse(response.data, 'verifyVasEntity');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to verify VAS entity: ${JSON.stringify(error.response?.data || error.message)}`,
      );
      throw new HttpException(
        this.toErrorMessage(
          error.response?.data?.message,
          'Verification failed',
        ),
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async payAirtime(data: {
    serviceCategoryId: string;
    amount: number;
    channel: string;
    debitAccountNumber: string;
    phoneNumber: string;
    externalReference?: string;
    statusUrl?: string;
  }) {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/vas/pay/airtime`, data, {
          headers: {
            Authorization: `Bearer ${token}`,
            ClientID: this.ibsClientId,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );
      return this.validateResponse(response.data, 'payAirtime');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to purchase airtime: ${JSON.stringify(error.response?.data || error.message)}`,
      );
      throw new HttpException(
        this.toErrorMessage(
          error.response?.data?.message,
          'Airtime purchase failed',
        ),
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async payData(data: {
    serviceCategoryId: string;
    bundleCode: string;
    amount: number;
    channel: string;
    debitAccountNumber: string;
    phoneNumber: string;
    externalReference?: string;
    statusUrl?: string;
  }) {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/vas/pay/data`, data, {
          headers: {
            Authorization: `Bearer ${token}`,
            ClientID: this.ibsClientId,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );
      return this.validateResponse(response.data, 'payData');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to purchase data bundle: ${JSON.stringify(error.response?.data || error.message)}`,
      );
      throw new HttpException(
        this.toErrorMessage(
          error.response?.data?.message,
          'Data bundle purchase failed',
        ),
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async payCableTv(data: {
    serviceCategoryId: string;
    bundleCode: string;
    amount: number;
    channel: string;
    debitAccountNumber: string;
    cardNumber: string;
    externalReference?: string;
  }) {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/vas/pay/cable-tv`, data, {
          headers: {
            Authorization: `Bearer ${token}`,
            ClientID: this.ibsClientId,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );
      return this.validateResponse(response.data, 'payCableTv');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to purchase cable TV: ${JSON.stringify(error.response?.data || error.message)}`,
      );
      throw new HttpException(
        this.toErrorMessage(
          error.response?.data?.message,
          'Cable TV purchase failed',
        ),
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async payUtility(data: {
    serviceCategoryId: string;
    amount: number;
    channel: string;
    debitAccountNumber: string;
    meterNumber: string;
    vendType: string;
    externalReference?: string;
  }) {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/vas/pay/utility`, data, {
          headers: {
            Authorization: `Bearer ${token}`,
            ClientID: this.ibsClientId,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );
      return this.validateResponse(response.data, 'payUtility');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to pay utility bill: ${JSON.stringify(error.response?.data || error.message)}`,
      );
      throw new HttpException(
        this.toErrorMessage(
          error.response?.data?.message,
          'Utility payment failed',
        ),
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getVasTransactions() {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/vas/transactions`, {
          headers: {
            Authorization: `Bearer ${token}`,
            ClientID: this.ibsClientId,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );
      return this.validateResponse(response.data, 'getVasTransactions');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to fetch VAS transactions: ${JSON.stringify(error.response?.data || error.message)}`,
      );
      throw new HttpException(
        this.toErrorMessage(
          error.response?.data?.message,
          'Failed to fetch VAS transactions',
        ),
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getVasTransaction(id: string) {
    const token = await this.getAccessToken();
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/vas/transaction/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            ClientID: this.ibsClientId,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );
      return this.validateResponse(response.data, 'getVasTransaction');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Failed to fetch VAS transaction ${id}: ${JSON.stringify(error.response?.data || error.message)}`,
      );
      throw new HttpException(
        this.toErrorMessage(
          error.response?.data?.message,
          'Failed to fetch VAS transaction',
        ),
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
