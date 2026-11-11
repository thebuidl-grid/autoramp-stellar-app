import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import * as crypto from 'crypto';

/**
 * API Key Only Guard
 *
 * Only allows authentication via API key. Rejects JWT tokens.
 * Use this for server-to-server integrations.
 */
@Injectable()
export class ApiKeyOnlyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyOnlyGuard.name);
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const apiKey =
      (request.headers['x-api-key'] as string) ||
      (request.headers['authorization'] as string)?.replace('ApiKey ', '');

    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException(
        'API key required. Send via x-api-key header or Authorization: ApiKey <key>.',
      );
    }

    // Reject JWT tokens (they start with eyJ)
    if (apiKey.startsWith('eyJ')) {
      throw new UnauthorizedException(
        'This endpoint requires an API key, not a JWT token.',
      );
    }

    try {
      const hashed = crypto.createHash('sha256').update(apiKey).digest('hex');
      const merchantKey = await this.prisma.merchantApiKey.findFirst({
        where: { key: hashed },
        include: {
          merchant: {
            include: { user: true },
          },
        },
      });

      if (
        merchantKey &&
        merchantKey.isActive &&
        (!merchantKey.expiresAt || merchantKey.expiresAt > new Date()) &&
        merchantKey.merchant &&
        merchantKey.merchant.status === 'VERIFIED'
      ) {
        if (merchantKey.merchant.user && merchantKey.merchant.user.suspended) {
          throw new UnauthorizedException('Your account has been suspended');
        }

        if (
          merchantKey.merchant.user &&
          !merchantKey.merchant.user.isApiAccessApproved
        ) {
          throw new UnauthorizedException(
            'API access has not been approved for this account',
          );
        }

        request.user = {
          id: merchantKey.merchant.id,
          isMerchant: true,
        } as any;
        (request as any).apiKey = apiKey;
        (request as any).merchantApiKey = apiKey;
        return true;
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      this.logger.error('Error validating merchant API key:', err);
    }

    throw new UnauthorizedException('Invalid or expired API key');
  }
}
