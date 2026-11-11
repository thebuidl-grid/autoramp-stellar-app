import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { TransactionsModule } from './transactions/transactions.module';
import { MailModule } from '../mail/mail.module';
import { MFBModule } from '../safehaven/safehaven.module';
import { ProvidersModule } from '../providers/providers.module';
import { OtcModule } from '../otc/otc.module';
import { SwapModule } from '../swap/swap.module';
import { DatabaseModule } from '../../database/database.module';

/**
 * Admin Module
 *
 * Provides admin-only functionality including:
 * - User management
 * - API key management
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    TransactionsModule,
    MailModule,
    MFBModule,
    ProvidersModule,
    OtcModule,
    SwapModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
