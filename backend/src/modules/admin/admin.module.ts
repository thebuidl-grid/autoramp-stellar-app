import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { ApiKeysModule } from '../api-keys/api-keys.module';

/**
 * Admin Module
 * 
 * Provides admin-only functionality including:
 * - User management
 * - API key management
 */
@Module({
  imports: [ApiKeysModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}

