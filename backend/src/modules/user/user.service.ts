import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * User Service
 *
 * Handles user-related operations including:
 * - User profile management
 * - API key creation for approved merchants
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get user profile
   *
   * Retrieves the authenticated user's profile information.
   *
   * @param userId - User ID from authenticated request
   * @returns User profile
   */
  async getProfile(userId: string) {
    this.logger.debug(`Fetching profile for ID: ${userId}`);

    // Try to find in User table first
    let profile = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        walletAddress: true,
        isMerchant: true,
        isOTCEnabled: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // If not found, try to find in Admin table
    if (!profile) {
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
        // Map Admin to a profile-like structure with ADMIN role
        profile = {
          id: admin.id,
          email: admin.email,
          phoneNumber: null,
          walletAddress: null,
          isMerchant: false,
          isOTCEnabled: false,
          role: 'ADMIN',
          createdAt: admin.createdAt,
          updatedAt: admin.updatedAt,
        };
      }
    }

    if (!profile) {
      throw new NotFoundException(`Profile not found for ID: ${userId}`);
    }

    return profile;
  }

}
