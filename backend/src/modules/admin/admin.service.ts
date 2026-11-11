import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AdminCreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantStatusDto } from './dto/update-merchant-status.dto';
import { MerchantStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { MFBService } from '../safehaven/safehaven.service';
import { FiatProviderService } from '../providers/fiat-provider.service';
import { ProviderType } from '../providers/provider-type.enum';
import { ZeroExService } from '../swap/integrations/zeroex.service';
import { TransactionsService } from './transactions/transactions.service';

/**
 * Admin Service
 *
 * Handles admin-related operations including:
 * - User management
 * - API key management
 * - Transaction oversight
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly safeHavenService: MFBService,
    private readonly fiatProviderService: FiatProviderService,
    private readonly zeroExService: ZeroExService,
    private readonly transactionsService: TransactionsService,
  ) {}

  // ... (existing methods until getUserById)

  /**
   * Approve Merchant API Access (Admin only)
   *
   * Creates or updates a user with merchant details, sets isApiAccessApproved = true,
   * and sends an approval email with login link (no API key created).
   */
  async approveMerchant(dto: AdminCreateMerchantDto) {
    // 1. Find or create user
    let user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          role: 'USER',
          businessName: dto.businessName,
          websiteUrl: dto.websiteUrl,
          contactName: dto.name,
          phoneNumber: dto.phoneNumber,
          isMerchant: true,
          isApiAccessApproved: true,
        },
      });
    } else {
      // Update existing user with merchant details and approve access
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          businessName: dto.businessName,
          websiteUrl: dto.websiteUrl,
          contactName: dto.name,
          phoneNumber: dto.phoneNumber,
          isMerchant: true,
          isApiAccessApproved: true,
        },
      });
    }

    // 2. Ensure Merchant record exists
    let merchant = await this.prisma.merchant.findUnique({
      where: { userId: user.id },
    });

    if (!merchant) {
      merchant = await this.prisma.merchant.create({
        data: {
          userId: user.id,
          name: dto.businessName,
          natureOfBusiness: 'Fintech', // Default or could be in DTO
          websiteUrl: dto.websiteUrl,
          status: MerchantStatus.VERIFIED,
        },
      });
    }

    // 3. Determine provider for this merchant (default from env, allow override via dto)
    const defaultProvider = this.fiatProviderService.getDefaultProvider();
    const provider: ProviderType =
      (dto.provider as ProviderType) || defaultProvider;

    // Idempotency: skip account creation if the merchant already has one.
    const existingBankAccount =
      await this.prisma.merchantBankAccount.findUnique({
        where: { merchantId: merchant.id },
      });

    if (!existingBankAccount) {
      let merchantAccount;
      try {
        if (provider === ProviderType.PULSE_MFB) {
          merchantAccount = await this.fiatProviderService.createAccount(
            {
              customerName: dto.name || dto.businessName,
              customerPhone: dto.phoneNumber,
              reference: user.id,
            },
            provider,
          );
        } else {
          merchantAccount = await this.safeHavenService.createSubAccount({
            phoneNumber: dto.phoneNumber,
            emailAddress: dto.email,
            externalReference: user.id,
            identityType: dto.identityType,
            identityNumber: dto.identityNumber,
            callbackUrl: this.configService.get<string>('SH_WEBHOOK_URL') || '',
          });
        }

        // 4. Register or create a new MerchantBankAccount entry
        const accountData = merchantAccount?.data || merchantAccount;
        const bankCode =
          provider === ProviderType.PULSE_MFB
            ? accountData?.bank_code || '090713'
            : accountData?.bankCode || '090286';
        const accountNumber =
          accountData?.accountNumber || accountData?.account_number;
        const accountName =
          accountData?.accountName || accountData?.account_name;
        const bankName =
          provider === ProviderType.PULSE_MFB
            ? accountData?.bank_name || 'PayRep MFB'
            : accountData?.bankName || 'MFB Microfinance Bank';

        await this.prisma.merchantBankAccount.upsert({
          where: { merchantId: merchant.id },
          update: {
            bankCode,
            accountNumber,
            accountName,
            bankName,
            metadata: accountData,
          },
          create: {
            merchantId: merchant.id,
            fiatProvider: provider as any,
            bankCode,
            accountNumber,
            accountName,
            bankName,
            metadata: accountData,
          },
        });
      } catch (error) {
        this.logger.error(`Failed to create ${provider} sub-account:`, error);
      }
    } else {
      this.logger.log(
        `Merchant ${merchant.id} already has a bank account; skipping account creation`,
      );
    }

    // 2. Send "API Access Approved" Email
    try {
      const loginUrl = `${this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001'}/merchant/login`;

      await this.mailService.sendMerchantStatusUpdateEmail(
        dto.email,
        dto.name,
        'APPROVED', // Status
        loginUrl,
      );
    } catch (error) {
      this.logger.error('Failed to send merchant approval email:', error);
    }

    return {
      user,
      message: 'API access approved successfully',
    };
  }

  // ... (rest of the file)

  async getMerchantBankAccount(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        bankAccount: true,
        subAccounts: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    return {
      merchantId: merchant.id,
      bankAccount: merchant.bankAccount ?? null,
      subAccounts: merchant.subAccounts ?? [],
    };
  }

  async getMerchantSubAccounts(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    return this.prisma.merchantSubAccount.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Fetch live SafeHaven transactions for a specific merchant sub-account.
   */
  async getMerchantSubAccountTransactions(
    merchantId: string,
    subAccountId: string,
    params: {
      page?: number;
      limit?: number;
      status?: string;
      fromDate?: string;
      toDate?: string;
    },
  ) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    const subAccount = await this.prisma.merchantSubAccount.findFirst({
      where: { id: subAccountId, merchantId },
    });

    if (!subAccount) {
      throw new NotFoundException('Sub-account not found for this merchant');
    }

    const meta = (subAccount.metadata as any) || {};
    const safehavenId = subAccount.safehavenId || meta._id || meta.id;

    if (!safehavenId) {
      throw new BadRequestException('Sub-account has no SafeHaven ID');
    }

    const result = await this.fiatProviderService.getTransfers({
      accountId: safehavenId,
      page: Math.max(0, (params.page ?? 1) - 1),
      limit: params.limit,
      status: params.status,
      fromDate: params.fromDate,
      toDate: params.toDate,
    });

    return this.formatSafeHavenTransfers(result);
  }

  async createMerchantBankAccount(
    merchantId: string,
    dto: {
      accountType: 'Savings' | 'Current';
      suffix: string;
      provider?: string;
    },
  ) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { bankAccount: true },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    if (merchant.status !== 'VERIFIED') {
      throw new BadRequestException(
        'Merchant must be verified before creating a bank account',
      );
    }

    if (merchant.bankAccount) {
      this.logger.log(
        `Merchant ${merchantId} already has a bank account; returning existing account`,
      );
      return merchant.bankAccount;
    }

    const provider: ProviderType = dto.provider
      ? (dto.provider as ProviderType)
      : ProviderType.SAFEHAVEN;

    let merchantAccount;
    if (provider === ProviderType.PULSE_MFB) {
      merchantAccount = await this.fiatProviderService.createAccount(
        {
          customerName: merchant.name,
          customerPhone: '',
          customerEmail: '',
          reference: merchantId,
        },
        provider,
      );
    } else {
      merchantAccount = await this.safeHavenService.createAccount({
        accountType: dto.accountType,
        suffix: dto.suffix,
      });
    }

    const data = merchantAccount?.data ?? merchantAccount;

    if (!data?.accountNumber && !data?.account_number) {
      throw new BadRequestException(
        'MFB did not return an account number. Please try again.',
      );
    }

    const accountNumber = data?.accountNumber ?? data?.account_number;
    const bankCode =
      data?.bankCode ??
      data?.bank_code ??
      (provider === ProviderType.SAFEHAVEN ? '090286' : '090713');
    const bankName =
      data?.bankName ??
      data?.bank_name ??
      (provider === ProviderType.SAFEHAVEN ? 'Safe Haven MFB' : 'PayRep MFB');
    const accountName = data?.accountName ?? data?.account_name ?? null;

    const bankAccount = await this.prisma.merchantBankAccount.upsert({
      where: { merchantId },
      create: {
        merchantId,
        fiatProvider: provider as any,
        bankCode,
        accountNumber,
        accountName,
        bankName,
        metadata: data,
      },
      update: {
        bankCode,
        accountNumber,
        accountName,
        bankName,
        metadata: data,
      },
    });

    this.logger.log(
      `Created MFB account for merchant ${merchantId}: ${data?.accountNumber}`,
    );

    return bankAccount;
  }

  /**
   * Get all users
   *
   * Retrieves a list of all users.
   *
   * @param page - Page number (default: 1)
   * @param limit - Items per page (default: 10)
   * @returns Paginated list of users
   */
  async getUsers(
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { businessName: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { walletAddress: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search } },
      ];
    }

    if (status === 'active') {
      where.suspended = false;
    } else if (status === 'suspended') {
      where.suspended = true;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          phoneNumber: true,
          walletAddress: true,
          role: true,
          isMerchant: true,
          suspended: true,
          suspendedAt: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user details by ID
   *
   * @param userId - User ID
   * @returns User object with all details
   */
  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        walletAddress: true,
        role: true,
        isMerchant: true,
        isOTCEnabled: true,
        suspended: true,
        suspendedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Update Merchant Status (Admin only)
   */
  async updateMerchantStatus(merchantId: string, dto: UpdateMerchantStatusDto) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    const updateData: any = {
      status: dto.status,
    };

    if (dto.status === MerchantStatus.VERIFIED) {
      updateData.verifiedAt = new Date();
    } else if (dto.status === MerchantStatus.REJECTED) {
      updateData.rejectionReason = dto.rejectionReason;
    }

    const updatedMerchant = await this.prisma.merchant.update({
      where: { id: merchantId },
      data: updateData,
    });

    // Automatically update user's merchant status and API access approval if verified
    if (dto.status === MerchantStatus.VERIFIED) {
      await this.prisma.user.update({
        where: { id: merchant.userId },
        data: {
          isMerchant: true,
          isApiAccessApproved: true,
        },
      });
    }

    // Send email notification to the merchant
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: merchant.userId },
        select: { email: true, businessName: true },
      });

      if (user && user.email) {
        const loginUrl = `${this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001'}/merchant/login`;
        await this.mailService.sendMerchantStatusUpdateEmail(
          user.email,
          user.businessName || user.email, // Use business name if available, else email
          dto.status,
          loginUrl,
          dto.rejectionReason,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to send merchant status update email for merchant ${merchantId}:`,
        error,
      );
    }

    return {
      merchant: updatedMerchant,
      message: `Merchant status updated to ${dto.status}`,
    };
  }

  /**
   * Update user's merchant-related flags
   * @param userId - User ID
   * @param body - Partial object containing isMerchant and/or isApiAccessApproved
   */
  async updateUserMerchantFlags(
    userId: string,
    body: {
      isMerchant?: boolean;
      isApiAccessApproved?: boolean;
      isOTCEnabled?: boolean;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const data: any = {};
    if (typeof body.isMerchant === 'boolean') data.isMerchant = body.isMerchant;
    if (typeof body.isApiAccessApproved === 'boolean')
      data.isApiAccessApproved = body.isApiAccessApproved;
    if (typeof body.isOTCEnabled === 'boolean')
      data.isOTCEnabled = body.isOTCEnabled;

    if (Object.keys(data).length === 0) {
      return { message: 'No changes provided' };
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    // Send OTC enablement email if enabled
    if (body.isOTCEnabled === true) {
      try {
        await this.mailService.sendOtcEnablementEmail(
          updated.email,
          updated.contactName || updated.businessName || updated.email,
        );
      } catch (error) {
        this.logger.error('Failed to send OTC enablement email:', error);
      }
    }

    return { user: updated, message: 'User merchant flags updated' };
  }

  /**
   * Create a new user (admin)
   */
  async createUser(body: any) {
    const existing = await this.prisma.user.findUnique({
      where: { email: body.email },
    });
    if (existing) {
      throw new ConflictException('User already exists');
    }

    const data: any = {
      email: body.email,
      phoneNumber: body.phoneNumber || null,
      walletAddress: body.walletAddress || null,
      role: body.role || 'USER',
      businessName: body.businessName || null,
      websiteUrl: body.websiteUrl || null,
      contactName: body.contactName || null,
      isMerchant:
        typeof body.isMerchant === 'boolean' ? body.isMerchant : false,
      isApiAccessApproved:
        typeof body.isApiAccessApproved === 'boolean'
          ? body.isApiAccessApproved
          : false,
    };

    if (body.password) {
      const hashed = await bcrypt.hash(body.password, 10);
      data.password = hashed;
    } else {
      data.password = '';
    }

    const user = await this.prisma.user.create({ data });

    return { user, message: 'User created' };
  }

  /**
   * Update user's profile (admin)
   */
  async updateUserProfile(userId: string, body: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const data: any = {};
    const fields = [
      'email',
      'phoneNumber',
      'walletAddress',
      'businessName',
      'websiteUrl',
      'contactName',
      'role',
    ];
    for (const f of fields) {
      if (typeof body[f] !== 'undefined') data[f] = body[f];
    }

    if (typeof body.password === 'string' && body.password.length > 0) {
      data.password = await bcrypt.hash(body.password, 10);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
    });
    return { user: updated, message: 'User profile updated' };
  }

  /**
   * Suspend or unsuspend a user account
   * - when suspending: revoke API keys and disable API access and merchant flag
   */
  async suspendUser(userId: string, suspend: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (suspend) {
      // revoke api keys
      await this.prisma.apiKey.updateMany({
        where: { userId },
        data: { isActive: false },
      });

      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          suspended: true,
          suspendedAt: new Date(),
          isApiAccessApproved: false,
          isMerchant: false,
        },
      });
      return { user: updated, message: 'User suspended' };
    } else {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          suspended: false,
          suspendedAt: null,
        },
      });
      return {
        user: updated,
        message: 'User unsuspended',
      };
    }
  }

  /**
   * Get all API keys (admin only)
   *
   * @param page - Page number (default: 1)
   * @param limit - Items per page (default: 10)
   * @returns Paginated list of all API keys
   */
  async getAllApiKeys(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [apiKeys, total] = await Promise.all([
      this.prisma.apiKey.findMany({
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.apiKey.count(),
    ]);

    return {
      apiKeys,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get API keys summary statistics (admin only)
   *
   * @returns Summary statistics for all API keys
   */
  async getApiKeysSummary() {
    const [totalKeys, activeKeys, totalRequests] = await Promise.all([
      this.prisma.apiKey.count(),
      this.prisma.apiKey.count({
        where: { isActive: true },
      }),
      this.prisma.apiRequestLog.count(),
    ]);

    const averageRequestsPerKey = totalKeys > 0 ? totalRequests / totalKeys : 0;

    return {
      totalKeys,
      activeKeys,
      totalRequests,
      averageRequestsPerKey: Math.round(averageRequestsPerKey),
    };
  }

  /**
   * Get API keys analytics over time (admin only)
   *
   * @param period - Time period for grouping (daily, weekly, monthly)
   * @returns Time-series analytics data
   */
  async getApiKeysAnalytics(period: 'daily' | 'weekly' | 'monthly' = 'daily') {
    // Determine date range based on period
    const now = new Date();
    let startDate: Date;
    let dateFormat: string;

    switch (period) {
      case 'weekly':
        startDate = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000); // 12 weeks
        dateFormat = 'YYYY-"W"IW'; // ISO week format
        break;
      case 'monthly':
        startDate = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000); // 12 months
        dateFormat = 'YYYY-MM';
        break;
      case 'daily':
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days
        dateFormat = 'YYYY-MM-DD';
        break;
    }

    // Query API request logs grouped by date
    const requestLogs = await this.prisma.$queryRaw<
      Array<{
        date: string;
        request_count: bigint;
        unique_keys: bigint;
        success_count: bigint;
        error_count: bigint;
      }>
    >`
      SELECT 
        TO_CHAR(created_at, ${dateFormat}) as date,
        COUNT(*)::bigint as request_count,
        COUNT(DISTINCT api_key_id)::bigint as unique_keys,
        COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END)::bigint as success_count,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END)::bigint as error_count
      FROM api_request_logs
      WHERE created_at >= ${startDate}
      GROUP BY 1
      ORDER BY date ASC
    `;

    return requestLogs.map((log) => ({
      date: log.date,
      requestCount: Number(log.request_count),
      uniqueKeys: Number(log.unique_keys),
      successCount: Number(log.success_count),
      errorCount: Number(log.error_count),
      successRate:
        Number(log.request_count) > 0
          ? Math.round(
              (Number(log.success_count) / Number(log.request_count)) * 100,
            )
          : 0,
    }));
  }

  /**
   * Get all OTC transactions (admin only)
   *
   * Fetches paginated OTC transactions with optional filters.
   *
   * @param page - Page number (default: 1)
   * @param limit - Items per page (default: 10)
   * @param status - Filter by transaction status
   * @param startDate - Filter by start date
   * @param endDate - Filter by end date
   * @param search - Search by reference or ID
   * @returns Paginated list of OTC transactions
   */
  async getOtcTransactions(
    page: number = 1,
    limit: number = 10,
    status?: string,
    startDate?: string,
    endDate?: string,
    search?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (status) {
      where.status = status as any;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        // Set to the end of the day
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { id: search.match(/^[0-9a-fA-F-]{36}$/) ? search : undefined },
      ];
    }

    const [transactions, total] = await Promise.all([
      this.prisma.otcTransaction.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: { email: true, contactName: true, businessName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.otcTransaction.count({ where }),
    ]);

    return {
      transactions: transactions.map((t) => ({
        ...t,
        userEmail: t.user?.email,
        userName: t.user?.contactName || t.user?.businessName,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all transactions (admin only)
   *
   * Fetches all onramp, offramp, and swap transactions across the platform.
   *
   * @param page - Page number (default: 1)
   * @param limit - Items per page (default: 10)
   * @returns Paginated list of all transactions
   */
  async getAllTransactions(
    page: number = 1,
    limit: number = 10,
    status?: string,
    type?: string,
    search?: string,
  ) {
    return this.transactionsService.getAllTransactions(
      page,
      limit,
      status,
      type,
      search,
    );
  }

  /**
   * Get transaction summary statistics (admin only)
   *
   * Calculates platform-wide volume, success rate, and average value.
   *
   * @returns Summary statistics for all transactions
   */
  async getTransactionsSummary(
    period: 'today' | '7d' | '30d' | '90d' | 'all' = 'all',
  ) {
    return this.transactionsService.getTransactionsSummary(period);
  }

  /**
   * Get Indicative Price for OTC Swap (Admin proxy for 0x /price)
   *
   * @param sellToken - Address of the token to sell
   * @param buyToken - Address of the token to buy
   * @param sellAmount - Amount to sell in base units
   * @param takerAddress - (Optional) Wallet address executing the trade
   */
  async getOtcSwapPrice(
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    takerAddress?: string,
    chainId: string = '8453',
  ) {
    if (!sellToken || !buyToken || !sellAmount) {
      throw new ConflictException(
        'sellToken, buyToken, and sellAmount are required',
      );
    }

    return this.zeroExService.getPrice(
      sellToken,
      buyToken,
      sellAmount,
      chainId,
      takerAddress,
    );
  }

  /**
   * Get Firm Quote for OTC Swap (Admin proxy for 0x /quote)
   *
   * @param sellToken - Address of the token to sell
   * @param buyToken - Address of the token to buy
   * @param sellAmount - Amount to sell in base units
   * @param takerAddress - Wallet address executing the trade
   */
  async getOtcSwapQuote(
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    takerAddress: string,
    chainId: string = '8453',
  ) {
    if (!sellToken || !buyToken || !sellAmount || !takerAddress) {
      throw new ConflictException(
        'sellToken, buyToken, sellAmount, and takerAddress are required',
      );
    }

    return this.zeroExService.getQuote(
      sellToken,
      buyToken,
      sellAmount,
      chainId,
      takerAddress,
    );
  }

  /**
   * Get transaction analytics over time (admin only)
   *
   * @param period - Time period for grouping (daily, weekly, monthly)
   * @returns Time-series analytics data
   */
  async getTransactionsAnalytics(
    period: 'daily' | 'weekly' | 'monthly' = 'daily',
  ) {
    return this.transactionsService.getTransactionsAnalytics(period);
  }

  async getTransferLogs(
    page: number = 1,
    limit: number = 10,
    transactionId?: string,
    startDate?: string,
    endDate?: string,
    status?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (transactionId) {
      where.transactionId = transactionId;
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.safeHavenStablestackLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.safeHavenStablestackLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTransferLogByTransactionId(transactionId: string) {
    const [logs, onramp, offramp, merchantOnramp, merchantOfframp, otc] =
      await Promise.all([
        this.prisma.safeHavenStablestackLog.findMany({
          where: { transactionId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.onrampTransaction.findUnique({
          where: { id: transactionId },
          include: {
            user: { select: { id: true, email: true, phoneNumber: true } },
          },
        }),
        this.prisma.offrampTransaction.findUnique({
          where: { id: transactionId },
          include: {
            user: { select: { id: true, email: true, phoneNumber: true } },
          },
        }),
        this.prisma.merchantOnrampTransaction.findUnique({
          where: { id: transactionId },
          include: {
            merchant: {
              include: {
                user: { select: { id: true, email: true, phoneNumber: true } },
              },
            },
          },
        }),
        this.prisma.merchantOfframpTransaction.findUnique({
          where: { id: transactionId },
          include: {
            merchant: {
              include: {
                user: { select: { id: true, email: true, phoneNumber: true } },
              },
            },
          },
        }),
        this.prisma.otcTransaction.findUnique({
          where: { id: transactionId },
          include: {
            user: { select: { id: true, email: true, phoneNumber: true } },
          },
        }),
      ]);

    if (!logs.length) {
      throw new NotFoundException(
        'No transfer logs found for this transaction',
      );
    }

    let transaction: any = null;
    let user: any = null;

    if (onramp) {
      transaction = { ...onramp, _type: 'onramp' };
      user = onramp.user;
    } else if (offramp) {
      transaction = { ...offramp, _type: 'offramp' };
      user = offramp.user;
    } else if (merchantOnramp) {
      transaction = { ...merchantOnramp, _type: 'merchant_onramp' };
      user = merchantOnramp.merchant?.user;
    } else if (merchantOfframp) {
      transaction = { ...merchantOfframp, _type: 'merchant_offramp' };
      user = merchantOfframp.merchant?.user;
    } else if (otc) {
      transaction = { ...otc, _type: 'otc' };
      user = otc.user;
    }

    return {
      logs,
      transaction,
      user,
    };
  }

  async getAuditLogs(
    merchantId?: string,
    action?: string,
    page = 1,
    limit = 50,
  ) {
    const where: Record<string, unknown> = {};
    if (merchantId) where.merchantId = merchantId;
    if (action) where.action = action;

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.merchantAuditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.merchantAuditLog.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  /**
   * Fetch live transactions for a sub-account directly from SafeHaven.
   * Admin-only — bypasses local DB and queries the provider.
   */
  async getSubAccountTransactions(
    accountId: string,
    params: {
      page?: number;
      limit?: number;
      status?: string;
      fromDate?: string;
      toDate?: string;
    },
  ) {
    const result = await this.fiatProviderService.getTransfers({
      accountId,
      page: Math.max(0, (params.page ?? 1) - 1),
      limit: params.limit,
      status: params.status,
      fromDate: params.fromDate,
      toDate: params.toDate,
    });

    return this.formatSafeHavenTransfers(result);
  }

  /**
   * Strip SafeHaven internals and return only what the frontend needs.
   */
  private formatSafeHavenTransfers(result: any) {
    const raw = result?.data ?? result?.transfers ?? result;
    const pagination = result?.pagination ?? {};

    const transfers = Array.isArray(raw)
      ? raw.map((t: any) => ({
          id: t._id,
          amount: t.amount,
          status: t.status,
          type: t.type,
          narration: t.narration,
          creditAccountNumber: t.creditAccountNumber,
          creditAccountName: t.creditAccountName,
          debitAccountNumber: t.debitAccountNumber,
          debitAccountName: t.debitAccountName,
          fees: t.fees ?? 0,
          vat: t.vat ?? 0,
          stampDuty: t.stampDuty ?? 0,
          responseCode: t.responseCode,
          responseMessage: t.responseMessage,
          provider: t.provider,
          paymentReference: t.paymentReference,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        }))
      : [];

    return {
      data: transfers,
      pagination: {
        page: Number(pagination.page ?? 0) + 1,
        limit: Number(pagination.limit ?? 20),
        total: pagination.total ?? transfers.length,
        totalPages: pagination.pages ?? 1,
      },
    };
  }
}
