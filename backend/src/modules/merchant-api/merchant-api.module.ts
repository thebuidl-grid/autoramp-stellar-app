import { Module } from '@nestjs/common';
import { MerchantApiController } from './merchant-api.controller';
import { StablestackModule } from '../stablestack/stablestack.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';

/**
 * Merchant API Module
 * 
 * Public API endpoints for merchant integrations.
 * All endpoints require API key authentication.
 */
@Module({
    imports: [StablestackModule, ApiKeysModule],
    controllers: [MerchantApiController],
})
export class MerchantApiModule { }
