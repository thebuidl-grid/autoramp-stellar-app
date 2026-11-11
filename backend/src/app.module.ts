import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, RouterModule } from '@nestjs/core';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';
import { validationSchema } from './config/env.validation';
import { SwapModule } from './modules/swap/swap.module';
import { RampModule } from './modules/ramp/ramp.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { AdminModule } from './modules/admin/admin.module';
import { RatesModule } from './modules/rates/rates.module';
import { TransactionsModule } from './modules/admin/transactions/transactions.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { CloudinaryModule } from './modules/cloudinary/cloudinary.module';
import { MailModule } from './modules/mail/mail.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { SharedModule } from './shared/shared.module';
import { BridgeModule } from './modules/bridge/bridge.module';
import { MiscModule } from './modules/misc/misc.module';
import { OtcModule } from './modules/otc/otc.module';
import { PulseMfbModule } from './modules/pulsemfb/pulsemfb.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { VasModule } from './modules/vas/vas.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './common/services/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema,
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'short',
          ttl: 60000, // 1 minute
          limit: 10, // 10 requests per minute
        },
        {
          name: 'medium',
          ttl: 600000, // 10 minutes
          limit: 100, // 100 requests per 10 minutes
        },
        {
          name: 'long',
          ttl: 3600000, // 1 hour
          limit: 1000, // 1000 requests per hour
        },
      ],
      // Fallback message if CustomThrottlerGuard is bypassed; the guard
      // itself throws a structured 429 with retryAfter (see guards/custom-throttler.guard.ts).
      errorMessage:
        'Rate limit exceeded. Too many requests, please try again later.',
    }),
    RouterModule.register([
      {
        path: 'admin',
        module: AdminModule,
        children: [
          {
            path: 'transactions',
            module: TransactionsModule,
          },
        ],
      },
    ]),
    DatabaseModule,
    AuthModule,
    UserModule,
    AdminModule,
    BridgeModule,
    SwapModule,
    RampModule,
    WebhookModule,
    MerchantsModule,
    CloudinaryModule,
    MailModule,
    RatesModule,
    SharedModule,
    MiscModule,
    OtcModule,
    PulseMfbModule,
    ProvidersModule,
    VasModule,
    AnalyticsModule,
    AuditModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}
