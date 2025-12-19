import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiKeysService } from '../api-keys.service';

/**
 * API Key Guard
 * 
 * Validates API keys from request headers.
 * Looks for API key in 'x-api-key' or 'Authorization' header.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Extract API key from headers
    const apiKey =
      request.headers['x-api-key'] ||
      request.headers['authorization']?.replace('Bearer ', '') ||
      request.headers['authorization']?.replace('ApiKey ', '');

    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException('API key is required');
    }

    // Validate API key
    const user = await this.apiKeysService.validateApiKey(apiKey);

    if (!user) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    // Attach user to request
    request.user = user;
    request.apiKey = apiKey;

    return true;
  }
}

