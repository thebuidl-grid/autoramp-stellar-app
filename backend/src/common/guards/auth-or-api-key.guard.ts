import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import * as crypto from 'crypto';

/**
 * Auth or API Key Guard
 *
 * Allows authentication via either JWT token or API key.
 * Tries JWT first, then falls back to API key if JWT is not present.
 */
@Injectable()
export class AuthOrApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(AuthOrApiKeyGuard.name);
  constructor(
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwtResult = await this.jwtAuthGuard.canActivate(context);
        if (jwtResult === true) {
          if (request.user) {
            return true;
          }
        }
      } catch (error: any) {
        const statusCode = error?.statusCode || error?.status;
        if (statusCode && statusCode !== 401 && statusCode !== 403) {
          this.logger.error(
            'JWT authentication error:',
            error.message || error,
          );
        }
      }
    }

    const apiKey =
      (request.headers['x-api-key'] as string) ||
      (request.headers['authorization'] as string)?.replace('Bearer ', '') ||
      (request.headers['authorization'] as string)?.replace('ApiKey ', '');

    if (apiKey && typeof apiKey === 'string') {
      try {
        // Check merchant_api_keys first
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
          // Check if the user owning this merchant is suspended
          if (
            merchantKey.merchant.user &&
            merchantKey.merchant.user.suspended
          ) {
            throw new UnauthorizedException('Your account has been suspended');
          }

          // Check if API access is approved on the user record
          if (
            merchantKey.merchant.user &&
            !merchantKey.merchant.user.isApiAccessApproved
          ) {
            throw new UnauthorizedException(
              'API access has not been approved for this account',
            );
          }

          // attach merchant identity to request.user for downstream handlers
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
    }

    throw new UnauthorizedException(
      'Authentication required. Please provide a valid JWT token or API key.',
    );
  }
}
