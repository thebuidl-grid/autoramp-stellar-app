import { AdminCctpController, AdminSafehavenController } from './safehaven/admin-safehaven.controller';
import { AdminSafehavenService } from './safehaven/admin-safehaven.service';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminBitnobController } from './bitnob/admin-bitnob.controller';
import { AdminTrackerController, AdminWebhooksController } from './tracker/admin-tracker.controller';
import { AdminWebhooksService } from './tracker/admin-webhooks.service';
import { TransactionHealthService } from './tracker/transaction-health.service';
import { TransactionTraceService } from './tracker/transaction-trace.service';
import { TransactionsModule } from './transactions/transactions.module';
import { MailModule } from '../mail/mail.module';
import { MFBModule } from '../safehaven/safehaven.module';
import { ProvidersModule } from '../providers/providers.module';
import { OtcModule } from '../otc/otc.module';
import { SwapModule } from '../swap/swap.module';
import { DatabaseModule } from '../../database/database.module';
import { RampModule } from '../ramp/ramp.module';

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
    RampModule,
  ],
  controllers: [AdminController, AdminBitnobController, AdminTrackerController, AdminWebhooksController, AdminSafehavenController, AdminCctpController],
  providers: [AdminService, TransactionTraceService, TransactionHealthService, AdminWebhooksService, AdminSafehavenService],
  exports: [AdminService],
})
export class AdminModule {}
