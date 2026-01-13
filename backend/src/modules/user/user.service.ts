import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ApiKeysService } from '../api-keys/api-keys.service';

/**
 * User Service
 * 
 * Handles user-related operations including:
 * - User profile management
 * - API key creation for approved merchants
 */
@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeysService: ApiKeysService,
  ) { }

  /**
   * Get user profile
   * 
   * Retrieves the authenticated user's profile information.
   * 
   * @param userId - User ID from authenticated request
   * @returns User profile
   */
  async getProfile(userId: string) {
    console.log(`[UserService] Fetching profile for ID: ${userId}`);

    // Try to find in User table first
    let profile = await this.prisma.user.findUnique({
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

    if (profile) {
      console.log(`[UserService] Found profile in User table for ID: ${userId}`);
    }

    // If not found, try to find in Admin table
    if (!profile) {
      console.log(`[UserService] Not found in User table, checking Admin table for ID: ${userId}`);
      const admin = await this.prisma.admin.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (admin) {
        console.log(`[UserService] Found profile in Admin table for ID: ${userId}`);
        // Map Admin to a profile-like structure with ADMIN role
        profile = {
          id: admin.id,
          email: admin.email,
          phoneNumber: null,
          walletAddress: null,
          role: 'ADMIN',
          createdAt: admin.createdAt,
          updatedAt: admin.updatedAt,
        };
      }
    }

    if (!profile) {
      console.error(`[UserService] Profile NOT FOUND in either table for ID: ${userId}`);
      throw new NotFoundException(`Profile not found for ID: ${userId}`);
    }

    return profile;
  }

  /**
   * Get user's API keys
   * 
   * @param userId - User ID
   * @returns List of user's API keys
   */
  async getUserApiKeys(userId: string) {
    return this.prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        keyPrefix: true,
        name: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Create API key for user
   * 
   * Only allowed if user has isApiAccessApproved = true
   * 
   * @param userId - User ID
   * @param dto - API key creation data
   * @returns Created API key (key shown only once)
   */
  async createApiKey(userId: string, dto: any) {
    // Check if user has API access approved
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isApiAccessApproved: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isApiAccessApproved) {
      throw new ForbiddenException('API access not approved. Please contact admin for approval.');
    }

    // Create API key using ApiKeysService
    return this.apiKeysService.createApiKey(userId, dto);
  }

  /**
   * Get user's API key statistics
   * 
   * @param userId - User ID
   * @returns API key usage statistics
   */
  async getUserApiKeyStats(userId: string) {
    const [totalKeys, activeKeys, totalRequests, lastRequest] = await Promise.all([
      this.prisma.apiKey.count({
        where: { userId },
      }),
      this.prisma.apiKey.count({
        where: { userId, isActive: true },
      }),
      this.prisma.apiRequestLog.count({
        where: { userId },
      }),
      this.prisma.apiRequestLog.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      totalKeys,
      activeKeys,
      totalRequests,
      lastRequestAt: lastRequest?.createdAt || null,
    };
  }

  /**
   * Get user's API key analytics over time
   * 
   * @param userId - User ID
   * @param period - Time period for grouping (daily, weekly, monthly)
   * @returns Time-series analytics data
   */
  async getUserApiKeyAnalytics(
    userId: string,
    period: 'daily' | 'weekly' | 'monthly' = 'daily',
  ) {
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

    // Query API request logs for this user grouped by date
    const requestLogs = await this.prisma.$queryRaw<
      Array<{
        date: string;
        request_count: bigint;
        success_count: bigint;
        error_count: bigint;
      }>
    >`
      SELECT 
        TO_CHAR(created_at, ${dateFormat}) as date,
        COUNT(*)::bigint as request_count,
        COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END)::bigint as success_count,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END)::bigint as error_count
      FROM api_request_logs
      WHERE user_id = ${userId}::uuid
        AND created_at >= ${startDate}
      GROUP BY 1
      ORDER BY date ASC
    `;

    return requestLogs.map((log) => ({
      date: log.date,
      requestCount: Number(log.request_count),
      successCount: Number(log.success_count),
      errorCount: Number(log.error_count),
      successRate:
        Number(log.request_count) > 0
          ? Math.round((Number(log.success_count) / Number(log.request_count)) * 100)
          : 0,
    }));
  }
}

