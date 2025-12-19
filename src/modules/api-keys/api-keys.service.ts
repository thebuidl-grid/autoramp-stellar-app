import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import * as crypto from 'crypto';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

/**
 * API Keys Service
 * 
 * Handles API key generation, validation, and management.
 * API keys are used for public API access by verified users.
 */
@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a new API key for a user
   * 
   * Creates a secure API key that can be used for public API access.
   * 
   * @param userId - User ID
   * @param dto - API key creation data
   * @returns API key object (key is only shown once)
   */
  async createApiKey(userId: string, dto: CreateApiKeyDto) {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate secure API key
    const rawKey = `sk_live_${crypto.randomBytes(32).toString('hex')}`;
    const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 12); // First 12 chars for display

    // Save API key to database
    const apiKey = await this.prisma.apiKey.create({
      data: {
        userId,
        key: hashedKey,
        keyPrefix,
        name: dto.name || null,
      },
      select: {
        id: true,
        keyPrefix: true,
        name: true,
        isActive: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    // Return the raw key (only shown once)
    return {
      ...apiKey,
      key: rawKey, // Only time the full key is shown
      message: 'Please save this API key securely. It will not be shown again.',
    };
  }

  /**
   * Validate API key and return user
   * 
   * @param apiKey - Raw API key from request
   * @returns User object if key is valid
   */
  async validateApiKey(apiKey: string): Promise<any> {
    if (!apiKey || !apiKey.startsWith('sk_live_')) {
      return null;
    }

    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    const apiKeyRecord = await this.prisma.apiKey.findUnique({
      where: { key: hashedKey },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (
      !apiKeyRecord ||
      !apiKeyRecord.isActive ||
      !apiKeyRecord.user
    ) {
      return null;
    }

    // Check if key has expired
    if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
      return null;
    }

    // Update last used timestamp
    await this.prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    });

    return apiKeyRecord.user;
  }

  /**
   * Get all API keys for a user
   * 
   * @param userId - User ID
   * @returns List of API keys (without full key)
   */
  async getUserApiKeys(userId: string) {
    const apiKeys = await this.prisma.apiKey.findMany({
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

    return apiKeys;
  }

  /**
   * Revoke (deactivate) an API key
   * 
   * @param userId - User ID
   * @param apiKeyId - API key ID
   */
  async revokeApiKey(userId: string, apiKeyId: string) {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        id: apiKeyId,
        userId,
      },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    await this.prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { isActive: false },
    });

    return { message: 'API key revoked successfully' };
  }
}

