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
import * as crypto from 'crypto';

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

    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Try JWT authentication first
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwtResult = await this.jwtAuthGuard.canActivate(context);
        if (jwtResult === true || (jwtResult as any) === true) {
          return true;
        }
        // If it returns a Promise, await it
        if (jwtResult instanceof Promise) {
          const result = await jwtResult;
          if (result) return true;
        }
      } catch (error) {
        // JWT failed, try API key
      }
    }

    // Try API key authentication
    const apiKey =
      request.headers['x-api-key'] ||
      request.headers['authorization']?.replace('Bearer ', '') ||
      request.headers['authorization']?.replace('ApiKey ', '');

    if (apiKey && typeof apiKey === 'string') {
      if (apiKey.startsWith('sk_live_')) {
        // This is an API key
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

