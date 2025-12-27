import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { CreateApiKeyDto } from '../api-keys/dto/create-api-key.dto';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

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
}

