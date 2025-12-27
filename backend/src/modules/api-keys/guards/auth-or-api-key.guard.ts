import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { JwtAuthGuard } from '../../../modules/auth/guards/jwt-auth.guard';
import { ApiKeysService } from '../api-keys.service';

/**
 * Auth or API Key Guard
 * 
 * Allows authentication via either JWT token or API key.
 * Tries JWT first, then falls back to API key if JWT is not present.
 */
@Injectable()
export class AuthOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly apiKeysService: ApiKeysService,
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
          console.error('JWT authentication error:', error.message || error);
        }
      }
    }

    const apiKey =
      request.headers['x-api-key'] ||
      request.headers['authorization']?.replace('Bearer ', '') ||
      request.headers['authorization']?.replace('ApiKey ', '');

    if (apiKey && typeof apiKey === 'string') {
      if (apiKey.startsWith('sk_live_')) {
        const user = await this.apiKeysService.validateApiKey(apiKey);
        if (user) {
          request.user = user;
          request.apiKey = apiKey;
          return true;
        }
      }
    }

    throw new UnauthorizedException(
      'Authentication required. Please provide a valid JWT token or API key.',
    );
  }
}

