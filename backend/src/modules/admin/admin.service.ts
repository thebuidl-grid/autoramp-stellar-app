import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { PrismaService } from '../../database/prisma.service';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { CreateApiKeyDto } from '../api-keys/dto/create-api-key.dto';
import { CreateMerchantDto } from './dto/create-merchant.dto';

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
  private readonly resend: Resend;
  private readonly fromEmail: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeysService: ApiKeysService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is required in environment variables');
    }
    this.resend = new Resend(apiKey);
    this.fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';
  }

  // ... (existing methods until getUserById)

  /**
   * Create Merchant and API Key (Admin only)
   * 
   * Creates or updates a user with merchant details, generates an API key,
   * and sends an approval email with login link.
   */
  async createMerchant(dto: CreateMerchantDto) {
    // 1. Find or create user
    let user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          role: 'USER', // Merchant is just a user with extra fields for now
          businessName: dto.businessName,
          websiteUrl: dto.websiteUrl,
          contactName: dto.name,
        },
      });
    } else {
      // Update existing user with merchant details
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          businessName: dto.businessName,
          websiteUrl: dto.websiteUrl,
          contactName: dto.name,
        },
      });
    }

    // 2. Create API Key
    const apiKeyDto: CreateApiKeyDto = {
      name: `${dto.businessName} API Key`,
      businessName: dto.businessName,
      trafficEstimate: dto.trafficEstimate,
      requestLimit: dto.requestLimit,
    };
    const apiKey = await this.apiKeysService.createApiKey(user.id, apiKeyDto);

    // 3. Send "Merchant Approved" Email
    try {
      const loginUrl = `${this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001'}/merchant/login`;

      await this.resend.emails.send({
        from: this.fromEmail,
        to: dto.email,
        subject: 'Your Business Account is Approved - AutoRamp',
        html: `
          <!DOCTYPE html>
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background-color: #000; color: #fff; padding: 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">AutoRamp</h1>
              </div>
              <div style="background-color: #f9f9f9; padding: 30px; margin-top: 20px;">
                <h2 style="color: #000; margin-top: 0;">Welcome, ${dto.name}!</h2>
                <p>Your business <strong>${dto.businessName}</strong> has been approved for AutoRamp API access.</p>
                <p>An API key has been generated for you:</p>
                <div style="background-color: #eee; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 16px; margin: 20px 0; word-break: break-all;">
                  ${apiKey.key}
                </div>
                <p><strong>keep this safe!</strong> You won't be able to see the full key again.</p>
                <p>You can manage your integration and view transaction logs via your Merchant Dashboard.</p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${loginUrl}" style="background-color: #000; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: bold;">Access Dashboard</a>
                </div>
                
                <p style="color: #666; font-size: 14px;">Or paste this link in your browser: <br>${loginUrl}</p>
              </div>
            </body>
          </html>
        `,
      });
    } catch (error) {
      console.error('Failed to send merchant approval email:', error);
      // We don't throw here to avoid rolling back the API key creation
    }

    return {
      user,
      apiKey: apiKey.key, // Return the key so admin can see it once if needed, though mostly for email
      keyId: apiKey.id
    };
  }

  // ... (rest of the file)


  /**
   * Get all users
   *
   * Retrieves a list of all users.
   *
   * @param page - Page number (default: 1)
   * @param limit - Items per page (default: 10)
   * @returns Paginated list of users
   */
  async getUsers(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          phoneNumber: true,
          walletAddress: true,
          role: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.user.count(),
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
   * Create API key for a user (admin only)
   *
   * @param userId - User ID to create API key for
   * @param dto - API key creation data
   * @returns API key object (key is only shown once)
   */
  async createApiKeyForUser(userId: string, dto: CreateApiKeyDto) {
    return this.apiKeysService.createApiKey(userId, dto);
  }

  /**
   * Get all API keys for a user (admin only)
   *
   * @param userId - User ID
   * @returns List of API keys
   */
  async getUserApiKeys(userId: string) {
    return this.apiKeysService.getUserApiKeys(userId);
  }

  /**
   * Revoke an API key (admin only)
   *
   * @param apiKeyId - API key ID
   */
  async revokeApiKey(apiKeyId: string) {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id: apiKeyId },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    return this.apiKeysService.revokeApiKey(apiKey.userId, apiKeyId);
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
          ? Math.round((Number(log.success_count) / Number(log.request_count)) * 100)
          : 0,
    }));
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
  async getAllTransactions(page: number = 1, limit: number = 10, status?: string) {
    const skip = (page - 1) * limit;
    const where = status ? { status: status as any } : {};

    // Get total counts for pagination
    const [onrampTotal, offrampTotal, swapTotal] = await Promise.all([
      this.prisma.onrampTransaction.count({ where }),
      this.prisma.offrampTransaction.count({ where }),
      this.prisma.swapTransaction.count({ where }),
    ]);
    const total = onrampTotal + offrampTotal + swapTotal;

    // Fetch all transactions (we'll combine and paginate them)
    const [allOnramp, allOfframp, allSwap] = await Promise.all([
      this.prisma.onrampTransaction.findMany({
        where,
        include: {
          user: {
            select: { email: true }
          }
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.offrampTransaction.findMany({
        where,
        include: {
          user: {
            select: { email: true }
          }
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.swapTransaction.findMany({
        where,
        include: {
          user: {
            select: { email: true }
          }
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Combine and sort all transactions by date descending
    const allTransactions = [
      ...allOnramp.map((tx) => ({ ...tx, _type: 'onramp' as const, userEmail: tx.user.email })),
      ...allOfframp.map((tx) => ({ ...tx, _type: 'offramp' as const, userEmail: tx.user.email })),
      ...allSwap.map((tx) => ({ ...tx, _type: 'swap' as const, userEmail: tx.user.email })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply pagination
    const paginatedTransactions = allTransactions.slice(skip, skip + limit);

    // Separate back into respective types for the frontend to handle if needed
    const onramp = paginatedTransactions
      .filter((tx) => tx._type === 'onramp')
      .map(({ _type, user, ...tx }) => tx);
    const offramp = paginatedTransactions
      .filter((tx) => tx._type === 'offramp')
      .map(({ _type, user, ...tx }) => tx);
    const swap = paginatedTransactions
      .filter((tx) => tx._type === 'swap')
      .map(({ _type, user, ...tx }) => tx);

    return {
      onramp,
      offramp,
      swap,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get transaction summary statistics (admin only)
   * 
   * Calculates platform-wide volume, success rate, and average value.
   * 
   * @returns Summary statistics for all transactions
   */
  async getTransactionsSummary() {
    const [onramp, offramp, swap] = await Promise.all([
      this.prisma.onrampTransaction.findMany({
        select: { amount: true, status: true },
      }),
      this.prisma.offrampTransaction.findMany({
        select: { amount: true, status: true },
      }),
      this.prisma.swapTransaction.findMany({
        select: { fromAmount: true, status: true },
      }),
    ]);

    const onrampTx = onramp.map(tx => ({ amount: Number(tx.amount), status: tx.status }));
    const offrampTx = offramp.map(tx => ({ amount: Number(tx.amount), status: tx.status }));
    const swapTx = swap.map(tx => ({ amount: Number(tx.fromAmount), status: tx.status }));

    const allTx = [...onrampTx, ...offrampTx, ...swapTx];

    const completedOnramp = onrampTx.filter(tx => tx.status === 'COMPLETED');
    const completedOfframp = offrampTx.filter(tx => tx.status === 'COMPLETED');
    const completedSwap = swapTx.filter(tx => tx.status === 'COMPLETED');

    const totalCompletedVolume = [...completedOnramp, ...completedOfframp, ...completedSwap].reduce((sum, tx) => sum + tx.amount, 0);
    const totalCompletedCount = completedOnramp.length + completedOfframp.length + completedSwap.length;

    const notCompleted = allTx.filter(tx => tx.status !== 'COMPLETED');
    const unsuccessfulVolume = notCompleted.reduce((sum, tx) => sum + tx.amount, 0);

    return {
      totalVolume: totalCompletedVolume,
      totalCount: allTx.length,
      successRate: allTx.length > 0 ? Math.round((totalCompletedCount / allTx.length) * 100) : 0,
      averageValue: totalCompletedCount > 0 ? Math.round(totalCompletedVolume / totalCompletedCount) : 0,

      // Breakdown by type (completed only)
      onrampCompletedVolume: completedOnramp.reduce((sum, tx) => sum + tx.amount, 0),
      onrampCompletedCount: completedOnramp.length,
      offrampCompletedVolume: completedOfframp.reduce((sum, tx) => sum + tx.amount, 0),
      offrampCompletedCount: completedOfframp.length,
      swapCompletedVolume: completedSwap.reduce((sum, tx) => sum + tx.amount, 0),
      swapCompletedCount: completedSwap.length,

      // Unsuccessful summary
      unsuccessfulVolume,
      unsuccessfulCount: notCompleted.length,
    };
  }

  /**
   * Get transaction analytics over time (admin only)
   * 
   * @param period - Time period for grouping (daily, weekly, monthly)
   * @returns Time-series analytics data
   */
  async getTransactionsAnalytics(period: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const now = new Date();
    let startDate: Date;
    let dateFormat: string;

    switch (period) {
      case 'weekly':
        startDate = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
        dateFormat = 'YYYY-"W"IW';
        break;
      case 'monthly':
        startDate = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000);
        dateFormat = 'YYYY-MM';
        break;
      case 'daily':
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFormat = 'YYYY-MM-DD';
        break;
    }

    // Since we have three tables, we use a UNION to combine them before grouping
    // This is more performant than fetching everything into memory
    const analytics = await this.prisma.$queryRaw<
      Array<{
        date: string;
        onramp_count: bigint;
        offramp_count: bigint;
        swap_count: bigint;
        total_count: bigint;
      }>
    >`
      SELECT 
        date,
        COUNT(CASE WHEN type = 'onramp' THEN 1 END)::bigint as onramp_count,
        COUNT(CASE WHEN type = 'offramp' THEN 1 END)::bigint as offramp_count,
        COUNT(CASE WHEN type = 'swap' THEN 1 END)::bigint as swap_count,
        COUNT(*)::bigint as total_count
      FROM (
        SELECT TO_CHAR(created_at, ${dateFormat}) as date, 'onramp' as type FROM onramp_transactions WHERE created_at >= ${startDate}
        UNION ALL
        SELECT TO_CHAR(created_at, ${dateFormat}) as date, 'offramp' as type FROM offramp_transactions WHERE created_at >= ${startDate}
        UNION ALL
        SELECT TO_CHAR(created_at, ${dateFormat}) as date, 'swap' as type FROM swap_transactions WHERE created_at >= ${startDate}
      ) as combined_tx
      GROUP BY 1
      ORDER BY date ASC
    `;

    return analytics.map((log) => ({
      date: log.date,
      onrampCount: Number(log.onramp_count),
      offrampCount: Number(log.offramp_count),
      swapCount: Number(log.swap_count),
      totalCount: Number(log.total_count),
    }));
  }
}
