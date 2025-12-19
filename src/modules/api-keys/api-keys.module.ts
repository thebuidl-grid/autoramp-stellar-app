import { Module } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeyGuard } from './guards/api-key.guard';
import { KycVerifiedGuard } from './guards/kyc-verified.guard';
import { AuthOrApiKeyGuard } from './guards/auth-or-api-key.guard';
import { ApiLoggingInterceptor } from './interceptors/api-logging.interceptor';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * API Keys Module
 * 
 * Provides API key management and authentication functionality.
 */
@Module({
  controllers: [ApiKeysController],
  providers: [
    ApiKeysService,
    ApiKeyGuard,
    KycVerifiedGuard,
    AuthOrApiKeyGuard,
    ApiLoggingInterceptor,
    JwtAuthGuard,
  ],
  exports: [
    ApiKeysService,
    ApiKeyGuard,
    KycVerifiedGuard,
    AuthOrApiKeyGuard,
    ApiLoggingInterceptor,
  ],
})
export class ApiKeysModule {}

