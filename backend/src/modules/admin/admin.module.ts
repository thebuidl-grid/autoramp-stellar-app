import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { TransactionsModule } from './transactions/transactions.module';

/**
 * Admin Module
 *
 * Provides admin-only functionality including:
 * - User management
 * - API key management
 */
@Module({
  imports: [ApiKeysModule, TransactionsModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
